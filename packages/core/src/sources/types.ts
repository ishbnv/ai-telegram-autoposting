import type { SourceType } from "@db"

/** A raw item as it comes out of a source, before any LLM touches it. */
export type FetchedItem = {
  /** Stable per source; this is what deduplication keys off. */
  externalId: string
  title: string
  url: string
  summary?: string
  content?: string
  imageUrl?: string
  author?: string
  publishedAt?: Date
}

export type SourceFetchContext = {
  url: string
  /** Adapter-specific, validated by the adapter itself. */
  config: unknown
  proxyUrl?: string
  signal?: AbortSignal
}

export interface SourceAdapter {
  readonly type: SourceType
  fetch(context: SourceFetchContext): Promise<FetchedItem[]>
}

export class SourceConfigError extends Error {
  override readonly name = "SourceConfigError"
}
