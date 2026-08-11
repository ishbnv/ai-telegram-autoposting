import { TelegramApiError, type TelegramClient } from "../telegram/client"
import { buildModerationKeyboard } from "../telegram/markup"
import { extractLinks, renderLinkAppendix } from "./links"
import {
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
}

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
 * followed by the list of link targets it contains.
 *
 * The appendix is the whole reason a moderator can still do their job here. In
 * the plain path the model's output is escaped and therefore inert; rendered,
 * a link shows its label and hides its destination, and the label is the part
 * an injected instruction gets to choose.
 */
export function renderRichCardBody(post: CardPost, target: CardTarget): string {
  const body = renderRichPostMessage({
    text: post.text,
    footerTemplate: target.footerTemplate,
    source: { name: post.sourceName, url: post.sourceUrl },
    mediaUrl: post.mediaUrl,
  })

  const appendix = renderLinkAppendix(extractLinks(body))

  return appendix ? `${body}\n\n---\n\n${appendix}` : body
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
    }
  } catch (error) {
    if (!(error instanceof TelegramApiError)) {
      throw error
    }

    // A chat that cannot take rich messages, or a draft Telegram would not
    // parse. Neither is worth losing the post over.
    options.onRichRejected?.(error)
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
  note?: string
): Promise<boolean> {
  if (post.moderationChatId === null || post.moderationMessageId === null) {
    return false
  }

  const options = note ? {} : { replyMarkup: buildModerationKeyboard(post.id) }

  if (post.richCard) {
    const rich = renderRichCardBody(post, target)

    await telegram.editRichMessage(
      post.moderationChatId,
      post.moderationMessageId,
      { markdown: note ? `${rich}\n\n${note}` : rich },
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
