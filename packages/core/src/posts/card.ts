import { TelegramApiError, type TelegramClient } from "../telegram/client"
import { buildModerationKeyboard } from "../telegram/markup"
import { renderPostCaption, renderPostMessage } from "./render"

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

export type SendCardOptions = {
  /** Called when Telegram refuses the image and the text card is used instead. */
  onPhotoRejected?: (error: TelegramApiError) => void
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

  if (post.mediaUrl) {
    try {
      const message = await telegram.sendPhoto(
        chatId,
        post.mediaUrl,
        renderCardBody(post, target, true),
        { replyMarkup }
      )

      return { chatId, messageId: message.message_id, usedPhoto: true }
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

  return { chatId, messageId: message.message_id, usedPhoto: false }
}

export type PlacedPost = CardPost & {
  moderationChatId: bigint | null
  moderationMessageId: number | null
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

  const asCaption = Boolean(post.mediaUrl)
  const rendered = renderCardBody(post, target, asCaption)
  const body = note ? `${rendered}\n\n${note}` : rendered
  const options = note ? {} : { replyMarkup: buildModerationKeyboard(post.id) }

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
