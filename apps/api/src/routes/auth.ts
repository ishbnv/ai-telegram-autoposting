import { loginSchema, type SessionDto } from "@contracts"
import { Hono } from "hono"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { verifyPassword } from "../lib/password"
import { endSession, readSession, startSession } from "../lib/session"

/** Slows down guessing without needing a store to track attempts. */
const FAILED_LOGIN_DELAY_MS = 750

export const authRoutes = new Hono<AppEnv>()
  .post("/login", validate("json", loginSchema), async (c) => {
    const { password } = c.req.valid("json")
    const env = c.get("env")

    const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH)

    if (!ok) {
      c.get("logger").warn(
        { ip: c.req.header("x-forwarded-for") },
        "failed login"
      )
      await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS))
      return c.json({ error: { message: "Invalid password" } }, 401)
    }

    const expiresAt = await startSession(
      c,
      env.SESSION_SECRET,
      env.NODE_ENV === "production"
    )

    return c.json<SessionDto>({ authenticated: true, expiresAt })
  })

  .post("/logout", (c) => {
    endSession(c)
    return c.json<SessionDto>({ authenticated: false, expiresAt: null })
  })

  .get("/me", async (c) => {
    const expiresAt = await readSession(c, c.get("env").SESSION_SECRET)

    return c.json<SessionDto>({
      authenticated: expiresAt !== null,
      expiresAt,
    })
  })
