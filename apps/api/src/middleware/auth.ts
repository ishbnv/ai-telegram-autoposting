import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"
import { readSession } from "../lib/session"

/**
 * Everything behind /api except the login endpoint and the health probe.
 * Single-user deployment, so a valid session is the whole authorisation model.
 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const expiresAt = await readSession(c, c.get("env").SESSION_SECRET)

  if (expiresAt === null) {
    throw new HTTPException(401, { message: "Not authenticated" })
  }

  await next()
})
