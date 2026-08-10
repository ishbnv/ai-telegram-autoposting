import { z } from "zod"

import type { WorkerContext } from "@/context"
import { matchesFilters, readFilters } from "@/lib/filters"

export const runPipelinePayload = z.object({ pipelineId: z.string().min(1) })

/** Filtering happens in JS, so pull a generous window and narrow it here. */
const CANDIDATE_LIMIT = 200

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
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
 * Turns fresh items into drafts. It does not call the model itself: each post
 * gets its own GENERATE_POST job so a slow or failing generation retries on its
 * own instead of taking the whole pipeline run with it.
 */
export async function handleRunPipeline(
  ctx: WorkerContext,
  payload: unknown
): Promise<void> {
  const { pipelineId } = runPipelinePayload.parse(payload)

  const pipeline = await ctx.prisma.pipeline.findUnique({
    where: { id: pipelineId },
    include: { sources: { select: { sourceId: true } }, prompt: true },
  })

  if (!pipeline || !pipeline.isActive) {
    ctx.logger.debug({ pipelineId }, "pipeline is gone or paused, skipping run")
    return
  }

  // Stamp the run before doing the work: a crash mid-run must not leave the
  // scheduler convinced the pipeline is still overdue and fire it in a loop.
  await ctx.prisma.pipeline.update({
    where: { id: pipeline.id },
    data: { lastRunAt: new Date() },
  })

  if (!pipeline.prompt.isActive) {
    ctx.logger.info({ pipelineId }, "prompt is paused, nothing to generate")
    return
  }

  const publishedToday = await ctx.prisma.post.count({
    where: { pipelineId: pipeline.id, createdAt: { gte: startOfToday() } },
  })

  const budget = pipeline.maxPostsPerDay - publishedToday
  if (budget <= 0) {
    ctx.logger.info(
      { pipelineId, maxPostsPerDay: pipeline.maxPostsPerDay },
      "daily cap reached"
    )
    return
  }

  const cutoff = new Date(
    Date.now() - pipeline.freshnessWindowHours * 60 * 60 * 1000
  )

  const candidates = await ctx.prisma.newsItem.findMany({
    where: {
      sourceId: { in: pipeline.sources.map((link) => link.sourceId) },
      // Items without a publication date are judged by when we saw them.
      OR: [
        { publishedAt: { gte: cutoff } },
        { publishedAt: null, fetchedAt: { gte: cutoff } },
      ],
      // The unique index on (pipelineId, newsItemId) makes this the whole of
      // deduplication — an item this pipeline already used cannot come back.
      posts: { none: { pipelineId: pipeline.id } },
    },
    // The source name is denormalised onto the post, so it has to come along.
    include: { source: { select: { name: true } } },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: CANDIDATE_LIMIT,
  })

  const filters = readFilters(pipeline.filters)
  const selected = candidates
    .filter((item) => matchesFilters(item, filters))
    .slice(0, budget)

  let created = 0

  for (const item of selected) {
    try {
      const post = await ctx.prisma.post.create({
        data: {
          pipelineId: pipeline.id,
          newsItemId: item.id,
          channelId: pipeline.channelId,
          promptId: pipeline.promptId,
          model: pipeline.prompt.model,
          status: "GENERATING",
          sourceName: item.source.name,
          sourceUrl: item.url,
          mediaUrl: item.imageUrl,
        },
      })

      await ctx.prisma.newsItem.update({
        where: { id: item.id },
        data: { status: "TAKEN" },
      })

      await ctx.queue.enqueue({
        type: "GENERATE_POST",
        payload: { postId: post.id },
        dedupeKey: `generate:${post.id}`,
      })

      created += 1
    } catch (error) {
      // Another run got there first. Nothing to do and nothing to report.
      if (!isUniqueViolation(error)) {
        throw error
      }
    }
  }

  ctx.logger.info(
    { pipelineId, candidates: candidates.length, created },
    "pipeline run finished"
  )
}
