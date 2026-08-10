import { htmlSourceConfigSchema, type HtmlSourceConfig } from "@contracts"
import * as cheerio from "cheerio"

import { fetchText } from "../http/fetch"
import { absoluteUrl, parseDate, stripHtml } from "./text"
import {
  SourceConfigError,
  type FetchedItem,
  type SourceAdapter,
  type SourceFetchContext,
} from "./types"

export function parseHtml(
  html: string,
  config: HtmlSourceConfig,
  baseUrl: string
): FetchedItem[] {
  const $ = cheerio.load(html)
  const items: FetchedItem[] = []

  $(config.itemSelector).each((_, element) => {
    const node = $(element)

    const title = config.titleSelector
      ? node.find(config.titleSelector).first().text()
      : node.text()

    const linkNode = config.linkSelector
      ? node.find(config.linkSelector).first()
      : node.is("a")
        ? node
        : node.find("a").first()

    const url = absoluteUrl(linkNode.attr(config.linkAttribute), baseUrl)
    const cleanTitle = stripHtml(title)

    // An item without a title or a destination is not something we can post.
    if (!cleanTitle || !url) {
      return
    }

    const item: FetchedItem = {
      externalId: url,
      title: cleanTitle,
      url,
    }

    if (config.summarySelector) {
      const summary = stripHtml(
        node.find(config.summarySelector).first().text()
      )
      if (summary) {
        item.summary = summary
      }
    }

    if (config.imageSelector) {
      const image = absoluteUrl(
        node.find(config.imageSelector).first().attr(config.imageAttribute),
        baseUrl
      )
      if (image) {
        item.imageUrl = image
      }
    }

    if (config.dateSelector) {
      const dateNode = node.find(config.dateSelector).first()
      const published = parseDate(
        dateNode.attr(config.dateAttribute) ?? dateNode.text().trim()
      )
      if (published) {
        item.publishedAt = published
      }
    }

    items.push(item)
  })

  return items
}

export const htmlAdapter: SourceAdapter = {
  type: "HTML",

  async fetch(context: SourceFetchContext): Promise<FetchedItem[]> {
    const parsed = htmlSourceConfigSchema.safeParse(context.config ?? {})
    if (!parsed.success) {
      throw new SourceConfigError(
        `Invalid HTML source config: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`
      )
    }

    const html = await fetchText(
      context.url,
      { headers: { accept: "text/html" } },
      {
        ...(context.proxyUrl ? { proxyUrl: context.proxyUrl } : {}),
        ...(context.signal ? { signal: context.signal } : {}),
      }
    )

    return parseHtml(html, parsed.data, context.url)
  },
}
