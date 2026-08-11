import { hostname } from "node:os"
import { fileURLToPath } from "node:url"

import { createLogger, loadEnvFile } from "@config"
import {
  JobQueue,
  TelegramApiError,
  TelegramClient,
  type TelegramUser,
} from "@core"
import { createPrismaClient, resolveProxyUrl } from "@db"

import type { BotContext } from "./context"
import { loadBotEnv } from "./env"
import { runPolling } from "./polling"

const HEARTBEAT_INTERVAL_MS = 30_000
/** Backoff for the startup handshake: quick at first, then patient. */
const STARTUP_BASE_DELAY_MS = 2_000
const STARTUP_MAX_DELAY_MS = 60_000

loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)))

const env = loadBotEnv()
const instanceId = `${hostname()}:${process.pid}`

const logger = createLogger({
  name: "bot",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== "production",
})

const prisma = createPrismaClient(env.DATABASE_URL)

// Resolved at boot, like the worker's: the client outlives any single update.
const telegramProxyUrl = await resolveProxyUrl(prisma, "TELEGRAM")

const telegram = new TelegramClient({
  token: env.TELEGRAM_BOT_TOKEN,
  ...(telegramProxyUrl ? { proxyUrl: telegramProxyUrl } : {}),
})

/**
 * Identifies the bot before polling starts — the id is what lets the edit flow
 * tell our own prompts from a user's imitation, so there is nothing safe to do
 * without it.
 *
 * A rejected token and an unreachable Telegram are not the same failure, and
 * treating them alike is what turned a network outage into a crash loop: the
 * process exited, Docker restarted it, and it exited again, forever. A bad
 * token stays fatal — no amount of waiting fixes it. Everything else is worth
 * sitting out, because Telegram comes back.
 */
async function identify(): Promise<TelegramUser> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await telegram.getMe()
    } catch (error) {
      if (error instanceof TelegramApiError && error.errorCode === 401) {
        logger.fatal("TELEGRAM_BOT_TOKEN was rejected by Telegram")
        process.exit(1)
      }

      const delayMs = Math.min(
        STARTUP_MAX_DELAY_MS,
        STARTUP_BASE_DELAY_MS * 2 ** (attempt - 1)
      )

      logger.error(
        { attempt, delayMs, err: String(error) },
        "cannot reach Telegram, retrying"
      )

      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

const me = await identify()

const ctx: BotContext = {
  prisma,
  queue: new JobQueue(prisma, `bot:${instanceId}`),
  telegram,
  logger,
  env,
  botId: me.id,
}

async function beat() {
  try {
    await prisma.heartbeat.upsert({
      where: { process_instanceId: { process: "BOT", instanceId } },
      create: { process: "BOT", instanceId, meta: {} },
      update: { meta: {} },
    })
  } catch (error) {
    logger.warn({ err: String(error) }, "heartbeat failed")
  }
}

logger.info({ username: me.username, instanceId }, "bot started")

const controller = new AbortController()

await beat()
const heartbeat = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)

const polling = runPolling(ctx, controller.signal)

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down")
  controller.abort()
  clearInterval(heartbeat)

  // The in-flight long poll can hang for its full timeout; do not wait it out.
  await Promise.race([
    polling,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ])

  await prisma.heartbeat
    .deleteMany({ where: { process: "BOT", instanceId } })
    .catch(() => undefined)
  await prisma.$disconnect()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

await polling
