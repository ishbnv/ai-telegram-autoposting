import {
  createSourceSchema,
  idParamSchema,
  updateSourceSchema,
  type SourceDto,
} from "@contracts"
import type { Prisma } from "@db"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { toSourceDto } from "../lib/dto"

export const sourceRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const sources = await c.get("prisma").source.findMany({
      orderBy: { createdAt: "asc" },
    })

    return c.json<SourceDto[]>(sources.map(toSourceDto))
  })

  .post("/", validate("json", createSourceSchema), async (c) => {
    const input = c.req.valid("json")

    const source = await c.get("prisma").source.create({
      data: {
        type: input.type,
        name: input.name,
        url: input.url,
        config: input.config as Prisma.InputJsonValue,
        isActive: input.isActive,
        fetchIntervalSec: input.fetchIntervalSec,
        proxyId: input.proxyId ?? null,
      },
    })

    return c.json<SourceDto>(toSourceDto(source), 201)
  })

  .get("/:id", validate("param", idParamSchema), async (c) => {
    const source = await c.get("prisma").source.findUnique({
      where: { id: c.req.valid("param").id },
    })

    if (!source) {
      throw new HTTPException(404, { message: "Source not found" })
    }

    return c.json<SourceDto>(toSourceDto(source))
  })

  .patch(
    "/:id",
    validate("param", idParamSchema),
    validate("json", updateSourceSchema),
    async (c) => {
      const input = c.req.valid("json")

      const source = await c.get("prisma").source.update({
        where: { id: c.req.valid("param").id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.url !== undefined ? { url: input.url } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.fetchIntervalSec !== undefined
            ? { fetchIntervalSec: input.fetchIntervalSec }
            : {}),
          ...(input.proxyId !== undefined
            ? { proxyId: input.proxyId ?? null }
            : {}),
          ...(input.config !== undefined
            ? { config: input.config as Prisma.InputJsonValue }
            : {}),
          // A successful save is the operator's way of saying "I fixed it".
          ...(input.url !== undefined || input.config !== undefined
            ? { lastError: null }
            : {}),
        },
      })

      return c.json<SourceDto>(toSourceDto(source))
    }
  )

  .delete("/:id", validate("param", idParamSchema), async (c) => {
    await c.get("prisma").source.delete({
      where: { id: c.req.valid("param").id },
    })

    return c.body(null, 204)
  })
