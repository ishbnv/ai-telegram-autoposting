import { hostname } from "node:os"
import { fileURLToPath } from "node:url"

import { createLogger, loadEnvFile } from "@config"
import { JobQueue, TelegramClient } from "@core"
import { createPrismaClient, resolveProxyUrl } from "@db"

import type { BotContext } from "./context"
import { loadBotEnv } from "./env"
import { runPolling } from "./polling"

const HEARTBEAT_INTERVAL_MS = 30_000

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

// Fail loudly at boot rather than silently polling with a bad token. The id is
// also what lets the edit flow tell our own prompts from a user's imitation.
const me = await telegram.getMe()

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
