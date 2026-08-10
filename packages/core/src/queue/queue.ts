import type { Job, JobType, Prisma, PrismaClient } from "@db"

/** Keeps a stack trace from turning the row into a log dump. */
const MAX_ERROR_CHARS = 2000
const DEFAULT_RETRY_DELAY_MS = 30_000

export type EnqueueInput = {
  type: JobType
  payload?: Prisma.InputJsonValue
  runAt?: Date
  /**
   * Makes enqueueing idempotent, e.g. `publish:<postId>`. A second attempt with
   * the same key returns null instead of creating a duplicate job.
   */
  dedupeKey?: string
  maxAttempts?: number
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  )
}

/**
 * A work queue on top of Postgres. Claiming uses `FOR UPDATE SKIP LOCKED`, so
 * several workers can poll the same table without handing each other the same
 * job and without a broker in the stack.
 */
export class JobQueue {
  constructor(
    private readonly prisma: PrismaClient,
    /** Identifies the process holding a lock; shows up in `lockedBy`. */
    private readonly workerId: string
  ) {}

  async enqueue(input: EnqueueInput): Promise<Job | null> {
    try {
      return await this.prisma.job.create({
        data: {
          type: input.type,
          payload: input.payload ?? {},
          ...(input.runAt ? { runAt: input.runAt } : {}),
          ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
          ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
        },
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * Atomically moves up to `limit` due jobs to RUNNING and returns them. Rows
   * locked by another worker are skipped rather than waited on.
   */
  async claim(types: JobType[], limit = 1): Promise<Job[]> {
    if (types.length === 0) {
      return []
    }

    return this.prisma.$queryRaw<Job[]>`
      UPDATE "Job"
      SET status = 'RUNNING',
          "lockedAt" = now(),
          "lockedBy" = ${this.workerId},
          attempts = "Job".attempts + 1,
          "updatedAt" = now()
      WHERE id IN (
        SELECT id
        FROM "Job"
        WHERE status = 'PENDING'
          AND "runAt" <= now()
          AND type::text = ANY(${types}::text[])
        ORDER BY "runAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `
  }

  async complete(id: string): Promise<void> {
    await this.prisma.job.update({
      where: { id },
      data: {
        status: "DONE",
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        // The key exists to stop two *in-flight* copies of the same work. Left
        // in place it would also block ever doing that work again.
        dedupeKey: null,
      },
    })
  }

  /**
   * Records a failure and either schedules a retry or gives up, depending on how
   * many attempts the job has already burned.
   */
  async fail(
    id: string,
    error: unknown,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  ): Promise<void> {
    const message = describe(error).slice(0, MAX_ERROR_CHARS)
    const seconds = Math.max(1, Math.round(retryDelayMs / 1000))

    await this.prisma.$executeRaw`
      UPDATE "Job"
      SET status = CASE
            WHEN attempts >= "maxAttempts" THEN 'FAILED'::"JobStatus"
            ELSE 'PENDING'::"JobStatus"
          END,
          "runAt" = CASE
            WHEN attempts >= "maxAttempts" THEN "runAt"
            ELSE now() + (${seconds} * interval '1 second')
          END,
          -- Released once the job is terminal, so the same work can be queued
          -- again; retries keep it so a duplicate cannot slip in meanwhile.
          "dedupeKey" = CASE
            WHEN attempts >= "maxAttempts" THEN NULL
            ELSE "dedupeKey"
          END,
          "lastError" = ${message},
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "updatedAt" = now()
      WHERE id = ${id}
    `
  }

  /**
   * Returns jobs abandoned by a process that died mid-run. Without this they sit
   * in RUNNING forever, because nothing else will ever unlock them.
   */
  async requeueStale(staleAfterMs: number): Promise<number> {
    const seconds = Math.max(1, Math.round(staleAfterMs / 1000))

    return this.prisma.$executeRaw`
      UPDATE "Job"
      SET status = 'PENDING',
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "updatedAt" = now()
      WHERE status = 'RUNNING'
        AND "lockedAt" < now() - (${seconds} * interval '1 second')
    `
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`
  }

  return String(error)
}
