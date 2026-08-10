import { getConnInfo } from "@hono/node-server/conninfo"
import { loginSchema, type ApiError, type SessionDto } from "@contracts"
import { Hono } from "hono"

import type { AppEnv } from "../context"
import { LoginGuard } from "../lib/loginGuard"
import { validate } from "../lib/validate"
import { verifyPassword } from "../lib/password"
import { endSession, readSession, startSession } from "../lib/session"

/**
 * Process-wide, deliberately: the panel is single-instance by design, and a
 * per-request guard would defeat the point. Restarting the API clears it, which
 * is acceptable — an attacker cannot restart it.
 */
const guard = new LoginGuard()

/**
 * The source address from the socket, not `X-Forwarded-For`. That header is
 * attacker-controlled unless a trusted proxy overwrites it, and treating it as
 * an identity would let one client rotate through unlimited buckets. Behind a
 * reverse proxy every request shares the proxy's address, which is why the
 * guard also enforces a global ceiling.
 */
function clientKey(c: Parameters<typeof getConnInfo>[0]): string {
  try {
    return getConnInfo(c).remote.address ?? SHARED_KEY
  } catch {
    // No socket to read — another adapter, or a test calling app.request().
    // Everyone lands in one bucket, which the global ceiling still bounds.
    // Failing open here would 500 the whole login route.
    return SHARED_KEY
  }
}

const SHARED_KEY = "unknown"

export const authRoutes = new Hono<AppEnv>()
  .post("/login", validate("json", loginSchema), async (c) => {
    const { password } = c.req.valid("json")
    const env = c.get("env")
    const client = clientKey(c)

    // Before the key derivation, never after: scrypt is the expensive part, and
    // an unauthenticated caller must not be able to make us run it at will.
    const admission = guard.admit(client)

    if (!admission.allowed) {
      const { reason, retryAfterSec } = admission.denial

      c.get("logger").warn({ reason }, "login refused by the rate limiter")
      c.header("Retry-After", String(retryAfterSec))

      return c.json<ApiError>(
        { error: { message: "Too many attempts. Try again later." } },
        429
      )
    }

    try {
      const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH)

      if (!ok) {
        guard.recordFailure(client)
        c.get("logger").warn("failed login")

        return c.json<ApiError>({ error: { message: "Invalid password" } }, 401)
      }

      guard.recordSuccess(client)

      const expiresAt = await startSession(
        c,
        env.SESSION_SECRET,
        env.NODE_ENV === "production"
      )

      return c.json<SessionDto>({ authenticated: true, expiresAt })
    } finally {
      admission.release()
    }
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
