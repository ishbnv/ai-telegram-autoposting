import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const uiSrc = path.resolve(__dirname, "../../packages/ui/src")
const packages = path.resolve(__dirname, "../../packages")
const tokens = path
  .resolve(__dirname, "./src/styles/_tokens.scss")
  .replace(/\\/g, "/")

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Order matters and the patterns are anchored: a bare "@ui" resolves to the
    // component barrel, while "@ui/lib/utils" resolves inside the package.
    // "@api" is deliberately absent — it is a type-only import.
    alias: [
      { find: /^@ui$/, replacement: path.join(uiSrc, "components") },
      { find: /^@ui\//, replacement: `${uiSrc}/` },
      {
        find: /^@contracts$/,
        replacement: path.join(packages, "contracts/src/index.ts"),
      },
      { find: /^@\//, replacement: `${path.resolve(__dirname, "./src")}/` },
    ],
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Every module gets the tokens without an @use line of its own.
        additionalData: `@use "${tokens}" as *;\n`,
      },
    },
  },
  server: {
    // The panel talks to the API on its own port in development.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
})
