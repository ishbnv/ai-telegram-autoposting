import type { SettingsDto } from "@contracts"
import { Hono } from "hono"

import type { AppEnv } from "../context"

/**
 * Reports whether each integration is configured, never the values. Secrets come
 * from the environment and are not editable through the panel by design.
 */
export const settingsRoutes = new Hono<AppEnv>().get("/", (c) => {
  const env = c.get("env")

  return c.json<SettingsDto>({
    telegramBotConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
    openRouterConfigured: Boolean(env.OPENROUTER_API_KEY),
    defaultModerationChatId:
      env.TELEGRAM_MODERATION_CHAT_ID?.toString() ?? null,
    // TZ, and only TZ. Every process derives its day boundaries from the same
    // variable, so reporting anything else here would be a second source of
    // truth that quietly disagrees with the counters.
    timezone: env.TZ,
  })
})
