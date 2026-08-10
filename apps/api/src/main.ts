import { hostname } from "node:os"
import { fileURLToPath } from "node:url"

import { createLogger, loadEnvFile } from "@config"
import { JobQueue } from "@core"
import { createPrismaClient } from "@db"
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"

import { createApp } from "./app"
import { loadApiEnv } from "./env"

const HEARTBEAT_INTERVAL_MS = 30_000

loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)))

const env = loadApiEnv()
const instanceId = `${hostname()}:${process.pid}`

const logger = createLogger({
  name: "api",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== "production",
})

const prisma = createPrismaClient(env.DATABASE_URL)
const queue = new JobQueue(prisma, `api:${instanceId}`)
const app = createApp({ prisma, queue, logger, env })

// In production the API also serves the built panel, so a deployment is one
// container and one port rather than a reverse proxy exercise.
if (env.NODE_ENV === "production") {
  const root = process.env["WEB_DIST_DIR"] ?? "../web/dist"

  app.use("/assets/*", serveStatic({ root }))
  app.get("*", serveStatic({ root, path: "index.html" }))
}

async function beat() {
  try {
    await prisma.heartbeat.upsert({
      where: { process_instanceId: { process: "API", instanceId } },
      create: { process: "API", instanceId, meta: {} },
      update: { meta: {} },
    })
  } catch (error) {
    logger.warn({ err: error }, "heartbeat failed")
  }
}

await beat()
const heartbeat = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  logger.info({ port: info.port, env: env.NODE_ENV }, "api listening")
})

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down")
  clearInterval(heartbeat)
  server.close()
  await prisma.heartbeat
    .deleteMany({ where: { process: "API", instanceId } })
    .catch(() => undefined)
  await prisma.$disconnect()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
