import { getSourceAdapter } from "@core"
import type { Prisma } from "@db"
import { z } from "zod"

import type { WorkerContext } from "@/context"

export const fetchSourcePayload = z.object({ sourceId: z.string().min(1) })

/** Guards against a misconfigured selector dumping a whole site into the table. */
const MAX_ITEMS_PER_FETCH = 100

export async function handleFetchSource(
  ctx: WorkerContext,
  payload: unknown
): Promise<void> {
  const { sourceId } = fetchSourcePayload.parse(payload)

  const source = await ctx.prisma.source.findUnique({
    where: { id: sourceId },
    include: { proxy: true },
  })

  if (!source || !source.isActive) {
    ctx.logger.debug({ sourceId }, "source is gone or paused, skipping fetch")
    return
  }

  const adapter = getSourceAdapter(source.type)
  const proxyUrl =
    source.proxy?.isActive && source.proxy.usedFor === "SOURCE"
      ? source.proxy.url
      : undefined

  try {
    const items = await adapter.fetch({
      url: source.url,
      config: source.config,
      ...(proxyUrl ? { proxyUrl } : {}),
    })

    const rows: Prisma.NewsItemCreateManyInput[] = items
      .slice(0, MAX_ITEMS_PER_FETCH)
      .map((item) => ({
        sourceId: source.id,
        externalId: item.externalId,
        title: item.title,
        url: item.url,
        summary: item.summary ?? null,
        content: item.content ?? null,
        imageUrl: item.imageUrl ?? null,
        author: item.author ?? null,
        publishedAt: item.publishedAt ?? null,
      }))

    // The unique index on (sourceId, externalId) is the deduplication; this
    // just tells Postgres to ignore the ones we have already seen.
    const { count } = await ctx.prisma.newsItem.createMany({
      data: rows,
      skipDuplicates: true,
    })

    await ctx.prisma.source.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date(), lastError: null },
    })

    ctx.logger.info(
      { sourceId, name: source.name, seen: rows.length, added: count },
      "source fetched"
    )
  } catch (error) {
    // Surface the reason in the admin panel, then let the queue retry.
    await ctx.prisma.source.update({
      where: { id: source.id },
      data: {
        lastFetchedAt: new Date(),
        lastError: error instanceof Error ? error.message : String(error),
      },
    })

    throw error
  }
}
