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
  /** The model's output. Markdown, reduced to plain text before escaping. */
  text: string
  footerTemplate: string
  source: PostSource
  limit?: number
}

/**
 * Reduces the Rich Markdown a draft is written in to readable plain text.
 *
 * Every draft is Markdown now, so the plain path is only reached when a rich
 * send was refused. Escaping that text unchanged would put `## Heading` and
 * `**bold**` in front of a reader as literal characters — a fallback that looks
 * more broken than the flat text this replaced. Structure that has no plain
 * equivalent is dropped rather than approximated: a table rendered as pipes is
 * noise, and the sentence around it still reads.
 */
export function stripMarkdown(value: string): string {
  return (
    value
      // Fenced blocks keep their contents; the fence and language go.
      .replaceAll(/^[ \t]*```[^\n]*\n?/gm, "")
      // Images carry nothing readable once the URL is gone.
      .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, "")
      // A link becomes "label (url)", so the destination stays visible.
      .replaceAll(
        /\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g,
        (_, label: string, url: string) => (label ? `${label} (${url})` : url)
      )
      .replaceAll(/^[ \t]*#{1,6}[ \t]+/gm, "")
      .replaceAll(/^[ \t]*>[ \t]?/gm, "")
      .replaceAll(/^[ \t]*[-*+][ \t]+/gm, "• ")
      .replaceAll(/^[ \t]*\|.*\|[ \t]*$/gm, "")
      .replaceAll(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "")
      .replaceAll(/(\*\*|__|~~|==|\|\|)(.+?)\1/g, "$2")
      .replaceAll(
        /(?<![A-Za-z0-9])[*_](\S(?:.*?\S)?)[*_](?![A-Za-z0-9])/g,
        "$1"
      )
      .replaceAll(/`([^`\n]*)`/g, "$1")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim()
  )
}

/**
 * Produces the HTML body sent to Telegram. When the post does not fit, the body
 * is trimmed and the footer is kept: attribution is the part that must survive.
 */
export function renderPostMessage(input: RenderPostInput): string {
  const limit = input.limit ?? TELEGRAM_MESSAGE_LIMIT
  const footer = renderFooter(input.footerTemplate, input.source)
  const footerLength = footerVisibleLength(input.footerTemplate, input.source)
  const text = stripMarkdown(input.text)

  if (!footer.trim()) {
    return escapeHtml(truncate(text, limit))
  }

  const budget = limit - footerLength - SEPARATOR.length
  const body = truncate(text, Math.max(0, budget))

  return `${escapeHtml(body)}${SEPARATOR}${footer}`
}

/** Same rendering, against the tighter limit that applies to photo captions. */
export function renderPostCaption(
  input: Omit<RenderPostInput, "limit">
): string {
  return renderPostMessage({ ...input, limit: TELEGRAM_CAPTION_LIMIT })
}

export { TELEGRAM_CAPTION_LIMIT, TELEGRAM_MESSAGE_LIMIT }

// ---------------------------------------------------------------------------
// Rich messages
// ---------------------------------------------------------------------------

/** Documented ceiling for `sendRichMessage`, eight times an ordinary message. */
export const TELEGRAM_RICH_MESSAGE_LIMIT = 32_768

const FENCE = "```"
const BLOCK_SEPARATOR = "\n\n"

/**
 * Escapes the characters that would otherwise end a Markdown link early. Only
 * these four matter: the value goes inside `[...](...)`, not into running text,
 * so the usual emphasis characters carry no meaning there.
 */
function escapeLinkPart(value: string): string {
  return value.replace(/[[\]()\\]/g, (match) => `\\${match}`)
}

/** The Markdown counterpart of `renderFooter`. Same placeholders. */
export function renderFooterMarkdown(
  template: string,
  source: PostSource
): string {
  const name = escapeLinkPart(source.name)
  const url = escapeLinkPart(source.url)

  return template
    .replaceAll("{sourceLink}", `[${name}](${url})`)
    .replaceAll("{sourceName}", source.name)
    .replaceAll("{sourceUrl}", source.url)
}

/**
 * Truncates Markdown without leaving it malformed.
 *
 * Cutting mid-document is not like cutting prose: a half-written table row or
 * an unclosed ``` fence is a parse error for the whole message, not a cosmetic
 * blemish, and Telegram answers those with a 400 rather than rendering what it
 * can. So the cut lands on a blank line — a block boundary in every Markdown
 * dialect — and any block left dangling is dropped rather than repaired.
 */
export function truncateMarkdown(value: string, limit: number): string {
  const text = value.trim()
  if (Array.from(text).length <= limit) {
    return text
  }

  const blocks = text.split(/\n{2,}/)
  const kept: string[] = []
  let length = 0

  for (const block of blocks) {
    const addition =
      (kept.length === 0 ? 0 : BLOCK_SEPARATOR.length) +
      Array.from(block).length

    if (length + addition > limit) {
      break
    }

    kept.push(block)
    length += addition
  }

  // An opening fence with no closing one takes the rest of the message with it.
  if (kept.filter((block) => block.includes(FENCE)).length > 0) {
    const fences = kept.join(BLOCK_SEPARATOR).split(FENCE).length - 1
    if (fences % 2 !== 0) {
      kept.pop()
    }
  }

  return kept.join(BLOCK_SEPARATOR).trim()
}

export type RenderRichPostInput = {
  /** The model's output, in the Rich Markdown dialect. Not escaped. */
  text: string
  footerTemplate: string
  source: PostSource
  /** Rendered as a leading image block when present. */
  mediaUrl?: string | null
  limit?: number
}

/**
 * Produces the Markdown body for `sendRichMessage`.
 *
 * Unlike `renderPostMessage` this does not escape the model's output — that is
 * the whole point of the rich path, and it is also why the moderation card
 * lists every link target separately: what a human sees rendered no longer
 * tells them where a link actually goes.
 */
export function renderRichPostMessage(input: RenderRichPostInput): string {
  const limit = input.limit ?? TELEGRAM_RICH_MESSAGE_LIMIT
  const footer = renderFooterMarkdown(input.footerTemplate, input.source)
  const image = input.mediaUrl ? `![](${input.mediaUrl})` : ""

  const overhead =
    (footer.trim() ? Array.from(footer).length + BLOCK_SEPARATOR.length : 0) +
    (image ? Array.from(image).length + BLOCK_SEPARATOR.length : 0)

  const body = truncateMarkdown(input.text, Math.max(0, limit - overhead))

  return [image, body, footer.trim()].filter(Boolean).join(BLOCK_SEPARATOR)
}
