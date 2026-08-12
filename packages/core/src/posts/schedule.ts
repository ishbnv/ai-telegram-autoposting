/**
 * Turning "later" into a timestamp.
 *
 * The Bot API has no scheduled send for bots — `schedule_date` belongs to the
 * user API — so the delay is ours to keep. It lives on the queued job's
 * `runAt`, which the worker already honours, so nothing here needs a timer of
 * its own.
 *
 * Times are computed in the process's local zone, which is whatever `TZ` says.
 * A deployment that leaves TZ unset gets UTC, and "tomorrow morning" will mean
 * a morning somewhere else.
 */

export const SCHEDULE_PRESETS = ["in1h", "in3h", "evening", "morning"] as const

export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number]

const EVENING_HOUR = 19
const MORNING_HOUR = 10
const MINUTE_MS = 60_000

/** The nearest future occurrence of `hour:00`, today or tomorrow. */
function nextAtHour(now: Date, hour: number): Date {
  const at = new Date(now)
  at.setHours(hour, 0, 0, 0)

  if (at.getTime() <= now.getTime()) {
    at.setDate(at.getDate() + 1)
  }

  return at
}

export function resolveSchedule(preset: SchedulePreset, now: Date): Date {
  switch (preset) {
    case "in1h":
      return new Date(now.getTime() + 60 * MINUTE_MS)
    case "in3h":
      return new Date(now.getTime() + 180 * MINUTE_MS)
    case "evening":
      return nextAtHour(now, EVENING_HOUR)
    case "morning": {
      // Always the next morning, never this one: "tomorrow" that fires in
      // twenty minutes because it is 09:40 would be a nasty surprise.
      const at = new Date(now)
      at.setDate(at.getDate() + 1)
      at.setHours(MORNING_HOUR, 0, 0, 0)
      return at
    }
  }
}

const HOUR_MINUTE = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

const DAY_MONTH = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
})

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isNextDay(now: Date, at: Date): boolean {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return isSameDay(tomorrow, at)
}

/**
 * How a moment reads on a button and in a card: "today 19:00" while that means
 * something, "12 Aug 19:00" once it does not. A button promising "Today 19:00"
 * at half past seven would be a lie the code can easily avoid telling.
 */
export function describeMoment(at: Date, now: Date): string {
  const time = HOUR_MINUTE.format(at)

  if (isSameDay(now, at)) {
    return `today ${time}`
  }
  if (isNextDay(now, at)) {
    return `tomorrow ${time}`
  }

  return `${DAY_MONTH.format(at)} ${time}`
}

/** Button label for a preset, resolved so it never promises the wrong day. */
export function describePreset(preset: SchedulePreset, now: Date): string {
  if (preset === "in1h") {
    return "⏱ In 1 hour"
  }
  if (preset === "in3h") {
    return "⏱ In 3 hours"
  }

  const icon = preset === "evening" ? "🌇" : "🌅"

  return `${icon} ${describeMoment(resolveSchedule(preset, now), now)}`
}
