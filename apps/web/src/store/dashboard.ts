import type { DashboardSummary } from "@contracts"
import { create } from "zustand"

import { apiClient, errorMessage } from "@/lib/api"
import type { AsyncStatus } from "@/store/collection"

type DashboardState = {
  summary: DashboardSummary | null
  status: AsyncStatus
  error: string | null
  /** When the data on screen was last refreshed. */
  refreshedAt: Date | null
  load: () => Promise<void>
}

export const useDashboard = create<DashboardState>()((set, get) => ({
  summary: null,
  status: "idle",
  error: null,
  refreshedAt: null,

  load: async () => {
    // A background refresh must not blank the screen, so only the first load
    // shows a loading state.
    set({ status: get().summary ? "ready" : "loading" })

    try {
      set({
        summary: await apiClient.dashboard.summary(),
        status: "ready",
        error: null,
        refreshedAt: new Date(),
      })
    } catch (error) {
      set({ status: "error", error: errorMessage(error) })
    }
  },
}))
