import { describe, expect, it } from "vitest"

import { renderRichCardBody } from "./card"

const SPACER = "⠀"

const post = {
  id: "p1",
  text: "# Заголовок\n\nАбзац.",
  mediaUrl: null,
  sourceName: "Блог ishbnv.dev",
  sourceUrl: "https://ishbnv.dev/ru/blog/x/",
}

describe("renderRichCardBody", () => {
  it("always names the source, even with the footer cleared", () => {
    const out = renderRichCardBody(post, { footerTemplate: "" })

    expect(out).toContain("**Source:**")
    expect(out).toContain("`https://ishbnv.dev/ru/blog/x/`")
  })

  it("keeps the source out of the post itself", () => {
    const out = renderRichCardBody(post, { footerTemplate: "" })
    const [article = ""] = out.split("\n\n---\n\n")

    expect(article).not.toContain("Source")
    expect(article).not.toContain("ishbnv.dev")
  })

  /** Adjacent blocks render flush, so the gap has to be a block of its own. */
  it("separates the source from the link list with a spacer", () => {
    const withLink = {
      ...post,
      text: "Текст со [ссылкой](https://example.com/a).",
    }
    const out = renderRichCardBody(withLink, { footerTemplate: "" })
    const notes = out.split("\n\n---\n\n")[1] ?? ""

    expect(notes).toContain(`\n\n${SPACER}\n\n`)
    expect(notes.indexOf("**Source:**")).toBeLessThan(notes.indexOf(SPACER))
    expect(notes.indexOf(SPACER)).toBeLessThan(notes.indexOf("**Links"))
  })

  it("does not leave a dangling spacer when there are no links", () => {
    const out = renderRichCardBody(post, { footerTemplate: "" })
    const notes = out.split("\n\n---\n\n")[1] ?? ""

    expect(notes).not.toContain(SPACER)
    expect(notes.trim().endsWith("`")).toBe(true)
  })
})
