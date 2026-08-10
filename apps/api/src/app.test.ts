import type { Logger } from "@config"
import type { JobQueue } from "@core"
import type { PrismaClient } from "@db"
import { beforeAll, describe, expect, it } from "vitest"

import { createApp } from "./app"
import type { ApiEnv } from "./env"
import { hashPassword } from "./lib/password"

const PASSWORD = "hunter2-hunter2"

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger

/**
 * These tests only exercise auth and the settings probe, neither of which
 * touches the database — an empty stub is enough, and anything that starts
 * querying will fail loudly rather than silently pass against a fake.
 */
const prisma = {} as unknown as PrismaClient

let app: ReturnType<typeof createApp>

beforeAll(async () => {
  const env = {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    TZ: "UTC",
    DATABASE_URL: "postgresql://unused",
    API_PORT: 3000,
    ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD),
    SESSION_SECRET: "s".repeat(32),
    OPENROUTER_APP_URL: "http://localhost:5173",
    OPENROUTER_APP_TITLE: "test",
  } as unknown as ApiEnv

  app = createApp({
    prisma,
    queue: {} as JobQueue,
    logger,
    env,
  })
})

async function login(): Promise<string> {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  })

  const cookie = response.headers.get("set-cookie")
  if (!cookie) {
    throw new Error("login did not set a cookie")
  }

  return cookie.split(";")[0] ?? ""
}

describe("health", () => {
  it("answers without a session", async () => {
    const response = await app.request("/api/health")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe("authentication", () => {
  it("locks the private area", async () => {
    const response = await app.request("/api/settings")
    expect(response.status).toBe(401)
  })

  it("reports an anonymous caller as unauthenticated rather than failing", async () => {
    const response = await app.request("/api/auth/me")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      authenticated: false,
      expiresAt: null,
    })
  })

  it("rejects the wrong password", async () => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("opens the private area once logged in", async () => {
    const cookie = await login()

    const response = await app.request("/api/settings", {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
  })

  it("issues an httpOnly cookie", async () => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    })

    expect(response.headers.get("set-cookie")).toContain("HttpOnly")
  })

  it("refuses a cookie signed with a different secret", async () => {
    const response = await app.request("/api/settings", {
      headers: { cookie: "atp_session=%7B%22exp%22%3A99999999999%7D.forged" },
    })

    expect(response.status).toBe(401)
  })
})

describe("validation errors", () => {
  it("uses the same envelope as every other error", async () => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        message: "Validation failed",
        fields: [{ path: "password" }],
      },
    })
  })
})

describe("settings", () => {
  it("reports which integrations are configured without leaking values", async () => {
    const cookie = await login()

    const response = await app.request("/api/settings", { headers: { cookie } })
    const body = await response.text()

    expect(JSON.parse(body)).toMatchObject({
      telegramBotConfigured: false,
      openRouterConfigured: false,
    })
    expect(body).not.toContain("s".repeat(32))
  })
})

/**
 * Last on purpose: the guard is process-wide, so tripping it would lock out
 * every test that ran after this one.
 */
describe("login rate limiting", () => {
  const guess = () =>
    app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    })

  it("stops answering after repeated failures and says when to return", async () => {
    let last = await guess()

    // The unit tests cover the limits themselves; this only proves the route
    // consults the guard and reports the refusal properly.
    for (let attempt = 0; attempt < 10 && last.status !== 429; attempt += 1) {
      last = await guess()
    }

    expect(last.status).toBe(429)
    expect(Number(last.headers.get("Retry-After"))).toBeGreaterThan(0)
    await expect(last.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining("Too many attempts") },
    })
  })
})
