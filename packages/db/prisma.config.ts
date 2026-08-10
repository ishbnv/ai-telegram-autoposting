import { fileURLToPath } from "node:url"

import { config as loadEnv } from "dotenv"
import { defineConfig, env } from "prisma/config"

// The Prisma CLI runs with this package as its working directory, but the
// environment file lives at the repository root.
loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
