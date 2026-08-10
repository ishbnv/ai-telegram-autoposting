import type { WorkerContext } from "@/context"
import { isPipelineDue, isSourceDue } from "@/lib/schedule"

const TICK_MS = 15_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One tick decides what is due and enqueues it. The dedupe keys mean a tick that
 * overlaps a still-running job is a no-op rather than a pile-up, so the interval
 * can stay short without any locking of its own.
 */
async function tick(ctx: WorkerContext): Promise<void> {
  const now = new Date()

  const sources = await ctx.prisma.source.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      lastFetchedAt: true,
      fetchIntervalSec: true,
    },
  })

  for (const source of sources) {
    if (!isSourceDue(source, now)) {
      continue
    }

    const job = await ctx.queue.enqueue({
      type: "FETCH_SOURCE",
      payload: { sourceId: source.id },
      dedupeKey: `fetch:${source.id}`,
    })

    if (job) {
      ctx.logger.debug(
        { sourceId: source.id, name: source.name },
        "fetch queued"
      )
    }
  }

  const pipelines = await ctx.prisma.pipeline.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      cron: true,
      lastRunAt: true,
      createdAt: true,
    },
  })

  for (const pipeline of pipelines) {
    if (!isPipelineDue(pipeline, now, ctx.env.TZ)) {
      continue
    }

    const job = await ctx.queue.enqueue({
      type: "RUN_PIPELINE",
      payload: { pipelineId: pipeline.id },
      // Same key the API's "Run now" button uses, so a manual run and a
      // scheduled one cannot both be in flight.
      dedupeKey: `run-pipeline:${pipeline.id}`,
    })

    if (job) {
      ctx.logger.info(
        { pipelineId: pipeline.id, name: pipeline.name },
        "pipeline run queued"
      )
    }
  }
}

export async function runScheduler(
  ctx: WorkerContext,
  signal: AbortSignal
): Promise<void> {
  while (!signal.aborted) {
    try {
      await tick(ctx)
    } catch (error) {
      // A bad tick must not end the scheduler; the next one is 15s away.
      ctx.logger.error({ err: String(error) }, "scheduler tick failed")
    }

    await sleep(TICK_MS)
  }
}
