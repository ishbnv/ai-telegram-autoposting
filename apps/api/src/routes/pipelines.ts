import {
  createPipelineSchema,
  idParamSchema,
  updatePipelineSchema,
  type PipelineDto,
} from "@contracts"
import type { Prisma } from "@db"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { toPipelineDto } from "../lib/dto"

const withSources = { sources: { select: { sourceId: true } } } as const

export const pipelineRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const pipelines = await c.get("prisma").pipeline.findMany({
      include: withSources,
      orderBy: { createdAt: "asc" },
    })

    return c.json<PipelineDto[]>(pipelines.map(toPipelineDto))
  })

  .post("/", validate("json", createPipelineSchema), async (c) => {
    const input = c.req.valid("json")

    const pipeline = await c.get("prisma").pipeline.create({
      data: {
        name: input.name,
        promptId: input.promptId,
        channelId: input.channelId,
        isActive: input.isActive,
        filters: input.filters as Prisma.InputJsonValue,
        cron: input.cron,
        maxPostsPerDay: input.maxPostsPerDay,
        freshnessWindowHours: input.freshnessWindowHours,
        sources: {
          create: input.sourceIds.map((sourceId) => ({ sourceId })),
        },
      },
      include: withSources,
    })

    return c.json<PipelineDto>(toPipelineDto(pipeline), 201)
  })

  .get("/:id", validate("param", idParamSchema), async (c) => {
    const pipeline = await c.get("prisma").pipeline.findUnique({
      where: { id: c.req.valid("param").id },
      include: withSources,
    })

    if (!pipeline) {
      throw new HTTPException(404, { message: "Pipeline not found" })
    }

    return c.json<PipelineDto>(toPipelineDto(pipeline))
  })

  .patch(
    "/:id",
    validate("param", idParamSchema),
    validate("json", updatePipelineSchema),
    async (c) => {
      const { id } = c.req.valid("param")
      const input = c.req.valid("json")

      const pipeline = await c.get("prisma").pipeline.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.promptId !== undefined ? { promptId: input.promptId } : {}),
          ...(input.channelId !== undefined
            ? { channelId: input.channelId }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.filters !== undefined
            ? { filters: input.filters as Prisma.InputJsonValue }
            : {}),
          ...(input.cron !== undefined ? { cron: input.cron } : {}),
          ...(input.maxPostsPerDay !== undefined
            ? { maxPostsPerDay: input.maxPostsPerDay }
            : {}),
          ...(input.freshnessWindowHours !== undefined
            ? { freshnessWindowHours: input.freshnessWindowHours }
            : {}),
          // Replacing the whole set is simpler to reason about than diffing it,
          // and the join rows carry no state of their own.
          ...(input.sourceIds !== undefined
            ? {
                sources: {
                  deleteMany: {},
                  create: input.sourceIds.map((sourceId) => ({ sourceId })),
                },
              }
            : {}),
        },
        include: withSources,
      })

      return c.json<PipelineDto>(toPipelineDto(pipeline))
    }
  )

  .delete("/:id", validate("param", idParamSchema), async (c) => {
    await c.get("prisma").pipeline.delete({
      where: { id: c.req.valid("param").id },
    })

    return c.body(null, 204)
  })

  /**
   * Queues an immediate run. Deduplicated per pipeline, so hammering the button
   * does not pile up identical work; the key is cleared when the worker finishes.
   */
  .post("/:id/run", validate("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param")
    const prisma = c.get("prisma")

    const pipeline = await prisma.pipeline.findUnique({ where: { id } })
    if (!pipeline) {
      throw new HTTPException(404, { message: "Pipeline not found" })
    }

    const job = await c.get("queue").enqueue({
      type: "RUN_PIPELINE",
      payload: { pipelineId: id },
      dedupeKey: `run-pipeline:${id}`,
    })

    return c.json({ queued: job !== null }, job ? 202 : 409)
  })
