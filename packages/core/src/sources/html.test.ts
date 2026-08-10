import { describe, expect, it } from "vitest"

import { htmlSourceConfigSchema } from "@contracts"

import { parseHtml } from "./html"

const HTML = `
<main>
  <article class="post">
    <h2 class="title">First post</h2>
    <a class="more" href="/posts/first">read</a>
    <p class="lead">Lead <b>paragraph</b></p>
    <img class="cover" src="/img/1.png" />
    <time class="date" datetime="2026-08-05T10:00:00Z">5 Aug</time>
  </article>
  <article class="post">
    <h2 class="title">Second post</h2>
    <a class="more" href="https://other.example/x">read</a>
  </article>
  <article class="post">
    <h2 class="title">No link</h2>
  </article>
</main>`

const config = htmlSourceConfigSchema.parse({
  itemSelector: "article.post",
  titleSelector: ".title",
  linkSelector: "a.more",
  summarySelector: ".lead",
  imageSelector: "img.cover",
  dateSelector: "time.date",
})

describe("parseHtml", () => {
  const items = parseHtml(HTML, config, "https://example.com/blog")

  it("skips items with no link", () => {
    expect(items).toHaveLength(2)
  })

  it("resolves relative links against the page URL", () => {
    expect(items[0]?.url).toBe("https://example.com/posts/first")
  })

  it("leaves absolute links alone", () => {
    expect(items[1]?.url).toBe("https://other.example/x")
  })

  it("uses the resolved link as the dedup key", () => {
    expect(items[0]?.externalId).toBe("https://example.com/posts/first")
  })

  it("flattens markup inside the summary", () => {
    expect(items[0]?.summary).toBe("Lead paragraph")
  })

  it("resolves the image", () => {
    expect(items[0]?.imageUrl).toBe("https://example.com/img/1.png")
  })

  it("prefers the machine-readable date attribute", () => {
    expect(items[0]?.publishedAt?.toISOString()).toBe(
      "2026-08-05T10:00:00.000Z"
    )
  })

  it("omits fields whose selectors match nothing", () => {
    expect(items[1]?.summary).toBeUndefined()
    expect(items[1]?.imageUrl).toBeUndefined()
  })
})
