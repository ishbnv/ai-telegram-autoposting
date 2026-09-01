import type { PipelineFilters } from "@contracts"

/**
 * Keyword filtering is deliberately dumb: case-insensitive substrings, matched
 * against the title and summary. Anything cleverer (stemming, regex) becomes a
 * support burden the moment a pipeline silently stops matching.
 */
export function matchesFilters(
  item: { title: string; summary?: string | null; content?: string | null },
  filters: PipelineFilters
): boolean {
  /**
   * Length is measured on the body alone, never the title. A long headline over
   * an empty post is exactly the case this is meant to drop, and counting the
   * title would let it through.
   */
  const body = (item.content ?? item.summary ?? "").trim()
  if (filters.minContentLength > 0 && body.length < filters.minContentLength) {
    return false
  }

  const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase()

  const excluded = filters.exclude.some((term) =>
    haystack.includes(term.toLowerCase())
  )
  if (excluded) {
    return false
  }

  // An empty include list means "no opinion", not "match nothing".
  if (filters.include.length === 0) {
    return true
  }

  return filters.include.some((term) => haystack.includes(term.toLowerCase()))
}

/** Reads the JSON column back into the shape the matcher expects. */
export function readFilters(value: unknown): PipelineFilters {
  const raw = (value ?? {}) as Partial<PipelineFilters>

  return {
    include: Array.isArray(raw.include) ? raw.include : [],
    exclude: Array.isArray(raw.exclude) ? raw.exclude : [],
    minContentLength:
      typeof raw.minContentLength === "number" && raw.minContentLength > 0
        ? raw.minContentLength
        : 0,
  }
}
