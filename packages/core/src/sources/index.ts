import type { SourceType } from "@db"

import { htmlAdapter } from "./html"
import { redditAdapter } from "./reddit"
import { rssAdapter } from "./rss"
import type { SourceAdapter } from "./types"

const ADAPTERS: Record<SourceType, SourceAdapter> = {
  RSS: rssAdapter,
  HTML: htmlAdapter,
  REDDIT: redditAdapter,
}

/**
 * The map is keyed by the Prisma enum, so adding a source type to the schema
 * without writing an adapter is a compile error rather than a runtime surprise.
 */
export function getSourceAdapter(type: SourceType): SourceAdapter {
  return ADAPTERS[type]
}

export { htmlAdapter, parseHtml } from "./html"
export { buildListingUrl, mapListing, redditAdapter } from "./reddit"
export { parseFeed, rssAdapter } from "./rss"
export { absoluteUrl, decodeEntities, parseDate, stripHtml } from "./text"
export {
  SourceConfigError,
  type FetchedItem,
  type SourceAdapter,
  type SourceFetchContext,
} from "./types"
