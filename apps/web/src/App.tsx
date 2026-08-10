import { Toaster } from "@ui"
import { useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppLayout } from "@/components/layout/AppLayout"
import { ChannelsPage } from "@/pages/Channels"
import { LoginPage } from "@/pages/Login"
import { OverviewPage } from "@/pages/Overview"
import { PipelinesPage } from "@/pages/Pipelines"
import { PromptsPage } from "@/pages/Prompts"
import { ProxiesPage } from "@/pages/Proxies"
import { SettingsPage } from "@/pages/Settings"
import { SourcesPage } from "@/pages/Sources"
import { useAuth } from "@/store/auth"

export function App() {
  const { authenticated, checked, check } = useAuth()

  useEffect(() => {
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rendering the login screen before /auth/me answers would flash it on every
  // reload for an already-signed-in user.
  if (!checked) {
    return null
  }

  if (!authenticated) {
    return (
      <>
        <LoginPage />
        <Toaster />
      </>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="pipelines" element={<PipelinesPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="prompts" element={<PromptsPage />} />
          <Route path="proxies" element={<ProxiesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
