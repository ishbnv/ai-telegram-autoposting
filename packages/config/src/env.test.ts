import { describe, expect, it } from "vitest"

import { z } from "zod"

import {
  apiEnvShape,
  baseEnvShape,
  EnvironmentError,
  openRouterEnvShape,
  optionalEnv,
  parseEnv,
  telegramEnvShape,
} from "./env"

describe("optionalEnv", () => {
  const shape = {
    TOKEN: optionalEnv(z.string().min(1)),
    CHAT_ID: optionalEnv(z.coerce.bigint()),
  }

  it("treats a blank value as absent, the way a copied .env.example looks", () => {
    expect(parseEnv(shape, { TOKEN: "", CHAT_ID: "   " })).toEqual({
      TOKEN: undefined,
      CHAT_ID: undefined,
    })
  })

  it("treats a missing key as absent", () => {
    expect(parseEnv(shape, {})).toEqual({
      TOKEN: undefined,
      CHAT_ID: undefined,
    })
  })

  it("still validates a value that is actually present", () => {
    expect(parseEnv(shape, { TOKEN: "123:abc", CHAT_ID: "-100" })).toEqual({
      TOKEN: "123:abc",
      CHAT_ID: -100n,
    })

    expect(() => parseEnv(shape, { CHAT_ID: "not-a-number" })).toThrow(
      EnvironmentError
    )
  })
})

describe("parseEnv", () => {
  it("applies defaults for optional variables", () => {
    expect(parseEnv(baseEnvShape, {})).toEqual({
      NODE_ENV: "development",
      LOG_LEVEL: "info",
      TZ: "UTC",
    })
  })

  it("coerces numeric and bigint variables", () => {
    const telegram = parseEnv(telegramEnvShape, {
      TELEGRAM_BOT_TOKEN: "123:abc",
      TELEGRAM_MODERATION_CHAT_ID: "-1001234567890",
    })

    expect(telegram.TELEGRAM_MODERATION_CHAT_ID).toBe(-1001234567890n)

    const api = parseEnv(apiEnvShape, {
      API_PORT: "8080",
      ADMIN_PASSWORD_HASH: "hash",
      SESSION_SECRET: "s".repeat(32),
    })

    expect(api.API_PORT).toBe(8080)
  })

  it("names the offending variable when one is missing", () => {
    expect(() => parseEnv(openRouterEnvShape, {})).toThrow(EnvironmentError)

    try {
      parseEnv(openRouterEnvShape, {})
    } catch (error) {
      expect((error as Error).message).toContain("OPENROUTER_API_KEY")
    }
  })

  it("never echoes the offending value, since these end up in logs", () => {
    try {
      parseEnv(apiEnvShape, {
        ADMIN_PASSWORD_HASH: "hash",
        SESSION_SECRET: "too-short",
      })
    } catch (error) {
      expect((error as Error).message).toContain("SESSION_SECRET")
      expect((error as Error).message).not.toContain("too-short")
    }
  })

  it("rejects a session secret short enough to brute-force", () => {
    expect(() =>
      parseEnv(apiEnvShape, {
        ADMIN_PASSWORD_HASH: "hash",
        SESSION_SECRET: "short",
      })
    ).toThrow(EnvironmentError)
  })
})
