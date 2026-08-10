import {
  createPromptSchema,
  idParamSchema,
  updatePromptSchema,
  type PromptDto,
} from "@contracts"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { toPromptDto } from "../lib/dto"

export const promptRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const prompts = await c.get("prisma").prompt.findMany({
      orderBy: { createdAt: "asc" },
    })

    return c.json<PromptDto[]>(prompts.map(toPromptDto))
  })

  .post("/", validate("json", createPromptSchema), async (c) => {
    const input = c.req.valid("json")

    const prompt = await c.get("prisma").prompt.create({
      data: {
        name: input.name,
        systemPrompt: input.systemPrompt,
        userTemplate: input.userTemplate,
        model: input.model,
        temperature: input.temperature ?? null,
        maxTokens: input.maxTokens ?? null,
        isActive: input.isActive,
      },
    })

    return c.json<PromptDto>(toPromptDto(prompt), 201)
  })

  .get("/:id", validate("param", idParamSchema), async (c) => {
    const prompt = await c.get("prisma").prompt.findUnique({
      where: { id: c.req.valid("param").id },
    })

    if (!prompt) {
      throw new HTTPException(404, { message: "Prompt not found" })
    }

    return c.json<PromptDto>(toPromptDto(prompt))
  })

  .patch(
    "/:id",
    validate("param", idParamSchema),
    validate("json", updatePromptSchema),
    async (c) => {
      const input = c.req.valid("json")

      const prompt = await c.get("prisma").prompt.update({
        where: { id: c.req.valid("param").id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.systemPrompt !== undefined
            ? { systemPrompt: input.systemPrompt }
            : {}),
          ...(input.userTemplate !== undefined
            ? { userTemplate: input.userTemplate }
            : {}),
          ...(input.model !== undefined ? { model: input.model } : {}),
          ...(input.temperature !== undefined
            ? { temperature: input.temperature ?? null }
            : {}),
          ...(input.maxTokens !== undefined
            ? { maxTokens: input.maxTokens ?? null }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      })

      return c.json<PromptDto>(toPromptDto(prompt))
    }
  )

  .delete("/:id", validate("param", idParamSchema), async (c) => {
    await c.get("prisma").prompt.delete({
      where: { id: c.req.valid("param").id },
    })

    return c.body(null, 204)
  })
