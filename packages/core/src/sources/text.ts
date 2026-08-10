const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

/** Decodes the handful of entities that actually show up in feeds. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    }

    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
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
    value
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
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
