import { fileURLToPath } from "node:url"

import { config as loadEnv } from "dotenv"
import { defineConfig } from "prisma/config"

// The Prisma CLI runs with this package as its working directory, but the
// environment file lives at the repository root.
loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)) })

const databaseUrl = process.env["DATABASE_URL"]

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  /**
   * Omitted rather than read through `env()`, which throws the moment this file
   * is loaded. `prisma generate` needs no datasource and runs on postinstall —
   * before a fresh clone has had any chance to write .env — so demanding the
   * URL here makes `pnpm install` fail for every new contributor and in CI.
   * Migration and introspection commands still refuse to run without it, which
   * is where the requirement actually belongs.
   */
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
})
