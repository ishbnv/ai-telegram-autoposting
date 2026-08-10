const dateTime = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : "—"
}

/**
 * LLM spend is routinely well under a cent, so the usual two decimals would
 * render every real number as $0.00.
 */
export function formatUsd(value: number): string {
  if (value === 0) {
    return "$0"
  }

  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`
  }

  return `${Math.floor(seconds / 3600)}h`
}
