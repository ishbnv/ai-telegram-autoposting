import type { ApiError } from "@contracts"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppDeps, AppEnv } from "./context"
import { requireSession } from "./middleware/auth"
import { authRoutes } from "./routes/auth"
import { channelRoutes } from "./routes/channels"
import { dashboardRoutes } from "./routes/dashboard"
import { modelRoutes } from "./routes/models"
import { newsRoutes } from "./routes/news"
import { pipelineRoutes } from "./routes/pipelines"
import { postRoutes } from "./routes/posts"
import { promptRoutes } from "./routes/prompts"
import { proxyRoutes } from "./routes/proxies"
import { settingsRoutes } from "./routes/settings"
import { sourceRoutes } from "./routes/sources"

/** Prisma error codes worth translating into something the panel can act on. */
function statusForPrisma(code: string): 400 | 404 | 409 | null {
  switch (code) {
    case "P2025":
      return 404
    case "P2002":
      return 409
    case "P2003":
      return 400
    default:
      return null
  }
}

function prismaCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : null
  }

  return null
}

/**
 * The columns a P2002 collided on. Prisma reports them in `meta.target`, as an
 * array on most connectors and a string on some, so both are accepted.
 */
function conflictingFields(error: unknown): string[] {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return []
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target

  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === "string")
  }

  return typeof target === "string" ? [target] : []
}

/**
 * Names the field that collided. "Already exists" on its own sends an operator
 * looking for the wrong duplicate — a proxy may legitimately be reused for
 * several purposes, so being told the *label* is taken rather than the proxy is
 * the difference between renaming it and giving up.
 */
function conflictMessage(error: unknown): string {
  const fields = conflictingFields(error)

  if (fields.length === 0) {
    return "Already exists"
  }

  return `Another record already uses this ${fields.join(" + ")}`
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  app.use("*", async (c, next) => {
    c.set("prisma", deps.prisma)
    c.set("queue", deps.queue)
    c.set("logger", deps.logger)
    c.set("env", deps.env)
    await next()
  })

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json<ApiError>(
        { error: { message: error.message } },
        error.status
      )
    }

    const code = prismaCode(error)
    const status = code ? statusForPrisma(code) : null

    if (status === 404) {
      return c.json<ApiError>({ error: { message: "Not found" } }, 404)
    }
    if (status === 409) {
      return c.json<ApiError>(
        { error: { message: conflictMessage(error) } },
        409
      )
    }
    if (status === 400) {
      return c.json<ApiError>(
        { error: { message: "Referenced record does not exist" } },
        400
      )
    }

    deps.logger.error({ err: error, path: c.req.path }, "unhandled error")

    return c.json<ApiError>(
      { error: { message: "Internal server error" } },
      500
    )
  })

  // Reachable without a session: the health probe and the login flow itself.
  const publicApi = new Hono<AppEnv>()
    .get("/health", (c) => c.json({ ok: true }))
    .route("/auth", authRoutes)

  // Mounted after publicApi on purpose. Hono runs matching handlers in
  // registration order, so /api/auth/* is answered before this guard is reached.
  const privateApi = new Hono<AppEnv>()
    .use("*", requireSession)
    .route("/channels", channelRoutes)
    .route("/sources", sourceRoutes)
    .route("/prompts", promptRoutes)
    .route("/pipelines", pipelineRoutes)
    .route("/proxies", proxyRoutes)
    .route("/news", newsRoutes)
    .route("/posts", postRoutes)
    .route("/dashboard", dashboardRoutes)
    .route("/models", modelRoutes)
    .route("/settings", settingsRoutes)

  return app.route("/api", publicApi).route("/api", privateApi)
}

/** Consumed by the panel through Hono's RPC client. */
export type AppType = ReturnType<typeof createApp>
