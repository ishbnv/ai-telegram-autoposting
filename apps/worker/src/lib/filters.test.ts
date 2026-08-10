import { describe, expect, it } from "vitest"

import { matchesFilters, readFilters } from "./filters"

const none = { include: [], exclude: [] }

describe("matchesFilters", () => {
  const item = { title: "Gemini ships a CLI", summary: "For developers" }

  it("accepts everything when no filters are set", () => {
    expect(matchesFilters(item, none)).toBe(true)
  })

  it("treats an empty include list as no opinion, not as match-nothing", () => {
    expect(matchesFilters(item, { include: [], exclude: ["python"] })).toBe(
      true
    )
  })

  it("requires at least one include term", () => {
    expect(matchesFilters(item, { include: ["cli"], exclude: [] })).toBe(true)
    expect(matchesFilters(item, { include: ["rust"], exclude: [] })).toBe(false)
  })

  it("matches case-insensitively", () => {
    expect(matchesFilters(item, { include: ["GEMINI"], exclude: [] })).toBe(
      true
    )
  })

  it("searches the summary as well as the title", () => {
    expect(matchesFilters(item, { include: ["developers"], exclude: [] })).toBe(
      true
    )
  })

  it("lets exclude win over include", () => {
    expect(
      matchesFilters(item, { include: ["gemini"], exclude: ["cli"] })
    ).toBe(false)
  })

  it("copes with a missing summary", () => {
    expect(
      matchesFilters(
        { title: "Just a title" },
        { include: ["title"], exclude: [] }
      )
    ).toBe(true)
    expect(
      matchesFilters(
        { title: "Just a title", summary: null },
        { include: ["nope"], exclude: [] }
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
    })
  })
})
