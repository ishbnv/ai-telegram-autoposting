import { z } from "zod"

import { fetchJson, HttpError, type HttpRequestOptions } from "../http/fetch"
import type { InlineKeyboardMarkup } from "./markup"

const API_ROOT = "https://api.telegram.org"

/** Telegram's own limits. Exceeding either is a 400, not a truncation. */
export const TELEGRAM_MESSAGE_LIMIT = 4096
export const TELEGRAM_CAPTION_LIMIT = 1024

/** Long polling holds the connection open, so it needs headroom over the timeout. */
const LONG_POLL_TIMEOUT_SEC = 30
const LONG_POLL_HTTP_TIMEOUT_MS = (LONG_POLL_TIMEOUT_SEC + 15) * 1000

const chatSchema = z.object({
  // Chat ids exceed int32 but stay well inside the safe integer range.
  id: z.number(),
  type: z.string(),
  title: z.string().optional(),
  username: z.string().optional(),
})

const userSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  username: z.string().optional(),
  first_name: z.string().optional(),
})

const messageSchema = z.object({
  message_id: z.number(),
  chat: chatSchema,
  from: userSchema.optional(),
  date: z.number(),
  text: z.string().optional(),
  caption: z.string().optional(),
  reply_to_message: z
    .object({
      message_id: z.number(),
      text: z.string().optional(),
      // Required to tell one of our own prompts from a message a user wrote to
      // look like one. Without it, authorship cannot be checked at all.
      from: userSchema.optional(),
    })
    .optional(),
})

const callbackQuerySchema = z.object({
  id: z.string(),
  from: userSchema,
  data: z.string().optional(),
  message: messageSchema.optional(),
})

const updateSchema = z.object({
  update_id: z.number(),
  message: messageSchema.optional(),
  channel_post: messageSchema.optional(),
  callback_query: callbackQuerySchema.optional(),
})

export type TelegramMessage = z.infer<typeof messageSchema>
export type TelegramCallbackQuery = z.infer<typeof callbackQuerySchema>
export type TelegramUpdate = z.infer<typeof updateSchema>
export type TelegramUser = z.infer<typeof userSchema>

/** The ok:false half of the envelope, as it arrives on a non-2xx response. */
const telegramErrorSchema = z.object({
  ok: z.literal(false),
  description: z.string().optional(),
  error_code: z.number().optional(),
  parameters: z.object({ retry_after: z.number().optional() }).optional(),
})

function envelope<T extends z.ZodType>(result: T) {
  return z.union([
    z.object({ ok: z.literal(true), result }),
    z.object({
      ok: z.literal(false),
      description: z.string().optional(),
      error_code: z.number().optional(),
      parameters: z.object({ retry_after: z.number().optional() }).optional(),
    }),
  ])
}

export class TelegramApiError extends Error {
  override readonly name = "TelegramApiError"

  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    description: string
  ) {
    super(
      `Telegram ${method} failed (${errorCode ?? "no code"}): ${description}`
    )
  }
}

export type SendMessageOptions = {
  replyMarkup?: InlineKeyboardMarkup
  /** Defaults to HTML, which is what the post renderer produces. */
  parseMode?: "HTML" | "MarkdownV2" | null
  disableWebPagePreview?: boolean
  disableNotification?: boolean
  forceReply?: boolean
  replyToMessageId?: number
}

export type TelegramClientOptions = {
  token: string
  proxyUrl?: string
  /** Overridable so tests can point at a local server. */
  apiRoot?: string
}

export class TelegramClient {
  private readonly apiRoot: string

  constructor(private readonly options: TelegramClientOptions) {
    this.apiRoot = options.apiRoot ?? API_ROOT
  }

  async getMe(): Promise<TelegramUser> {
    return this.call("getMe", {}, userSchema)
  }

  async sendMessage(
    chatId: bigint | number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<TelegramMessage> {
    return this.call(
      "sendMessage",
      {
        chat_id: chatId.toString(),
        text,
        parse_mode:
          options.parseMode === null
            ? undefined
            : (options.parseMode ?? "HTML"),
        link_preview_options: options.disableWebPagePreview
          ? { is_disabled: true }
          : undefined,
        disable_notification: options.disableNotification,
        reply_to_message_id: options.replyToMessageId,
        reply_markup: options.forceReply
          ? { force_reply: true, selective: true }
          : options.replyMarkup,
      },
      messageSchema
    )
  }

  async sendPhoto(
    chatId: bigint | number,
    photoUrl: string,
    caption: string,
    options: SendMessageOptions = {}
  ): Promise<TelegramMessage> {
    return this.call(
      "sendPhoto",
      {
        chat_id: chatId.toString(),
        photo: photoUrl,
        caption,
        parse_mode:
          options.parseMode === null
            ? undefined
            : (options.parseMode ?? "HTML"),
        disable_notification: options.disableNotification,
        reply_markup: options.replyMarkup,
      },
      messageSchema
    )
  }

  async editMessageText(
    chatId: bigint | number,
    messageId: number,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<void> {
    // Telegram returns `true` instead of a Message when editing certain messages.
    await this.call(
      "editMessageText",
      {
        chat_id: chatId.toString(),
        message_id: messageId,
        text,
        parse_mode:
          options.parseMode === null
            ? undefined
            : (options.parseMode ?? "HTML"),
        link_preview_options: options.disableWebPagePreview
          ? { is_disabled: true }
          : undefined,
        reply_markup: options.replyMarkup,
      },
      z.unknown()
    )
  }

  async editMessageCaption(
    chatId: bigint | number,
    messageId: number,
    caption: string,
    options: SendMessageOptions = {}
  ): Promise<void> {
    await this.call(
      "editMessageCaption",
      {
        chat_id: chatId.toString(),
        message_id: messageId,
        caption,
        parse_mode:
          options.parseMode === null
            ? undefined
            : (options.parseMode ?? "HTML"),
        reply_markup: options.replyMarkup,
      },
      z.unknown()
    )
  }

  /** Passing no markup strips the buttons, which is how a handled card is closed. */
  async editMessageReplyMarkup(
    chatId: bigint | number,
    messageId: number,
    replyMarkup?: InlineKeyboardMarkup
  ): Promise<void> {
    await this.call(
      "editMessageReplyMarkup",
      {
        chat_id: chatId.toString(),
        message_id: messageId,
        reply_markup: replyMarkup,
      },
      z.unknown()
    )
  }

  /**
   * Must be called for every callback query, otherwise the client shows a
   * spinner until it times out. `text` surfaces as a toast.
   */
  async answerCallbackQuery(
    callbackQueryId: string,
    options: { text?: string; showAlert?: boolean } = {}
  ): Promise<void> {
    await this.call(
      "answerCallbackQuery",
      {
        callback_query_id: callbackQueryId,
        text: options.text,
        show_alert: options.showAlert,
      },
      z.unknown()
    )
  }

  async getUpdates(
    offset: number,
    allowedUpdates: string[] = ["message", "callback_query"]
  ): Promise<TelegramUpdate[]> {
    return this.call(
      "getUpdates",
      {
        offset,
        timeout: LONG_POLL_TIMEOUT_SEC,
        allowed_updates: allowedUpdates,
      },
      z.array(updateSchema),
      { timeoutMs: LONG_POLL_HTTP_TIMEOUT_MS, retries: 0 }
    )
  }

  private async call<T>(
    method: string,
    payload: Record<string, unknown>,
    resultSchema: z.ZodType<T>,
    overrides: HttpRequestOptions = {}
  ): Promise<T> {
    const url = `${this.apiRoot}/bot${this.options.token}/${method}`

    let response: z.infer<ReturnType<typeof envelope<z.ZodType<T>>>>
    try {
      response = await fetchJson(
        url,
        envelope(resultSchema),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Telegram rejects explicit nulls, so undefined keys are dropped.
          body: JSON.stringify(payload),
        },
        { proxyUrl: this.options.proxyUrl, ...overrides }
      )
    } catch (error) {
      /**
       * Telegram reports API errors with a non-2xx status *and* the ok:false
       * body, so `httpRequest` throws `HttpError` and the envelope branch below
       * is never reached for a real failure. Without this translation
       * `TelegramApiError` is dead code — and so is everything that branches on
       * it, such as the fall back from a photo card to a text one.
       */
      const apiError = this.asApiError(method, error)
      throw this.withoutToken(apiError ?? error)
    }

    if (!response.ok) {
      throw new TelegramApiError(
        method,
        response.error_code,
        response.description ?? "no description"
      )
    }

    return response.result as T
  }

  /** Recovers the Bot API's own error out of a non-2xx response body. */
  private asApiError(method: string, error: unknown): TelegramApiError | null {
    if (!(error instanceof HttpError)) {
      return null
    }

    let body: unknown
    try {
      body = JSON.parse(error.body)
    } catch {
      return new TelegramApiError(
        method,
        error.status,
        error.body.slice(0, 200)
      )
    }

    const parsed = telegramErrorSchema.safeParse(body)
    if (!parsed.success) {
      return new TelegramApiError(
        method,
        error.status,
        error.body.slice(0, 200)
      )
    }

    return new TelegramApiError(
      method,
      parsed.data.error_code ?? error.status,
      parsed.data.description ?? "no description"
    )
  }

  /**
   * Replaces the bot token wherever it appears in an error. The type and stack
   * are preserved so callers can still branch on `instanceof`.
   */
  private withoutToken(error: unknown): unknown {
    if (!(error instanceof Error)) {
      return error
    }

    const scrub = (value: string) =>
      value.split(this.options.token).join("<bot-token>")

    error.message = scrub(error.message)
    if (error.stack) {
      error.stack = scrub(error.stack)
    }

    return error
  }
}
