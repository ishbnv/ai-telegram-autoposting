import { describe, expect, it } from "vitest"

import { isPipelineDue, isSourceDue, nextRunAfter } from "./schedule"

const at = (iso: string) => new Date(iso)

describe("nextRunAfter", () => {
  it("finds the next slot after the given moment", () => {
    expect(
      nextRunAfter("*/30 * * * *", at("2026-08-09T10:05:00Z"), "UTC")
    ).toEqual(at("2026-08-09T10:30:00Z"))
  })

  it("respects the timezone", () => {
    // Midnight in Yerevan is 20:00 UTC the previous day.
    expect(
      nextRunAfter("0 0 * * *", at("2026-08-09T10:00:00Z"), "Asia/Yerevan")
    ).toEqual(at("2026-08-09T20:00:00Z"))
  })

  it("returns null for an expression that does not parse", () => {
    expect(
      nextRunAfter("not a cron", at("2026-08-09T10:00:00Z"), "UTC")
    ).toBeNull()
  })

  it("refuses a short expression instead of padding it to every minute", () => {
    // cron-parser would read "" and "*/5" as "* * * * *" and fire constantly.
    for (const expr of ["", "   ", "*", "*/5", "0 *", "* * * *"]) {
      expect(nextRunAfter(expr, at("2026-08-09T10:00:00Z"), "UTC")).toBeNull()
    }
  })

  it("accepts the six-field form with seconds", () => {
    expect(
      nextRunAfter("0 */30 * * * *", at("2026-08-09T10:05:00Z"), "UTC")
    ).toEqual(at("2026-08-09T10:30:00Z"))
  })
})

describe("isPipelineDue", () => {
  const created = at("2026-08-01T00:00:00Z")

  it("is due once the slot after the last run has passed", () => {
    const pipeline = {
      cron: "*/30 * * * *",
      lastRunAt: at("2026-08-09T10:00:00Z"),
      createdAt: created,
    }

    expect(isPipelineDue(pipeline, at("2026-08-09T10:29:00Z"), "UTC")).toBe(
      false
    )
    expect(isPipelineDue(pipeline, at("2026-08-09T10:30:00Z"), "UTC")).toBe(
      true
    )
  })

  it("measures a never-run pipeline from its creation, not from epoch", () => {
    const pipeline = {
      cron: "0 0 * * *",
      lastRunAt: null,
      createdAt: at("2026-08-09T09:00:00Z"),
    }

    // Same day, before the next midnight: nothing to catch up on.
    expect(isPipelineDue(pipeline, at("2026-08-09T10:00:00Z"), "UTC")).toBe(
      false
    )
    expect(isPipelineDue(pipeline, at("2026-08-10T00:00:00Z"), "UTC")).toBe(
      true
    )
  })

  it("never fires on an unparseable expression", () => {
    expect(
      isPipelineDue(
        { cron: "every thirty minutes", lastRunAt: null, createdAt: created },
        at("2027-01-01T00:00:00Z"),
        "UTC"
      )
    ).toBe(false)
  })
})

describe("isSourceDue", () => {
  it("fetches a source that has never been fetched", () => {
    expect(
      isSourceDue({ lastFetchedAt: null, fetchIntervalSec: 900 }, new Date())
    ).toBe(true)
  })

  it("waits out the interval", () => {
    const source = {
      lastFetchedAt: at("2026-08-09T10:00:00Z"),
      fetchIntervalSec: 900,
    }

    expect(isSourceDue(source, at("2026-08-09T10:14:00Z"))).toBe(false)
    expect(isSourceDue(source, at("2026-08-09T10:15:00Z"))).toBe(true)
  })
})
