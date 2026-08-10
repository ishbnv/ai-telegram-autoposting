import { describe, expect, it } from "vitest"

import { decodeEntities, stripHtml } from "./text"

describe("decodeEntities", () => {
  it("decodes the named entities feeds actually use", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot;")).toBe(
      'a & b <c> "d"'
    )
  })

  it("decodes decimal and hex references", () => {
    expect(decodeEntities("&#72;&#x69;")).toBe("Hi")
  })

  // These used to throw RangeError out of the adapter, which stamped the
  // source's lastError and killed every subsequent fetch of that feed.
  it.each(["&#1114112;", "&#x110000;", "&#xFFFFFFFF;", "&#99999999;"])(
    "leaves an out-of-range reference alone instead of throwing: %s",
    (input) => {
      expect(() => decodeEntities(input)).not.toThrow()
      expect(decodeEntities(input)).toBe(input)
    }
  )

  it("rejects NUL, which Postgres will not store", () => {
    expect(decodeEntities("&#0;")).toBe("&#0;")
  })

  it("rejects lone surrogates", () => {
    expect(decodeEntities("&#xD800;")).toBe("&#xD800;")
  })
})

describe("stripHtml", () => {
  it("removes script and style blocks with their contents", () => {
    expect(stripHtml("a<script>evil()</script>b<style>.x{}</style>c")).toBe(
      "a b c"
    )
  })

  it("handles several blocks and is case-insensitive", () => {
    expect(stripHtml("<SCRIPT>x</SCRIPT>keep<script>y</script>")).toBe("keep")
  })

  it("drops the remainder of an unterminated block", () => {
    expect(stripHtml("visible<script>never closed")).toBe("visible")
  })

  it("keeps ordinary markup handling intact", () => {
    // The stray space comes from `<p>` collapsing to one; pre-existing and
    // harmless in the plain text a model reads.
    expect(stripHtml("<p>one</p><p>two</p>")).toBe("one\n\n two")
    expect(stripHtml("a<br>b")).toBe("a\nb")
  })

  // The regression that mattered: 60k unclosed openers took 71 seconds and
  // blocked the event loop. Linear scanning makes the shape irrelevant.
  it("stays fast when the input is built to make a lazy regex backtrack", () => {
    const hostile = "<script ".repeat(60_000) + "x".repeat(100_000)

    const started = performance.now()
    stripHtml(hostile)
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(1_000)
  })
})
