import type { DashboardSummary, ProcessStatus } from "@contracts"
import { Hono } from "hono"

import type { AppEnv } from "../context"

/** Worker and bot beat every 30s; three missed beats is a problem worth showing. */
const HEARTBEAT_TOLERANCE_SEC = 95

/** Local time, which the deployment pins through the TZ environment variable. */
function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function startOfWeek(): Date {
  const today = startOfToday()
  return new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)
}

function sumUsd(value: { toString(): string } | null | undefined): number {
  return value ? Number(value.toString()) : 0
}

export const dashboardRoutes = new Hono<AppEnv>().get("/summary", async (c) => {
  const prisma = c.get("prisma")
  const today = startOfToday()
  const weekStart = startOfWeek()

  const [
    publishedToday,
    publishedThisWeek,
    pendingApproval,
    queued,
    failed,
    spendToday,
    spendWeek,
    sourcesTotal,
    sourcesActive,
    sourcesFailing,
    heartbeats,
  ] = await Promise.all([
    prisma.publication.count({ where: { publishedAt: { gte: today } } }),
    prisma.publication.count({ where: { publishedAt: { gte: weekStart } } }),
    prisma.post.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.post.count({ where: { status: "APPROVED" } }),
    prisma.post.count({ where: { status: "FAILED" } }),
    prisma.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: today } },
    }),
    prisma.llmCall.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: weekStart } },
    }),
    prisma.source.count(),
    prisma.source.count({ where: { isActive: true } }),
    prisma.source.count({ where: { lastError: { not: null } } }),
    prisma.heartbeat.findMany({ orderBy: { process: "asc" } }),
  ])

  const now = Date.now()
  const processes: ProcessStatus[] = heartbeats.map((beat) => {
    const silentForSec = Math.max(
      0,
      Math.round((now - beat.lastSeenAt.getTime()) / 1000)
    )

    return {
      process: beat.process,
      instanceId: beat.instanceId,
      lastSeenAt: beat.lastSeenAt.toISOString(),
      silentForSec,
      healthy: silentForSec <= HEARTBEAT_TOLERANCE_SEC,
    }
  })

  return c.json<DashboardSummary>({
    posts: {
      publishedToday,
      publishedThisWeek,
      pendingApproval,
      queued,
      failed,
    },
    spend: {
      todayUsd: sumUsd(spendToday._sum.costUsd),
      weekUsd: sumUsd(spendWeek._sum.costUsd),
    },
    sources: {
      active: sourcesActive,
      total: sourcesTotal,
      failing: sourcesFailing,
    },
    processes,
  })
})
