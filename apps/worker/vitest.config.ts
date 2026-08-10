import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const resolvePackage = (path: string) =>
  fileURLToPath(new URL(`../../packages/${path}`, import.meta.url))

export default defineConfig({
  resolve: {
    // Mirrors the `paths` entries in tsconfig.json.
    alias: {
      "@db": resolvePackage("db/src/index.ts"),
      "@core": resolvePackage("core/src/index.ts"),
      "@config": resolvePackage("config/src/index.ts"),
      "@contracts": resolvePackage("contracts/src/index.ts"),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
