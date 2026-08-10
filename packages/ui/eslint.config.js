import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

// No react-refresh rules here, unlike apps/web. shadcn components legitimately export their
// variants next to the component itself (`buttonVariants` in button.tsx), which the
// only-export-components rule forbids. Fast refresh boundaries are the app's concern; this package
// is a component library.
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
