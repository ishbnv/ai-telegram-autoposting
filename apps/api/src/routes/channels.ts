import {
  createChannelSchema,
  idParamSchema,
  updateChannelSchema,
  type ChannelDto,
} from "@contracts"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { toChannelDto } from "../lib/dto"

export const channelRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const channels = await c.get("prisma").channel.findMany({
      orderBy: { createdAt: "asc" },
    })

    return c.json<ChannelDto[]>(channels.map(toChannelDto))
  })

  .post("/", validate("json", createChannelSchema), async (c) => {
    const input = c.req.valid("json")

    const channel = await c.get("prisma").channel.create({
      data: {
        title: input.title,
        tgChatId: BigInt(input.tgChatId),
        username: input.username ?? null,
        moderationChatId: BigInt(input.moderationChatId),
        footerTemplate: input.footerTemplate,
        isActive: input.isActive,
      },
    })

    return c.json<ChannelDto>(toChannelDto(channel), 201)
  })

  .get("/:id", validate("param", idParamSchema), async (c) => {
    const channel = await c.get("prisma").channel.findUnique({
      where: { id: c.req.valid("param").id },
    })

    if (!channel) {
      throw new HTTPException(404, { message: "Channel not found" })
    }

    return c.json<ChannelDto>(toChannelDto(channel))
  })

  .patch(
    "/:id",
    validate("param", idParamSchema),
    validate("json", updateChannelSchema),
    async (c) => {
      const input = c.req.valid("json")

      const channel = await c.get("prisma").channel.update({
        where: { id: c.req.valid("param").id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.tgChatId !== undefined
            ? { tgChatId: BigInt(input.tgChatId) }
            : {}),
          ...(input.username !== undefined
            ? { username: input.username ?? null }
            : {}),
          ...(input.moderationChatId !== undefined
            ? { moderationChatId: BigInt(input.moderationChatId) }
            : {}),
          ...(input.footerTemplate !== undefined
            ? { footerTemplate: input.footerTemplate }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      })

      return c.json<ChannelDto>(toChannelDto(channel))
    }
  )

  .delete("/:id", validate("param", idParamSchema), async (c) => {
    await c.get("prisma").channel.delete({
      where: { id: c.req.valid("param").id },
    })

    return c.body(null, 204)
  })
