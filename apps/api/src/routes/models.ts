import type { ModelDto } from "@contracts"
import { OpenRouterClient } from "@core"
import { resolveProxyUrl } from "@db"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"

/** The catalogue changes rarely; refetching it per keystroke would be rude. */
const CACHE_TTL_MS = 60 * 60 * 1000
const PER_MILLION = 1_000_000

let cache: { fetchedAt: number; models: ModelDto[] } | null = null

export const modelRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const env = c.get("env")

  if (!env.OPENROUTER_API_KEY) {
    throw new HTTPException(503, {
      message: "OPENROUTER_API_KEY is not configured",
    })
  }

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return c.json<ModelDto[]>(cache.models)
  }

  // Built per request, so this one picks up a proxy change without a restart.
  const proxyUrl = await resolveProxyUrl(c.get("prisma"), "LLM")

  const client = new OpenRouterClient({
    apiKey: env.OPENROUTER_API_KEY,
    appUrl: env.OPENROUTER_APP_URL,
    appTitle: env.OPENROUTER_APP_TITLE,
    ...(proxyUrl ? { proxyUrl } : {}),
  })

  const models = (await client.listModels()).map<ModelDto>((model) => ({
    id: model.id,
    name: model.name,
    contextLength: model.contextLength,
    promptUsdPerMillion: model.pricing.prompt * PER_MILLION,
    completionUsdPerMillion: model.pricing.completion * PER_MILLION,
  }))

  cache = { fetchedAt: Date.now(), models }

  return c.json<ModelDto[]>(models)
})
