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
  /**
   * Application-only OAuth for Reddit, from the environment. Absent when the
   * operator has not registered an app, in which case the adapter falls back to
   * the public endpoints Reddit no longer serves — and says so plainly.
   */
  reddit?: { clientId: string; clientSecret: string }
}

export interface SourceAdapter {
  readonly type: SourceType
  fetch(context: SourceFetchContext): Promise<FetchedItem[]>
}

export class SourceConfigError extends Error {
  override readonly name = "SourceConfigError"
}
