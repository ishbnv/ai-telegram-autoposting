/** Everything the Overview screen needs, in one request. */
export type DashboardSummary = {
  posts: {
    publishedToday: number
    publishedThisWeek: number
    pendingApproval: number
    /** Approved and queued, waiting for the worker to send them. */
    queued: number
    failed: number
  }
  spend: {
    todayUsd: number
    weekUsd: number
  }
  sources: {
    active: number
    total: number
    /** Sources whose last fetch failed. */
    failing: number
  }
  processes: ProcessStatus[]
}

export type ProcessStatus = {
  process: "API" | "WORKER" | "BOT"
  instanceId: string
  lastSeenAt: string
  /** Seconds since the last heartbeat. */
  silentForSec: number
  /** False once the heartbeat is older than the tolerated gap. */
  healthy: boolean
}
