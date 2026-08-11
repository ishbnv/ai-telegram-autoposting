import { describe, expect, it } from "vitest"

import {
  escapeHtml,
  normalizeBlockSpacing,
  renderFooter,
  renderPostCaption,
  renderRichPostMessage,
  stripMarkdown,
  truncateMarkdown,
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

describe("rich rendering", () => {
  const source = { name: "r/GeminiAI", url: "https://reddit.com/r/GeminiAI" }

  it("does not escape the model's formatting", () => {
    const out = renderRichPostMessage({
      text: "## Heading\n\nSome **bold** text.",
      footerTemplate: "🔗 Source: {sourceLink}",
      source,
    })

    expect(out).toContain("## Heading")
    expect(out).toContain("**bold**")
    expect(out).not.toContain("&lt;")
  })

  it("renders the footer as a Markdown link", () => {
    const out = renderRichPostMessage({
      text: "Body.",
      footerTemplate: "🔗 Source: {sourceLink}",
      source,
    })

    expect(out).toContain("[r/GeminiAI](https://reddit.com/r/GeminiAI)")
  })

  it("puts the image at the top instead of using a caption", () => {
    const out = renderRichPostMessage({
      text: "Body.",
      footerTemplate: "",
      source,
      mediaUrl: "https://example.com/a.jpg",
    })

    expect(out.startsWith("![](https://example.com/a.jpg)")).toBe(true)
  })

  it("escapes brackets in a source name that would end the link early", () => {
    const out = renderRichPostMessage({
      text: "Body.",
      footerTemplate: "{sourceLink}",
      source: { name: "News [live]", url: "https://example.com/a(b)" },
    })

    expect(out).toContain("News \\[live\\]")
    expect(out).toContain("https://example.com/a\\(b\\)")
  })
})

describe("truncateMarkdown", () => {
  it("leaves a document that already fits alone", () => {
    expect(truncateMarkdown("# Title\n\nBody.", 100)).toBe("# Title\n\nBody.")
  })

  it("cuts on a block boundary rather than mid-sentence", () => {
    const out = truncateMarkdown("First block.\n\nSecond block.\n\nThird.", 20)

    expect(out).toBe("First block.")
  })

  /** An unclosed fence swallows the rest of the message and earns a 400. */
  it("drops a block that would leave a code fence open", () => {
    const markdown = "Intro text.\n\n```ts\nconst x = 1\n```"
    const out = truncateMarkdown(markdown, 20)

    expect(out.split("```").length - 1).toBe(0)
    expect(out).toBe("Intro text.")
  })

  it("keeps a fenced block whole when it fits", () => {
    const markdown = "Intro.\n\n```\ncode\n```"
    const out = truncateMarkdown(markdown, 100)

    expect(out.split("```").length - 1).toBe(2)
  })
})

describe("stripMarkdown", () => {
  it("keeps a link's destination visible", () => {
    expect(stripMarkdown("See [the report](https://example.com/r).")).toBe(
      "See the report (https://example.com/r)."
    )
  })

  it("unwraps headings, emphasis and code", () => {
    const out = stripMarkdown(
      "## Title\n\nSome **bold** and `code` and *italic*."
    )

    expect(out).toBe("Title\n\nSome bold and code and italic.")
  })

  it("turns list markers into bullets", () => {
    expect(stripMarkdown("- one\n- two")).toBe("• one\n• two")
  })

  it("drops a table rather than rendering it as pipes", () => {
    const out = stripMarkdown(
      "Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter."
    )

    expect(out).not.toContain("|")
    expect(out).toContain("Before.")
    expect(out).toContain("After.")
  })

  it("keeps the contents of a fenced block but not the fence", () => {
    expect(stripMarkdown("```ts\nconst x = 1\n```")).toBe("const x = 1")
  })

  it("leaves an underscore inside a word alone", () => {
    expect(stripMarkdown("call read_me and write_me")).toBe(
      "call read_me and write_me"
    )
  })

  it("is what the plain fallback renders, so no syntax reaches a reader", () => {
    const out = renderPostMessage({
      text: "## Heading\n\n**Bold** body.",
      footerTemplate: "",
      source: { name: "n", url: "https://example.com" },
    })

    expect(out).not.toContain("##")
    expect(out).not.toContain("**")
  })
})

describe("cover image placement", () => {
  const source = { name: "Блог", url: "https://example.com" }

  it("sits under the title, the way an article reads", () => {
    const out = renderRichPostMessage({
      text: "# Заголовок статьи\n\nПервый абзац.",
      footerTemplate: "",
      source,
      mediaUrl: "https://example.com/cover.jpg",
    })

    expect(out).toBe(
      "# Заголовок статьи\n\n![](https://example.com/cover.jpg)\n\nПервый абзац."
    )
  })

  it("leads when the post has no title to sit under", () => {
    const out = renderRichPostMessage({
      text: "Просто абзац без заголовка.",
      footerTemplate: "",
      source,
      mediaUrl: "https://example.com/cover.jpg",
    })

    expect(out.startsWith("![](https://example.com/cover.jpg)")).toBe(true)
  })

  it("is not confused by a hash that is not a heading", () => {
    const out = renderRichPostMessage({
      text: "#hashtag не заголовок",
      footerTemplate: "",
      source,
      mediaUrl: "https://example.com/cover.jpg",
    })

    expect(out.startsWith("![](")).toBe(true)
  })
})

describe("normalizeBlockSpacing", () => {
  it("separates paragraphs the model ran together", () => {
    const written = [
      "В статье показываю конкретную границу, на которой заканчивается удобство адаптеров.",
      "Это важное различие для продакшена. Подключить базу — только часть задачи.",
    ].join("\n")

    expect(normalizeBlockSpacing(written)).toBe(
      [
        "В статье показываю конкретную границу, на которой заканчивается удобство адаптеров.",
        "",
        "Это важное различие для продакшена. Подключить базу — только часть задачи.",
      ].join("\n")
    )
  })

  it("keeps list items together", () => {
    const written = "Что ломается:\n- первое;\n- второе;\n- третье."

    expect(normalizeBlockSpacing(written)).toBe(
      "Что ломается:\n\n- первое;\n- второе;\n- третье."
    )
  })

  it("keeps table rows together", () => {
    const written = "| a | b |\n|---|---|\n| 1 | 2 |"

    expect(normalizeBlockSpacing(written)).toBe(written)
  })

  it("gives a heading room on both sides", () => {
    const written = "Вступление.\n## Раздел\nТекст раздела."

    expect(normalizeBlockSpacing(written)).toBe(
      "Вступление.\n\n## Раздел\n\nТекст раздела."
    )
  })

  /** Splitting these would turn one paragraph into several. */
  it("leaves a line wrapped mid-sentence joined to the next", () => {
    const written = "Одно предложение, разорванное\nпереносом посередине."

    expect(normalizeBlockSpacing(written)).toBe(written)
  })

  it("does not touch the inside of a fenced block", () => {
    const written = "Текст.\n\n```ts\nconst a = 1\nconst b = 2\n```"

    expect(normalizeBlockSpacing(written)).toBe(written)
  })

  it("collapses runs of blank lines to exactly one", () => {
    expect(normalizeBlockSpacing("Первый.\n\n\n\nВторой.")).toBe(
      "Первый.\n\nВторой."
    )
  })

  it("is applied by the renderer, not just available to it", () => {
    const out = renderRichPostMessage({
      text: "# Заголовок\nПервый абзац.\nВторой абзац.",
      footerTemplate: "",
      source: { name: "n", url: "https://example.com" },
    })

    expect(out).toBe("# Заголовок\n\nПервый абзац.\n\nВторой абзац.")
  })
})
