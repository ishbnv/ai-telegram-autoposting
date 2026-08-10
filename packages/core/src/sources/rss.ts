import { XMLParser } from "fast-xml-parser"

import { fetchText } from "../http/fetch"
import { absoluteUrl, parseDate, stripHtml } from "./text"
import { requestOptions } from "./request"
import type { FetchedItem, SourceAdapter, SourceFetchContext } from "./types"
import { asList, asRecord, asText, attribute } from "./xml"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  // Numeric-looking guids must stay strings, otherwise "0012" becomes 12 and
  // deduplication silently breaks.
  parseTagValue: false,
  parseAttributeValue: false,
})

/**
 * Handles RSS 2.0, RDF (RSS 1.0) and Atom, because "give me an RSS URL" in
 * practice means any of the three.
 */
export function parseFeed(xml: string, baseUrl?: string): FetchedItem[] {
  const doc = asRecord(parser.parse(xml))
  if (!doc) {
    return []
  }

  const rssChannel = asRecord(asRecord(doc["rss"])?.["channel"])
  if (rssChannel) {
    return asList(rssChannel["item"])
      .map((item) => mapRssItem(item, baseUrl))
      .filter(isItem)
  }

  const rdf = asRecord(doc["rdf:RDF"])
  if (rdf) {
    return asList(rdf["item"])
      .map((item) => mapRssItem(item, baseUrl))
      .filter(isItem)
  }

  const feed = asRecord(doc["feed"])
  if (feed) {
    return asList(feed["entry"])
      .map((entry) => mapAtomEntry(entry, baseUrl))
      .filter(isItem)
  }

  return []
}

function isItem(item: FetchedItem | undefined): item is FetchedItem {
  return item !== undefined
}

function mapRssItem(raw: unknown, baseUrl?: string): FetchedItem | undefined {
  const item = asRecord(raw)
  if (!item) {
    return undefined
  }

  const title = asText(item["title"])
  const link = resolve(asText(item["link"]), baseUrl)
  if (!title || !link) {
    return undefined
  }

  const description = asText(item["description"])
  const encoded = asText(item["content:encoded"])

  return withOptional(
    {
      externalId: asText(item["guid"]) ?? link,
      title: stripHtml(title),
      url: link,
    },
    {
      summary: description ? stripHtml(description) : undefined,
      content: encoded ? stripHtml(encoded) : undefined,
      imageUrl: rssImage(item, baseUrl),
      author: asText(item["author"]) ?? asText(item["dc:creator"]),
      publishedAt: parseDate(
        asText(item["pubDate"]) ?? asText(item["dc:date"])
      ),
    }
  )
}

function mapAtomEntry(raw: unknown, baseUrl?: string): FetchedItem | undefined {
  const entry = asRecord(raw)
  if (!entry) {
    return undefined
  }

  const title = asText(entry["title"])
  const link = resolve(atomLink(entry["link"]), baseUrl)
  if (!title || !link) {
    return undefined
  }

  const summary = asText(entry["summary"])
  const content = asText(entry["content"])

  return withOptional(
    {
      externalId: asText(entry["id"]) ?? link,
      title: stripHtml(title),
      url: link,
    },
    {
      summary: summary ? stripHtml(summary) : undefined,
      content: content ? stripHtml(content) : undefined,
      author: asText(asRecord(entry["author"])?.["name"]),
      publishedAt: parseDate(
        asText(entry["published"]) ?? asText(entry["updated"])
      ),
    }
  )
}

function atomLink(raw: unknown): string | undefined {
  const candidates = asList(raw)

  const alternate = candidates.find(
    (candidate) => attribute(candidate, "rel") === "alternate"
  )
  const fallback = candidates.find(
    (candidate) => attribute(candidate, "rel") === undefined
  )

  const chosen = alternate ?? fallback ?? candidates[0]
  return attribute(chosen, "href") ?? asText(chosen)
}

function rssImage(
  item: Record<string, unknown>,
  baseUrl?: string
): string | undefined {
  const enclosure = asList(item["enclosure"]).find((candidate) => {
    const type = attribute(candidate, "type")
    return type === undefined || type.startsWith("image/")
  })

  const candidate =
    attribute(enclosure, "url") ??
    attribute(asList(item["media:content"])[0], "url") ??
    attribute(asList(item["media:thumbnail"])[0], "url")

  return resolve(candidate, baseUrl)
}

function resolve(
  url: string | undefined,
  baseUrl?: string
): string | undefined {
  if (!url) {
    return undefined
  }

  return baseUrl ? absoluteUrl(url, baseUrl) : url
}

/** Keeps `exactOptionalPropertyTypes`-friendly objects free of undefined keys. */
function withOptional(
  required: Pick<FetchedItem, "externalId" | "title" | "url">,
  optional: Partial<FetchedItem>
): FetchedItem {
  const item: FetchedItem = { ...required }

  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) {
      Object.assign(item, { [key]: value })
    }
  }

  return item
}

export const rssAdapter: SourceAdapter = {
  type: "RSS",

  async fetch(context: SourceFetchContext): Promise<FetchedItem[]> {
    const xml = await fetchText(
      context.url,
      { headers: { accept: "application/rss+xml, application/xml, text/xml" } },
      requestOptions(context)
    )

    return parseFeed(xml, context.url)
  },
}
