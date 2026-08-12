import type { Logger } from "@config"
import type { JobQueue, OpenRouterClient, TelegramClient } from "@core"
import type { PrismaClient } from "@db"

import type { WorkerEnv } from "./env"

export type WorkerContext = {
  prisma: PrismaClient
  queue: JobQueue
  telegram: TelegramClient
  llm: OpenRouterClient
  logger: Logger
  env: WorkerEnv
  /** Application-only Reddit OAuth, resolved once at boot. */
  reddit: { clientId: string; clientSecret: string } | undefined
}
