import {
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MESSAGE_LIMIT,
} from "../telegram/client"

const SEPARATOR = "\n\n"
const ELLIPSIS = "…"

export type PostSource = {
  name: string
  url: string
}

/**
 * Escapes the values that go *into* the template. The template itself is written
 * by the operator in the admin panel and is inserted as-is, so `<b>` in a footer
 * template is a formatting choice rather than an injection.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Supported placeholders:
 * - `{sourceLink}` — the source name as a hyperlink (what you usually want)
 * - `{sourceName}` — plain name
 * - `{sourceUrl}`  — plain URL
 */
export function renderFooter(template: string, source: PostSource): string {
  const name = escapeHtml(source.name)
  const url = escapeHtml(source.url)

  return template
    .replaceAll("{sourceLink}", `<a href="${url}">${name}</a>`)
    .replaceAll("{sourceName}", name)
    .replaceAll("{sourceUrl}", url)
}

/**
 * Telegram counts characters "after entities parsing", so the budget has to be
 * computed against the footer's visible text, not its HTML.
 */
function footerVisibleLength(template: string, source: PostSource): number {
  const plain = template
    .replaceAll("{sourceLink}", source.name)
    .replaceAll("{sourceName}", source.name)
    .replaceAll("{sourceUrl}", source.url)

  return Array.from(plain).length
}

export function truncate(value: string, limit: number): string {
  const characters = Array.from(value)
  if (characters.length <= limit) {
    return value
  }

  if (limit <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, Math.max(0, limit))
  }

  const slice = characters.slice(0, limit - ELLIPSIS.length).join("")
  const lastBreak = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"))

  // Only snap to a word boundary if that does not throw away most of the text.
  const cut = lastBreak > slice.length * 0.6 ? slice.slice(0, lastBreak) : slice

  return `${cut.trimEnd()}${ELLIPSIS}`
}

export type RenderPostInput = {
  /** The model's output, plain text. */
  text: string
  footerTemplate: string
  source: PostSource
  limit?: number
}

/**
 * Produces the HTML body sent to Telegram. When the post does not fit, the body
 * is trimmed and the footer is kept: attribution is the part that must survive.
 */
export function renderPostMessage(input: RenderPostInput): string {
  const limit = input.limit ?? TELEGRAM_MESSAGE_LIMIT
  const footer = renderFooter(input.footerTemplate, input.source)
  const footerLength = footerVisibleLength(input.footerTemplate, input.source)

  if (!footer.trim()) {
    return escapeHtml(truncate(input.text.trim(), limit))
  }

  const budget = limit - footerLength - SEPARATOR.length
  const body = truncate(input.text.trim(), Math.max(0, budget))

  return `${escapeHtml(body)}${SEPARATOR}${footer}`
}

/** Same rendering, against the tighter limit that applies to photo captions. */
export function renderPostCaption(
  input: Omit<RenderPostInput, "limit">
): string {
  return renderPostMessage({ ...input, limit: TELEGRAM_CAPTION_LIMIT })
}

export { TELEGRAM_CAPTION_LIMIT, TELEGRAM_MESSAGE_LIMIT }
