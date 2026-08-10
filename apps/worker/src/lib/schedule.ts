import { CronExpressionParser } from "cron-parser"

/** Standard five-field cron, or six when seconds are included. */
const VALID_FIELD_COUNTS = new Set([5, 6])

/**
 * The first occurrence of `cron` strictly after `since`, or null if the
 * expression does not parse. Null rather than a throw: one operator typo must
 * not take the whole scheduler down with it.
 */
export function nextRunAfter(
  cron: string,
  since: Date,
  timezone: string
): Date | null {
  // cron-parser pads a short expression with "*", so "" parses happily as
  // "every minute". A blank or truncated schedule is a mistake, and the safe
  // reading of a mistake is "never", not "as often as possible".
  const fields = cron.trim().split(/\s+/).filter(Boolean)
  if (!VALID_FIELD_COUNTS.has(fields.length)) {
    return null
  }

  try {
    return CronExpressionParser.parse(cron, {
      currentDate: since,
      tz: timezone,
    })
      .next()
      .toDate()
  } catch {
    return null
  }
}

export function isPipelineDue(
  pipeline: { cron: string; lastRunAt: Date | null; createdAt: Date },
  now: Date,
  timezone: string
): boolean {
  // A pipeline that has never run is measured from when it was created, so
  // adding one does not immediately fire for every missed slot since epoch.
  const since = pipeline.lastRunAt ?? pipeline.createdAt
  const next = nextRunAfter(pipeline.cron, since, timezone)

  return next !== null && next.getTime() <= now.getTime()
}

export function isSourceDue(
  source: { lastFetchedAt: Date | null; fetchIntervalSec: number },
  now: Date
): boolean {
  if (!source.lastFetchedAt) {
    return true
  }

  const elapsedSec = (now.getTime() - source.lastFetchedAt.getTime()) / 1000
  return elapsedSec >= source.fetchIntervalSec
}
