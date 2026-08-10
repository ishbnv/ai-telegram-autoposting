import type { Logger } from "@config"
import type { JobQueue, TelegramClient } from "@core"
import type { PrismaClient } from "@db"

import type { BotEnv } from "./env"

export type BotContext = {
  prisma: PrismaClient
  queue: JobQueue
  telegram: TelegramClient
  logger: Logger
  env: BotEnv
}
