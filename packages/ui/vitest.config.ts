import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // No DOM: these tests assert the source of vendored components rather than
    // their rendered output, which is what makes them cheap enough to keep.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
