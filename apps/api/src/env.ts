import {
  apiEnvShape,
  baseEnvShape,
  databaseEnvShape,
  openRouterEnvShape,
  optionalEnv,
  parseEnv,
} from "@config"
import { z } from "zod"

/**
 * The API needs the OpenRouter key only to proxy the model catalogue, and the
 * bot token only to report whether Telegram is configured — so both are optional
 * here and their absence shows up in the Settings screen rather than at boot.
 */
const optionalIntegrationShape = {
  TELEGRAM_BOT_TOKEN: optionalEnv(z.string().min(1)),
  TELEGRAM_MODERATION_CHAT_ID: optionalEnv(z.coerce.bigint()),
  OPENROUTER_API_KEY: optionalEnv(z.string().min(1)),
  OPENROUTER_APP_URL: openRouterEnvShape.OPENROUTER_APP_URL,
  OPENROUTER_APP_TITLE: openRouterEnvShape.OPENROUTER_APP_TITLE,
}

export function loadApiEnv() {
  return parseEnv({
    ...baseEnvShape,
    ...databaseEnvShape,
    ...apiEnvShape,
    ...optionalIntegrationShape,
  })
}

export type ApiEnv = ReturnType<typeof loadApiEnv>
