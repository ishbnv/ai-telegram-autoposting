import { describe, expect, it } from "vitest"

import { describeMoment, describePreset, resolveSchedule } from "./schedule"

/** Local time, so the assertions read in the zone the code computes in. */
const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
) => new Date(year, month - 1, day, hour, minute, 0, 0)

describe("resolveSchedule", () => {
  it("adds an hour", () => {
    expect(resolveSchedule("in1h", at(2026, 8, 12, 14, 30))).toEqual(
      at(2026, 8, 12, 15, 30)
    )
  })

  it("adds three hours, crossing midnight when it has to", () => {
    expect(resolveSchedule("in3h", at(2026, 8, 12, 23, 30))).toEqual(
      at(2026, 8, 13, 2, 30)
    )
  })

  it("takes this evening when it is still ahead", () => {
    expect(resolveSchedule("evening", at(2026, 8, 12, 9, 0))).toEqual(
      at(2026, 8, 12, 19, 0)
    )
  })

  it("rolls to the next evening once tonight has passed", () => {
    expect(resolveSchedule("evening", at(2026, 8, 12, 20, 0))).toEqual(
      at(2026, 8, 13, 19, 0)
    )
  })

  /**
   * The trap this guards: at 09:40 a "tomorrow morning" that resolved to the
   * nearest 10:00 would fire in twenty minutes.
   */
  it("always means the next morning, never this one", () => {
    expect(resolveSchedule("morning", at(2026, 8, 12, 9, 40))).toEqual(
      at(2026, 8, 13, 10, 0)
    )
  })

  it("never resolves to a moment already gone", () => {
    const now = at(2026, 8, 12, 18, 59)

    for (const preset of ["in1h", "in3h", "evening", "morning"] as const) {
      expect(resolveSchedule(preset, now).getTime()).toBeGreaterThan(
        now.getTime()
      )
    }
  })
})

describe("describeMoment", () => {
  it("says today while that is true", () => {
    expect(describeMoment(at(2026, 8, 12, 19, 0), at(2026, 8, 12, 9, 0))).toBe(
      "today 19:00"
    )
  })

  it("says tomorrow for the next day", () => {
    expect(describeMoment(at(2026, 8, 13, 10, 0), at(2026, 8, 12, 9, 0))).toBe(
      "tomorrow 10:00"
    )
  })

  it("falls back to a date further out", () => {
    const text = describeMoment(at(2026, 8, 15, 10, 0), at(2026, 8, 12, 9, 0))

    expect(text).toContain("10:00")
    expect(text).not.toContain("today")
    expect(text).not.toContain("tomorrow")
  })

  it("uses a 24-hour clock, whatever the container's locale is", () => {
    expect(describeMoment(at(2026, 8, 12, 20, 5), at(2026, 8, 12, 9, 0))).toBe(
      "today 20:05"
    )
  })
})

describe("describePreset", () => {
  /** A button reading "Today 19:00" at half past seven would be a lie. */
  it("does not promise today once today is gone", () => {
    expect(describePreset("evening", at(2026, 8, 12, 20, 0))).toContain(
      "tomorrow 19:00"
    )
  })

  it("promises today while today still holds", () => {
    expect(describePreset("evening", at(2026, 8, 12, 9, 0))).toContain(
      "today 19:00"
    )
  })

  it("keeps the relative presets relative", () => {
    expect(describePreset("in1h", at(2026, 8, 12, 9, 0))).toBe("⏱ In 1 hour")
  })
})
