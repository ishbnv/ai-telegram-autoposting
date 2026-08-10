import { describe, expect, it } from "vitest"

import { redditSourceConfigSchema } from "@contracts"

import { buildListingUrl, mapListing } from "./reddit"

const config = redditSourceConfigSchema.parse({})

const listing = {
  data: {
    children: [
      {
        data: {
          name: "t3_abc",
          title: "A post",
          permalink: "/r/GeminiAI/comments/abc/a_post/",
          selftext: "  body text  ",
          author: "someone",
          created_utc: 1786000000,
          preview: {
            images: [
              {
                source: {
                  url: "https://preview.redd.it/x.png?width=1072&amp;format=png",
                },
              },
            ],
          },
        },
      },
      {
        data: {
          name: "t3_sticky",
          title: "Read the rules",
          permalink: "/r/GeminiAI/comments/sticky/rules/",
          stickied: true,
        },
      },
      {
        data: {
          name: "t3_nsfw",
          title: "Adult",
          permalink: "/r/GeminiAI/comments/nsfw/adult/",
          over_18: true,
        },
      },
    ],
  },
}

describe("buildListingUrl", () => {
  it("builds the JSON endpoint from the subreddit URL", () => {
    expect(buildListingUrl("https://www.reddit.com/r/GeminiAI", config)).toBe(
      "https://www.reddit.com/r/GeminiAI/new.json?limit=25"
    )
  })

  it("tolerates a trailing slash", () => {
    expect(buildListingUrl("https://www.reddit.com/r/GeminiAI/", config)).toBe(
      "https://www.reddit.com/r/GeminiAI/new.json?limit=25"
    )
  })

  it("adds the timeframe only for the top listing", () => {
    const top = redditSourceConfigSchema.parse({
      listing: "top",
      timeframe: "week",
    })

    expect(buildListingUrl("https://www.reddit.com/r/x", top)).toContain(
      "t=week"
    )
    expect(
      buildListingUrl(
        "https://www.reddit.com/r/x",
        redditSourceConfigSchema.parse({ listing: "new", timeframe: "week" })
      )
    ).not.toContain("t=week")
  })
})

describe("mapListing", () => {
  const items = mapListing(listing, config)

  it("drops stickied and NSFW posts by default", () => {
    expect(items.map((item) => item.externalId)).toEqual(["t3_abc"])
  })

  it("keeps them when the config asks for them", () => {
    const permissive = redditSourceConfigSchema.parse({
      includeStickied: true,
      includeNsfw: true,
    })

    expect(mapListing(listing, permissive)).toHaveLength(3)
  })

  it("builds an absolute permalink", () => {
    expect(items[0]?.url).toBe(
      "https://www.reddit.com/r/GeminiAI/comments/abc/a_post/"
    )
  })

  it("uses the reddit fullname as the dedup key", () => {
    expect(items[0]?.externalId).toBe("t3_abc")
  })

  it("decodes the escaped preview URL, which 404s otherwise", () => {
    expect(items[0]?.imageUrl).toBe(
      "https://preview.redd.it/x.png?width=1072&format=png"
    )
  })

  it("converts the unix timestamp", () => {
    expect(items[0]?.publishedAt?.toISOString()).toBe(
      new Date(1786000000 * 1000).toISOString()
    )
  })

  it("trims the body", () => {
    expect(items[0]?.content).toBe("body text")
  })
})
