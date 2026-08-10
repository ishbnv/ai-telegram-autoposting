import { describe, expect, it } from "vitest"

import {
  escapeHtml,
  renderFooter,
  renderPostCaption,
  renderPostMessage,
  truncate,
} from "./render"

const source = {
  name: "Reddit r/GeminiAI",
  url: "https://reddit.com/r/GeminiAI",
}

describe("renderFooter", () => {
  it("renders the source as a link for {sourceLink}", () => {
    expect(renderFooter("🔗 Source: {sourceLink}", source)).toBe(
      '🔗 Source: <a href="https://reddit.com/r/GeminiAI">Reddit r/GeminiAI</a>'
    )
  })

  it("supports plain name and url placeholders", () => {
    expect(renderFooter("{sourceName} — {sourceUrl}", source)).toBe(
      "Reddit r/GeminiAI — https://reddit.com/r/GeminiAI"
    )
  })

  it("escapes values so a crafted source name cannot inject markup", () => {
    const hostile = { name: "<b>ad</b>", url: "https://e.com/?a=1&b=2" }

    expect(renderFooter("{sourceLink}", hostile)).toBe(
      '<a href="https://e.com/?a=1&amp;b=2">&lt;b&gt;ad&lt;/b&gt;</a>'
    )
  })
})

describe("renderPostMessage", () => {
  it("escapes the model output and appends the footer", () => {
    const html = renderPostMessage({
      text: "Costs < 1$ & works",
      footerTemplate: "🔗 Source: {sourceLink}",
      source,
    })

    expect(html).toBe(
      'Costs &lt; 1$ &amp; works\n\n🔗 Source: <a href="https://reddit.com/r/GeminiAI">Reddit r/GeminiAI</a>'
    )
  })

  it("keeps the footer intact when the body has to be trimmed", () => {
    const html = renderPostMessage({
      text: "word ".repeat(4000),
      footerTemplate: "🔗 Source: {sourceLink}",
      source,
    })

    expect(html).toContain('<a href="https://reddit.com/r/GeminiAI">')
    expect(html).toContain("…")
  })

  it("stays inside Telegram's limit once entities are parsed", () => {
    const html = renderPostMessage({
      text: "a".repeat(6000),
      footerTemplate: "🔗 Source: {sourceLink}",
      source,
    })

    // Telegram counts the visible text, so measure the tag-free form.
    const visible = html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
    expect(Array.from(visible).length).toBeLessThanOrEqual(4096)
  })

  it("applies the tighter caption limit for photo posts", () => {
    const caption = renderPostCaption({
      text: "b".repeat(4000),
      footerTemplate: "🔗 Source: {sourceLink}",
      source,
    })

    const visible = caption.replace(/<[^>]+>/g, "")
    expect(Array.from(visible).length).toBeLessThanOrEqual(1024)
  })

  it("emits only the body when the template is blank", () => {
    expect(
      renderPostMessage({ text: "just this", footerTemplate: "", source })
    ).toBe("just this")
  })
})

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 50)).toBe("short")
  })

  it("cuts on a word boundary when one is close enough", () => {
    expect(truncate("alpha beta gamma delta", 18)).toBe("alpha beta gamma…")
  })

  it("counts code points, not UTF-16 units", () => {
    expect(Array.from(truncate("🙂".repeat(20), 10)).length).toBe(10)
  })
})

describe("escapeHtml", () => {
  it("escapes the characters Telegram's HTML parser cares about", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;"
    )
  })
})
