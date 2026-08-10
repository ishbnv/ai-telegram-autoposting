import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@ui/styles/globals.css"

import { ThemeProvider } from "@/components/theme-provider"
import { App } from "@/App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
