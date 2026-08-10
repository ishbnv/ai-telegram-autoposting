import type { Context } from "hono"
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie"

export const SESSION_COOKIE = "atp_session"

const SESSION_TTL_SEC = 7 * 24 * 60 * 60

type SessionPayload = {
  /** Unix seconds. */
  exp: number
}

export async function startSession(
  c: Context,
  secret: string,
  secure: boolean
): Promise<number> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  const payload: SessionPayload = { exp }

  await setSignedCookie(c, SESSION_COOKIE, JSON.stringify(payload), secret, {
    httpOnly: true,
    // Lax still sends the cookie on top-level navigation, which is all the panel
    // needs, while keeping it off cross-site requests.
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  })

  return exp
}

export function endSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" })
}

/**
 * Returns the expiry of a valid session, or null. A tampered signature makes
 * `getSignedCookie` return false, which lands in the same branch as "absent".
 */
export async function readSession(
  c: Context,
  secret: string
): Promise<number | null> {
  const raw = await getSignedCookie(c, secret, SESSION_COOKIE)
  if (!raw) {
    return null
  }

  try {
    const payload = JSON.parse(raw) as Partial<SessionPayload>
    if (typeof payload.exp !== "number") {
      return null
    }

    return payload.exp > Math.floor(Date.now() / 1000) ? payload.exp : null
  } catch {
    return null
  }
}
