import { hostname } from "node:os"
import { fileURLToPath } from "node:url"

import { createLogger, loadEnvFile, redditCredentials } from "@config"
import { JobQueue, OpenRouterClient, TelegramClient } from "@core"
import { createPrismaClient, resolveProxyUrl } from "@db"

import type { WorkerContext } from "./context"
import { loadWorkerEnv } from "./env"
import { runQueue } from "./runner"
import { runScheduler } from "./scheduler"

const HEARTBEAT_INTERVAL_MS = 30_000

loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)))

const env = loadWorkerEnv()
const instanceId = `${hostname()}:${process.pid}`

const logger = createLogger({
  name: "worker",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== "production",
})

const prisma = createPrismaClient(env.DATABASE_URL)

// Read once at boot: these clients live for the life of the process. Source
// proxies are resolved per fetch instead, because they hang off the source row.
const [llmProxyUrl, telegramProxyUrl] = await Promise.all([
  resolveProxyUrl(prisma, "LLM"),
  resolveProxyUrl(prisma, "TELEGRAM"),
])

const ctx: WorkerContext = {
  prisma,
  // Resolved here so a half-configured credential stops the worker at boot
  // rather than looking like Reddit blocking us at the next fetch.
  reddit: redditCredentials(env),
  queue: new JobQueue(prisma, `worker:${instanceId}`),
  telegram: new TelegramClient({
    token: env.TELEGRAM_BOT_TOKEN,
    ...(telegramProxyUrl ? { proxyUrl: telegramProxyUrl } : {}),
  }),
  llm: new OpenRouterClient({
    apiKey: env.OPENROUTER_API_KEY,
    appUrl: env.OPENROUTER_APP_URL,
    appTitle: env.OPENROUTER_APP_TITLE,
    ...(llmProxyUrl ? { proxyUrl: llmProxyUrl } : {}),
  }),
  logger,
  env,
}

// Logged without the URL: it carries credentials.
logger.info(
  { llm: Boolean(llmProxyUrl), telegram: Boolean(telegramProxyUrl) },
  "proxy configuration"
)

async function beat() {
  try {
    await prisma.heartbeat.upsert({
      where: { process_instanceId: { process: "WORKER", instanceId } },
      create: { process: "WORKER", instanceId, meta: {} },
      update: { meta: {} },
    })
  } catch (error) {
    logger.warn({ err: String(error) }, "heartbeat failed")
  }
}

const controller = new AbortController()

await beat()
const heartbeat = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)

logger.info({ instanceId, tz: env.TZ }, "worker started")

// The scheduler decides what is due; the runner does the work. Both loop until
// the process is asked to stop.
const loops = Promise.all([
  runScheduler(ctx, controller.signal),
  runQueue(ctx, controller.signal),
])

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down")
  controller.abort()
  clearInterval(heartbeat)

  // Give in-flight jobs a moment; anything still running is left locked and
  // recovered by requeueStale on the next worker to come up.
  await Promise.race([
    loops,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])

  await prisma.heartbeat
    .deleteMany({ where: { process: "WORKER", instanceId } })
    .catch(() => undefined)
  await prisma.$disconnect()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))

await loops
