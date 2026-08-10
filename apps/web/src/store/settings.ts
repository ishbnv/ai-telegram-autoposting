import type { ModelDto, SettingsDto } from "@contracts"
import { create } from "zustand"

import { apiClient, errorMessage } from "@/lib/api"
import type { AsyncStatus } from "@/store/collection"

type SettingsState = {
  settings: SettingsDto | null
  models: ModelDto[]
  status: AsyncStatus
  /** Separate from `status`: the catalogue needs an API key, settings do not. */
  modelsStatus: AsyncStatus
  error: string | null
  modelsError: string | null
  load: () => Promise<void>
  loadModels: () => Promise<void>
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: null,
  models: [],
  status: "idle",
  modelsStatus: "idle",
  error: null,
  modelsError: null,

  load: async () => {
    set({ status: "loading" })
    try {
      set({ settings: await apiClient.settings.get(), status: "ready" })
    } catch (error) {
      set({ status: "error", error: errorMessage(error) })
    }
  },

  loadModels: async () => {
    if (get().modelsStatus === "loading" || get().models.length > 0) {
      return
    }

    set({ modelsStatus: "loading" })
    try {
      set({ models: await apiClient.models.list(), modelsStatus: "ready" })
    } catch (error) {
      set({ modelsStatus: "error", modelsError: errorMessage(error) })
    }
  },
}))
