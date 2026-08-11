import { describe, expect, it } from "vitest"

import { extractLinks, renderLinkAppendix } from "./links"

describe("extractLinks", () => {
  it("finds an ordinary Markdown link", () => {
    expect(extractLinks("See [the report](https://example.com/r).")).toEqual([
      { label: "the report", url: "https://example.com/r", kind: "link" },
    ])
  })

  it("tells an image apart from a link", () => {
    expect(extractLinks("![alt](https://example.com/a.jpg)")).toEqual([
      { label: "alt", url: "https://example.com/a.jpg", kind: "image" },
    ])
  })

  it("finds a bare URL, which Telegram makes clickable by itself", () => {
    expect(extractLinks("Details at https://example.com/x for now")).toEqual([
      { label: "", url: "https://example.com/x", kind: "autolink" },
    ])
  })

  /** The case the appendix exists for. */
  it("reports the real target of a link that lies about where it goes", () => {
    const links = extractLinks(
      "Read it on [github.com/ishbnv](https://phishing.example/login)"
    )

    expect(links).toHaveLength(1)
    expect(links[0]?.label).toBe("github.com/ishbnv")
    expect(links[0]?.url).toBe("https://phishing.example/login")
  })

  it("ignores anything inside code, which renders literally", () => {
    const markdown = [
      "Inline `[not a link](https://example.com/no)` stays text.",
      "",
      "```",
      "[also not](https://example.com/nope)",
      "https://example.com/bare-in-code",
      "```",
    ].join("\n")

    expect(extractLinks(markdown)).toEqual([])
  })

  it("keeps the title Telegram allows out of the URL", () => {
    expect(
      extractLinks('![](https://example.com/a.jpg "Photo caption")')
    ).toEqual([{ label: "", url: "https://example.com/a.jpg", kind: "image" }])
  })

  it("does not report a URL twice for one link", () => {
    const links = extractLinks(
      "[a](https://example.com/x) and again [a](https://example.com/x)"
    )

    expect(links).toHaveLength(1)
  })

  it("keeps one destination that hides behind two different labels", () => {
    const links = extractLinks(
      "[docs](https://example.com/x) and [totally safe](https://example.com/x)"
    )

    expect(links.map((link) => link.label)).toEqual(["docs", "totally safe"])
  })

  it("finds every link in a document, not just the first", () => {
    const links = extractLinks(
      "[one](https://a.example) then [two](https://b.example) then https://c.example"
    )

    expect(links.map((link) => link.url)).toEqual([
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ])
  })
})

describe("renderLinkAppendix", () => {
  it("is empty when there is nothing to warn about", () => {
    expect(renderLinkAppendix([])).toBe("")
  })

  it("puts the URL in a code span so it cannot be clicked or disguised", () => {
    const appendix = renderLinkAppendix(
      extractLinks("[safe looking](https://evil.example/x)")
    )

    expect(appendix).toContain("`https://evil.example/x`")
    expect(appendix).toContain("safe looking")
    expect(appendix).toContain("(1)")
  })

  it("neutralises a backtick that would close the code span early", () => {
    const appendix = renderLinkAppendix([
      {
        label: "x",
        url: "https://evil.example/`](https://a.example)",
        kind: "link",
      },
    ])

    expect(appendix).not.toContain("`](")
  })
})
