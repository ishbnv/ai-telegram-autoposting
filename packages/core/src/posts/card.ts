import { TelegramApiError, type TelegramClient } from "../telegram/client"
import {
  buildModerationKeyboard,
  type InlineKeyboardMarkup,
} from "../telegram/markup"
import { extractLinks, renderLinkAppendix, renderSourceNote } from "./links"
import {
  PARAGRAPH_SPACER,
  renderPostCaption,
  renderPostMessage,
  renderRichPostMessage,
} from "./render"

/**
 * Structural, not Prisma types: the worker builds cards from rows it has just
 * created and the bot from rows it has just read, and neither should have to
 * hand over a whole model to render one message.
 */
export type CardPost = {
  id: string
  text: string
  mediaUrl: string | null
  sourceName: string
  sourceUrl: string
}

export type CardTarget = {
  footerTemplate: string
}

export type PlacedCard = {
  chatId: bigint
  messageId: number
  /**
   * Whether the card went out as a rich message. Stored on the post, because
   * an edit must repeat the same choice: `editMessageText` takes `text` or
   * `rich_message` and never both, and the bot edits cards from a different
   * process than the worker that sent them.
   */
  isRich: boolean
  /**
   * False when the image was refused and a text card went out instead. The
   * caller must clear `mediaUrl` in that case: every later edit picks
   * `editMessageCaption` vs `editMessageText` from it, and publishing picks
   * `sendPhoto` vs `sendMessage` the same way — so a stale `mediaUrl` means
   * every one of those calls targets the wrong method and fails.
   */
  usedPhoto: boolean
  /**
   * Whether the image survived into what was actually sent. False when Telegram
   * refused it and the message went out without it — the caller must then clear
   * `mediaUrl`, or the publish that follows will offer the same dead URL again
   * and be refused the same way.
   */
  mediaKept: boolean
}

/** A blank line separates blocks in the source; this separates them on screen. */
const BLOCK_GAP = `\n\n${PARAGRAPH_SPACER}\n\n`

export function renderCardBody(
  post: CardPost,
  target: CardTarget,
  asCaption: boolean
): string {
  const input = {
    text: post.text,
    footerTemplate: target.footerTemplate,
    source: { name: post.sourceName, url: post.sourceUrl },
  }

  return asCaption ? renderPostCaption(input) : renderPostMessage(input)
}

/**
 * The rich body of a card: the post exactly as it will appear in the channel,
 * then a rule, then everything a moderator needs and a reader never sees.
 *
 * That second half is the whole reason a moderator can still do their job. In
 * the plain path the model's output is escaped and therefore inert; rendered,
 * a link shows its label and hides its destination, and the label is the part
 * an injected instruction gets to choose.
 */
export function renderRichCardBody(post: CardPost, target: CardTarget): string {
  const source = { name: post.sourceName, url: post.sourceUrl }

  const body = renderRichPostMessage({
    text: post.text,
    footerTemplate: target.footerTemplate,
    source,
    mediaUrl: post.mediaUrl,
  })

  /**
   * Everything a moderator needs and a reader never sees, below a rule. The
   * source belongs here unconditionally: whether it is credited in the channel
   * is the operator's decision, expressed through the footer template and the
   * prompt, but approving a draft without knowing where it came from is not a
   * decision anyone should be asked to make.
   */
  const notes = [
    renderSourceNote(source),
    renderLinkAppendix(extractLinks(body)),
  ].filter(Boolean)

  // Spacer-joined, not blank-line-joined: these are adjacent blocks like any
  // others, and Telegram renders adjacent blocks flush. The body gets this
  // treatment inside the renderer; the notes are assembled after it, so they
  // have to ask for it themselves.
  return `${body}\n\n---\n\n${notes.join(BLOCK_GAP)}`
}

export type SendCardOptions = {
  /** Called when Telegram refuses the image and the text card is used instead. */
  onPhotoRejected?: (error: TelegramApiError) => void
  /** Called when the rich send fails and the plain card is used instead. */
  onRichRejected?: (error: TelegramApiError) => void
}

/**
 * Puts a draft in front of a human. This is the only way a post moves forward:
 * nothing downstream runs until one of these buttons is pressed.
 */
export async function sendModerationCard(
  telegram: TelegramClient,
  post: CardPost,
  target: CardTarget & { moderationChatId: bigint },
  options: SendCardOptions = {}
): Promise<PlacedCard> {
  const replyMarkup = buildModerationKeyboard(post.id)
  const chatId = target.moderationChatId

  // Rich first: the card is a preview, so it has to be the shape the channel
  // will get. The media rides inside the Markdown here rather than as a photo
  // caption, because `editMessageCaption` has no rich counterpart.
  try {
    const message = await telegram.sendRichMessage(
      chatId,
      { markdown: renderRichCardBody(post, target) },
      { replyMarkup }
    )

    return {
      chatId,
      messageId: message.message_id,
      usedPhoto: false,
      isRich: true,
      mediaKept: Boolean(post.mediaUrl),
    }
  } catch (error) {
    if (!(error instanceof TelegramApiError)) {
      throw error
    }

    /**
     * Telegram fetches the image itself and refuses the whole message when it
     * cannot — `RICH_MESSAGE_PHOTO_NO_MEDIA_FOUND` for a URL that 404s. Falling
     * straight through to the plain card would throw away the headings, lists
     * and links over one dead thumbnail, so the article is offered once more
     * without it. Only then does the plain path get a turn.
     */
    if (post.mediaUrl) {
      try {
        const message = await telegram.sendRichMessage(
          chatId,
          { markdown: renderRichCardBody({ ...post, mediaUrl: null }, target) },
          { replyMarkup }
        )

        options.onPhotoRejected?.(error)

        return {
          chatId,
          messageId: message.message_id,
          usedPhoto: false,
          isRich: true,
          mediaKept: false,
        }
      } catch (retryError) {
        if (!(retryError instanceof TelegramApiError)) {
          throw retryError
        }

        options.onRichRejected?.(retryError)
      }
    } else {
      // A chat that cannot take rich messages, or a draft Telegram would not
      // parse. Neither is worth losing the post over.
      options.onRichRejected?.(error)
    }
  }

  if (post.mediaUrl) {
    try {
      const message = await telegram.sendPhoto(
        chatId,
        post.mediaUrl,
        renderCardBody(post, target, true),
        { replyMarkup }
      )

      return {
        chatId,
        messageId: message.message_id,
        usedPhoto: true,
        isRich: false,
        mediaKept: true,
      }
    } catch (error) {
      // Telegram fetches the image itself and rejects anything it cannot read.
      // A broken preview URL must not cost us the whole post.
      if (!(error instanceof TelegramApiError)) {
        throw error
      }

      options.onPhotoRejected?.(error)
    }
  }

  const message = await telegram.sendMessage(
    chatId,
    renderCardBody(post, target, false),
    { replyMarkup }
  )

  return {
    chatId,
    messageId: message.message_id,
    usedPhoto: false,
    isRich: false,
    mediaKept: false,
  }
}

export type PlacedPost = CardPost & {
  moderationChatId: bigint | null
  moderationMessageId: number | null
  /** How the card was sent. An edit has to match it. */
  richCard: boolean
}

/**
 * Rewrites a card in place. Passing no note keeps the buttons — that is the
 * redraw after an edit. Passing one drops them and appends it, which is how a
 * handled card is closed so it cannot be acted on twice.
 */
export async function updateModerationCard(
  telegram: TelegramClient,
  post: PlacedPost,
  target: CardTarget,
  note?: string,
  /**
   * Overrides what the card is left with. Without one the rule stays as it
   * was: a note closes the card and no note redraws it with the full set —
   * which is wrong for a schedule, where the note has to coexist with the
   * button that undoes it.
   */
  keyboard?: InlineKeyboardMarkup
): Promise<boolean> {
  if (post.moderationChatId === null || post.moderationMessageId === null) {
    return false
  }

  const replyMarkup =
    keyboard ?? (note ? undefined : buildModerationKeyboard(post.id))
  const options = replyMarkup ? { replyMarkup } : {}

  if (post.richCard) {
    const rich = renderRichCardBody(post, target)

    await telegram.editRichMessage(
      post.moderationChatId,
      post.moderationMessageId,
      { markdown: note ? `${rich}${BLOCK_GAP}${note}` : rich },
      options
    )

    return true
  }

  const asCaption = Boolean(post.mediaUrl)
  const rendered = renderCardBody(post, target, asCaption)
  const body = note ? `${rendered}\n\n${note}` : rendered

  if (asCaption) {
    await telegram.editMessageCaption(
      post.moderationChatId,
      post.moderationMessageId,
      body,
      options
    )
  } else {
    await telegram.editMessageText(
      post.moderationChatId,
      post.moderationMessageId,
      body,
      options
    )
  }

  return true
}
