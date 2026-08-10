const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

const MAX_CODE_POINT = 0x10ffff

/**
 * Turns a numeric reference into a character, or null when it does not name
 * one. `String.fromCodePoint` throws a RangeError above U+10FFFF, and the value
 * comes from a remote feed — one `&#1114112;` used to take a source down for
 * good, because the throw escaped the adapter and every retry re-read the same
 * item. Lone surrogates and NUL are rejected too: the first are not characters,
 * and the second cannot be stored in a Postgres text column.
 */
function fromCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code <= 0 || code > MAX_CODE_POINT) {
    return null
  }

  if (code >= 0xd800 && code <= 0xdfff) {
    return null
  }

  return String.fromCodePoint(code)
}

/** Decodes the named entities that show up in feeds, plus numeric references. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return fromCodePoint(Number.parseInt(entity.slice(2), 16)) ?? match
    }

    if (entity.startsWith("#")) {
      return fromCodePoint(Number.parseInt(entity.slice(1), 10)) ?? match
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/**
 * Feed descriptions routinely carry markup. The LLM gets plain text: tags are
 * noise that costs tokens and invites the model to imitate the markup.
 */
export function stripHtml(value: string): string {
  return decodeEntities(
    dropBlocks(dropBlocks(value, "script"), "style")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Removes `<tag>…</tag>` blocks in a single left-to-right pass.
 *
 * The obvious regex — `<(script|style)[^>]*>[\s\S]*?<\/\1>` — is quadratic on
 * hostile input: every opener with no matching close makes the lazy group scan
 * to the end of the string. A feed with 60 000 unclosed `<script`s over 4.6 MB
 * measured 71 seconds, which blocks the worker's whole event loop. Scanning
 * with indexOf is linear no matter how the input is shaped.
 */
function dropBlocks(value: string, tag: string): string {
  const opener = `<${tag}`
  const closer = `</${tag}`
  const lower = value.toLowerCase()

  let out = ""
  let cursor = 0

  for (;;) {
    const start = lower.indexOf(opener, cursor)
    if (start === -1) {
      return out + value.slice(cursor)
    }

    out += value.slice(cursor, start)

    const end = lower.indexOf(closer, start + opener.length)
    if (end === -1) {
      // Unclosed: HTML would treat the remainder as content of the block, and
      // so do we. Nothing usable follows an unterminated script anyway.
      return `${out} `
    }

    const after = lower.indexOf(">", end)
    out += " "
    cursor = after === -1 ? lower.length : after + 1
  }
}

export function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** Resolves a possibly relative href. Returns undefined for unusable values. */
export function absoluteUrl(
  href: string | undefined,
  baseUrl: string
): string | undefined {
  if (!href) {
    return undefined
  }

  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return undefined
  }
}
