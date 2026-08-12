import { redditSourceConfigSchema, type RedditSourceConfig } from "@contracts"
import { z } from "zod"

import { fetchJson, HttpError } from "../http/fetch"
import { decodeEntities } from "./text"
import {
  forgetRedditToken,
  redditAccessToken,
  REDDIT_OAUTH_ROOT,
} from "./redditAuth"
import { requestOptions } from "./request"
import {
  SourceConfigError,
  type FetchedItem,
  type SourceAdapter,
  type SourceFetchContext,
} from "./types"

/**
 * Reddit rejects generic user agents outright, and asks that the string identify
 * the software. See https://support.reddithelp.com/hc/en-us/articles/16160319875092
 */
const USER_AGENT =
  "ai-telegram-autoposting/0.1 (self-hosted; +https://github.com/topics/telegram-bot)"

const listingSchema = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.object({
          name: z.string(),
          title: z.string(),
          permalink: z.string(),
          url: z.string().optional(),
          selftext: z.string().optional(),
          author: z.string().optional(),
          created_utc: z.number().optional(),
          stickied: z.boolean().optional(),
          over_18: z.boolean().optional(),
          preview: z
            .object({
              images: z
                .array(z.object({ source: z.object({ url: z.string() }) }))
                .optional(),
            })
            .optional(),
        }),
      })
    ),
  }),
})

/**
 * Reddit serves the same listing on two hosts. `www` wants `.json` on the path
 * and answers 403 to anything unauthenticated; `oauth` takes a bearer token and
 * no suffix. The subreddit path is carried over from whichever URL the operator
 * typed, so both forms of source URL keep working.
 */
export function buildListingUrl(
  sourceUrl: string,
  config: RedditSourceConfig,
  authenticated = false
): string {
  const base = sourceUrl.replace(/\/+$/, "")
  const url = authenticated
    ? new URL(
        `${new URL(base).pathname.replace(/\/+$/, "")}/${config.listing}`,
        REDDIT_OAUTH_ROOT
      )
    : new URL(`${base}/${config.listing}.json`)
  url.searchParams.set("limit", String(config.limit))

  if (config.listing === "top" && config.timeframe) {
    url.searchParams.set("t", config.timeframe)
  }

  return url.toString()
}

export function mapListing(
  listing: z.infer<typeof listingSchema>,
  config: RedditSourceConfig
): FetchedItem[] {
  return listing.data.children
    .map((child) => child.data)
    .filter((post) => config.includeStickied || !post.stickied)
    .filter((post) => config.includeNsfw || !post.over_18)
    .map((post) => {
      const item: FetchedItem = {
        externalId: post.name,
        title: post.title,
        url: `https://www.reddit.com${post.permalink}`,
      }

      const body = post.selftext?.trim()
      if (body) {
        item.content = body
      }

      if (post.author) {
        item.author = post.author
      }

      if (typeof post.created_utc === "number") {
        item.publishedAt = new Date(post.created_utc * 1000)
      }

      // Preview URLs arrive HTML-escaped and 404 unless decoded.
      const preview = post.preview?.images?.[0]?.source.url
      if (preview) {
        item.imageUrl = decodeEntities(preview)
      }

      return item
    })
}

export const redditAdapter: SourceAdapter = {
  type: "REDDIT",

  async fetch(context: SourceFetchContext): Promise<FetchedItem[]> {
    const parsed = redditSourceConfigSchema.safeParse(context.config ?? {})
    if (!parsed.success) {
      throw new SourceConfigError(
        `Invalid Reddit source config: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; ")}`
      )
    }

    const options = requestOptions(context)
    const credentials = context.reddit

    /**
     * Authenticated when credentials exist, and only then. Reddit's public
     * `.json` endpoints answer 403 now, so the unauthenticated path is kept
     * for nothing but a clear failure and for anyone reaching a mirror.
     */
    const token = credentials
      ? await redditAccessToken(credentials, { request: options })
      : null

    const request = {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }

    const url = buildListingUrl(context.url, parsed.data, token !== null)

    const listing = await fetchJson(url, listingSchema, request, options).catch(
      async (error: unknown) => {
        /**
         * A token can be revoked or expire early, and the cached one would
         * then fail every fetch until the process restarts. One retry with a
         * fresh token costs a request; not doing it costs the source.
         */
        if (credentials && error instanceof HttpError && error.status === 401) {
          forgetRedditToken(credentials.clientId)
          const retry = await redditAccessToken(credentials, {
            request: options,
          })

          return fetchJson(
            url,
            listingSchema,
            {
              headers: { ...request.headers, authorization: `Bearer ${retry}` },
            },
            options
          )
        }

        throw error
      }
    )

    return mapListing(listing, parsed.data)
  },
}
