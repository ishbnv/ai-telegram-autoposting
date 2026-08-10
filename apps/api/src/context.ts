import type { Logger } from "@config"
import type { JobQueue } from "@core"
import type { PrismaClient } from "@db"

import type { ApiEnv } from "./env"

export type AppEnv = {
  Variables: {
    prisma: PrismaClient
    queue: JobQueue
    logger: Logger
    env: ApiEnv
  }
}

export type AppDeps = AppEnv["Variables"]
