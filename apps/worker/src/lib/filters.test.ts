import { describe, expect, it } from "vitest"

import { matchesFilters, readFilters } from "./filters"

const none = { include: [], exclude: [], minContentLength: 0 }

describe("matchesFilters", () => {
  const item = { title: "Gemini ships a CLI", summary: "For developers" }

  it("accepts everything when no filters are set", () => {
    expect(matchesFilters(item, none)).toBe(true)
  })

  it("treats an empty include list as no opinion, not as match-nothing", () => {
    expect(
      matchesFilters(item, {
        include: [],
        exclude: ["python"],
        minContentLength: 0,
      })
    ).toBe(true)
  })

  it("requires at least one include term", () => {
    expect(
      matchesFilters(item, {
        include: ["cli"],
        exclude: [],
        minContentLength: 0,
      })
    ).toBe(true)
    expect(
      matchesFilters(item, {
        include: ["rust"],
        exclude: [],
        minContentLength: 0,
      })
    ).toBe(false)
  })

  it("matches case-insensitively", () => {
    expect(
      matchesFilters(item, {
        include: ["GEMINI"],
        exclude: [],
        minContentLength: 0,
      })
    ).toBe(true)
  })

  it("searches the summary as well as the title", () => {
    expect(
      matchesFilters(item, {
        include: ["developers"],
        exclude: [],
        minContentLength: 0,
      })
    ).toBe(true)
  })

  it("lets exclude win over include", () => {
    expect(
      matchesFilters(item, {
        include: ["gemini"],
        exclude: ["cli"],
        minContentLength: 0,
      })
    ).toBe(false)
  })

  it("copes with a missing summary", () => {
    expect(
      matchesFilters(
        { title: "Just a title" },
        { include: ["title"], exclude: [], minContentLength: 0 }
      )
    ).toBe(true)
    expect(
      matchesFilters(
        { title: "Just a title", summary: null },
        { include: ["nope"], exclude: [], minContentLength: 0 }
      )
    ).toBe(false)
  })
})

describe("readFilters", () => {
  it("defaults both lists when the column is empty", () => {
    expect(readFilters(null)).toEqual(none)
    expect(readFilters({})).toEqual(none)
  })

  it("ignores values of the wrong shape rather than throwing", () => {
    expect(readFilters({ include: "cli", exclude: 5 })).toEqual(none)
  })

  it("keeps the lists it does understand", () => {
    expect(readFilters({ include: ["a"], exclude: ["b"] })).toEqual({
      include: ["a"],
      exclude: ["b"],
      minContentLength: 0,
    })
  })
})

describe("minContentLength", () => {
  const base = { include: [], exclude: [], minContentLength: 0 }

  it("drops an item with almost nothing to write from", () => {
    const item = {
      title: "Someone please help me fix this",
      content: "submitted by /u/someone [link] [comments]",
    }

    expect(matchesFilters(item, { ...base, minContentLength: 300 })).toBe(false)
  })

  it("keeps one with a real body", () => {
    const item = { title: "How we cut latency", content: "x".repeat(400) }

    expect(matchesFilters(item, { ...base, minContentLength: 300 })).toBe(true)
  })

  /** A long headline over an empty post is the case this exists to catch. */
  it("measures the body, not the title", () => {
    const item = { title: "x".repeat(500), content: "one line" }

    expect(matchesFilters(item, { ...base, minContentLength: 300 })).toBe(false)
  })

  it("falls back to the summary when there is no content", () => {
    const item = { title: "t", summary: "y".repeat(400) }

    expect(matchesFilters(item, { ...base, minContentLength: 300 })).toBe(true)
  })

  it("is off at zero, which is the default", () => {
    const item = { title: "t", content: "short" }

    expect(matchesFilters(item, { ...base, minContentLength: 0 })).toBe(true)
    expect(readFilters({}).minContentLength).toBe(0)
  })

  it("survives a pipeline saved before the field existed", () => {
    expect(readFilters({ include: ["a"], exclude: [] })).toEqual({
      include: ["a"],
      exclude: [],
      minContentLength: 0,
    })
  })
})
