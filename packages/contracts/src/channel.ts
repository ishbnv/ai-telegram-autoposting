import { z } from "zod"

import { chatIdSchema } from "./common"

export const DEFAULT_FOOTER_TEMPLATE = "🔗 Source: {sourceLink}"

export const createChannelSchema = z.object({
  title: z.string().min(1).max(200),
  tgChatId: chatIdSchema,
  username: z.string().max(100).nullish(),
  /** Where drafts for this channel go for approval. */
  moderationChatId: chatIdSchema,
  footerTemplate: z.string().max(500).default(DEFAULT_FOOTER_TEMPLATE),
  isActive: z.boolean().default(true),
})

export const updateChannelSchema = createChannelSchema.partial()

export type CreateChannelInput = z.infer<typeof createChannelSchema>
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>

export type ChannelDto = {
  id: string
  title: string
  /** Stringified 64-bit id. */
  tgChatId: string
  username: string | null
  moderationChatId: string
  footerTemplate: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}
