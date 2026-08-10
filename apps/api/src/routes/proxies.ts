import {
  createProxySchema,
  idParamSchema,
  updateProxySchema,
  type ProxyDto,
} from "@contracts"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { toProxyDto } from "../lib/dto"

/**
 * Note the asymmetry: proxy URLs go in with credentials and come back masked,
 * so editing one means re-entering it. That is deliberate — the panel is served
 * over the public internet in most deployments.
 */
export const proxyRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const proxies = await c.get("prisma").proxy.findMany({
      orderBy: { createdAt: "asc" },
    })

    return c.json<ProxyDto[]>(proxies.map(toProxyDto))
  })

  .post("/", validate("json", createProxySchema), async (c) => {
    const input = c.req.valid("json")

    const proxy = await c.get("prisma").proxy.create({
      data: {
        label: input.label,
        url: input.url,
        usedFor: input.usedFor,
        isActive: input.isActive,
      },
    })

    return c.json<ProxyDto>(toProxyDto(proxy), 201)
  })

  .get("/:id", validate("param", idParamSchema), async (c) => {
    const proxy = await c.get("prisma").proxy.findUnique({
      where: { id: c.req.valid("param").id },
    })

    if (!proxy) {
      throw new HTTPException(404, { message: "Proxy not found" })
    }

    return c.json<ProxyDto>(toProxyDto(proxy))
  })

  .patch(
    "/:id",
    validate("param", idParamSchema),
    validate("json", updateProxySchema),
    async (c) => {
      const input = c.req.valid("json")

      const proxy = await c.get("prisma").proxy.update({
        where: { id: c.req.valid("param").id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.url !== undefined ? { url: input.url } : {}),
          ...(input.usedFor !== undefined ? { usedFor: input.usedFor } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      })

      return c.json<ProxyDto>(toProxyDto(proxy))
    }
  )

  .delete("/:id", validate("param", idParamSchema), async (c) => {
    await c.get("prisma").proxy.delete({
      where: { id: c.req.valid("param").id },
    })

    return c.body(null, 204)
  })
