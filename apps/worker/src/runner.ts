import type { Job, JobType } from "@db"

import type { WorkerContext } from "@/context"
import { handleFetchSource } from "@/handlers/fetchSource"
import { handleGeneratePost } from "@/handlers/generatePost"
import { handlePublishPost } from "@/handlers/publishPost"
import { handleRunPipeline } from "@/handlers/runPipeline"

/** How long to wait when the queue turned up empty. */
const IDLE_DELAY_MS = 2_000
const BATCH_SIZE = 3

/** Jobs left RUNNING by a process that died are handed back after this long. */
const STALE_AFTER_MS = 10 * 60 * 1000
const STALE_SWEEP_MS = 60 * 1000

/**
 * Keyed by the Prisma enum, so adding a job type without writing a handler is a
 * compile error rather than a job that sits in the queue forever.
 */
const HANDLERS: Record<
  JobType,
  (ctx: WorkerContext, job: Job) => Promise<void>
> = {
  FETCH_SOURCE: (ctx, job) => handleFetchSource(ctx, job.payload),
  RUN_PIPELINE: (ctx, job) => handleRunPipeline(ctx, job.payload),
  GENERATE_POST: handleGeneratePost,
  PUBLISH_POST: handlePublishPost,
}

const ALL_TYPES = Object.keys(HANDLERS) as JobType[]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function runOne(ctx: WorkerContext, job: Job): Promise<void> {
  try {
    await HANDLERS[job.type](ctx, job)
    await ctx.queue.complete(job.id)
  } catch (error) {
    ctx.logger.error(
      {
        jobId: job.id,
        type: job.type,
        attempt: job.attempts,
        err: String(error),
      },
      "job failed"
    )
    await ctx.queue.fail(job.id, error)
  }
}

export async function runQueue(
  ctx: WorkerContext,
  signal: AbortSignal
): Promise<void> {
  let lastSweep = 0

  while (!signal.aborted) {
    if (Date.now() - lastSweep > STALE_SWEEP_MS) {
      lastSweep = Date.now()
      const requeued = await ctx.queue.requeueStale(STALE_AFTER_MS)
      if (requeued > 0) {
        ctx.logger.warn({ requeued }, "recovered jobs from a dead worker")
      }
    }

    const jobs = await ctx.queue.claim(ALL_TYPES, BATCH_SIZE)

    if (jobs.length === 0) {
      await sleep(IDLE_DELAY_MS)
      continue
    }

    // Different jobs touch different rows, and one slow generation should not
    // hold up a publish that is ready to go.
    await Promise.all(jobs.map((job) => runOne(ctx, job)))
  }
}
