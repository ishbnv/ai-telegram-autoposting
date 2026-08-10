import { create } from "zustand"

import { apiClient, errorMessage } from "@/lib/api"

type AuthState = {
  authenticated: boolean
  /** Null until the first /auth/me answers, so the router can hold off. */
  checked: boolean
  pending: boolean
  error: string | null
  check: () => Promise<void>
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  /** Called when any request comes back 401, e.g. an expired cookie. */
  clear: () => void
}

export const useAuth = create<AuthState>()((set) => ({
  authenticated: false,
  checked: false,
  pending: false,
  error: null,

  check: async () => {
    try {
      const session = await apiClient.auth.me()
      set({ authenticated: session.authenticated, checked: true })
    } catch {
      set({ authenticated: false, checked: true })
    }
  },

  login: async (password) => {
    set({ pending: true, error: null })
    try {
      const session = await apiClient.auth.login(password)
      set({ authenticated: session.authenticated, checked: true })
      return true
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    } finally {
      set({ pending: false })
    }
  },

  logout: async () => {
    await apiClient.auth.logout().catch(() => undefined)
    set({ authenticated: false })
  },

  clear: () => set({ authenticated: false }),
}))
