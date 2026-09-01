import { describe, expect, it } from "vitest"

import { formatDateTime, formatDuration, formatUsd } from "./format"

describe("formatUsd", () => {
  /**
   * The reason this function exists: a single draft costs well under a cent,
   * and two decimals render every real spend as "$0.00" — a dashboard that
   * says the pipeline is free.
   */
  it("keeps four decimals below a cent", () => {
    expect(formatUsd(0.0054)).toBe("$0.0054")
    expect(formatUsd(0.0001)).toBe("$0.0001")
  })

  it("drops to two decimals once the number is readable", () => {
    expect(formatUsd(0.01)).toBe("$0.01")
    expect(formatUsd(12.5)).toBe("$12.50")
  })

  it("shows a plain zero rather than $0.0000", () => {
    expect(formatUsd(0)).toBe("$0")
  })

  /** The boundary the two branches meet at. */
  it("treats exactly one cent as the readable side", () => {
    expect(formatUsd(0.0099)).toBe("$0.0099")
    expect(formatUsd(0.01)).toBe("$0.01")
  })
})

describe("formatDuration", () => {
  it("counts seconds, then minutes, then hours", () => {
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(900)).toBe("15m")
    expect(formatDuration(7200)).toBe("2h")
  })

  it("rounds down at each boundary", () => {
    expect(formatDuration(59)).toBe("59s")
    expect(formatDuration(60)).toBe("1m")
    expect(formatDuration(3599)).toBe("59m")
    expect(formatDuration(3600)).toBe("1h")
  })
})

describe("formatDateTime", () => {
  /**
   * Every timestamp in the panel is nullable — a source that has never been
   * fetched, a post that was never published — and an em dash is the answer.
   */
  it("shows a dash for a missing timestamp", () => {
    expect(formatDateTime(null)).toBe("—")
    expect(formatDateTime(undefined)).toBe("—")
    expect(formatDateTime("")).toBe("—")
  })

  it("renders a real timestamp", () => {
    // The zone is pinned to UTC by the vitest config; the locale is the
    // machine's, so this asserts the parts that do not move.
    const rendered = formatDateTime("2026-08-11T20:59:00.000Z")

    expect(rendered).toContain("11")
    expect(rendered).toContain("59")
    expect(rendered).not.toBe("—")
  })
})
