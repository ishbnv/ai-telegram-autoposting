import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Mirrors the `paths` entries in tsconfig.json.
    alias: {
      "@db": fileURLToPath(new URL("../db/src/index.ts", import.meta.url)),
      "@contracts": fileURLToPath(
        new URL("../contracts/src/index.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
