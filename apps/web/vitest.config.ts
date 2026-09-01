import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))
const packages = path.resolve(root, "../../packages")

export default defineConfig({
  resolve: {
    // Mirrors the aliases in vite.config.ts and the tsconfig paths.
    alias: [
      { find: /^@\//, replacement: `${path.join(root, "src")}/` },
      {
        find: /^@contracts$/,
        replacement: path.join(packages, "contracts/src/index.ts"),
      },
    ],
  },
  test: {
    /**
     * Node, not a DOM: what is covered here is the pure logic behind the
     * screens — formatting and error shaping — which is where the panel's
     * silent-wrong-answer bugs live. Component rendering would need a DOM
     * runtime this repository has no other use for.
     */
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Formatting depends on the ambient zone, so pin it rather than assert
    // whatever the machine running the suite happens to be set to.
    env: { TZ: "UTC" },
  },
})
