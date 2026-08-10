import { describe, expect, it } from "vitest"

import { parseFeed } from "./rss"

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example</title>
    <item>
      <title>First &amp; best</title>
      <link>/posts/first</link>
      <guid>0012</guid>
      <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
      <content:encoded>Full body here</content:encoded>
      <pubDate>Tue, 05 Aug 2026 10:00:00 GMT</pubDate>
      <dc:creator>Jane</dc:creator>
      <enclosure url="/img/cover.png" type="image/png" />
    </item>
    <item>
      <title>No link here</title>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom entry</title>
    <link rel="edit" href="https://example.com/edit/1" />
    <link rel="alternate" href="https://example.com/posts/1" />
    <id>tag:example.com,2026:1</id>
    <summary>A summary</summary>
    <published>2026-08-05T10:00:00Z</published>
    <author><name>Ada</name></author>
  </entry>
</feed>`

describe("parseFeed (RSS 2.0)", () => {
  const items = parseFeed(RSS, "https://example.com/feed.xml")

  it("skips items with no usable link", () => {
    expect(items).toHaveLength(1)
  })

  it("resolves relative links against the feed URL", () => {
    expect(items[0]?.url).toBe("https://example.com/posts/first")
  })

  it("keeps a numeric guid as a string so dedup keys stay stable", () => {
    expect(items[0]?.externalId).toBe("0012")
  })

  it("decodes entities in the title", () => {
    expect(items[0]?.title).toBe("First & best")
  })

  it("strips markup out of the description", () => {
    expect(items[0]?.summary).toBe("Hello world")
  })

  it("prefers content:encoded for the body", () => {
    expect(items[0]?.content).toBe("Full body here")
  })

  it("reads dc:creator when there is no author tag", () => {
    expect(items[0]?.author).toBe("Jane")
  })

  it("resolves the enclosure image", () => {
    expect(items[0]?.imageUrl).toBe("https://example.com/img/cover.png")
  })

  it("parses the publication date", () => {
    expect(items[0]?.publishedAt?.toISOString()).toBe(
      "2026-08-05T10:00:00.000Z"
    )
  })
})

describe("parseFeed (Atom)", () => {
  const items = parseFeed(ATOM)

  it("picks the alternate link rather than the first one", () => {
    expect(items[0]?.url).toBe("https://example.com/posts/1")
  })

  it("uses the entry id for deduplication", () => {
    expect(items[0]?.externalId).toBe("tag:example.com,2026:1")
  })

  it("reads the nested author name", () => {
    expect(items[0]?.author).toBe("Ada")
  })
})

describe("parseFeed (malformed input)", () => {
  it("returns nothing for an unrecognised document", () => {
    expect(parseFeed("<html><body>not a feed</body></html>")).toEqual([])
  })

  it("returns nothing for an empty string", () => {
    expect(parseFeed("")).toEqual([])
  })
})
