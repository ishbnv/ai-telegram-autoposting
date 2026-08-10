import { z } from "zod"

export const loginSchema = z.object({
  password: z.string().min(1).max(200),
})

export type LoginInput = z.infer<typeof loginSchema>

export type SessionDto = {
  authenticated: boolean
  /** Unix seconds at which the session cookie stops being accepted. */
  expiresAt: number | null
}

/** Which secrets the deployment has configured, never their values. */
export type SettingsDto = {
  telegramBotConfigured: boolean
  openRouterConfigured: boolean
  defaultModerationChatId: string | null
  timezone: string
}
