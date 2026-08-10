import { z } from "zod"

export const createPromptSchema = z.object({
  name: z.string().min(1).max(200),
  systemPrompt: z.string().min(1).max(20_000),
  /** Placeholders: {title} {url} {summary} {content}. */
  userTemplate: z.string().min(1).max(5_000).default("{title}\n\n{content}"),
  /** OpenRouter model slug, e.g. "anthropic/claude-sonnet-4.5". */
  model: z.string().min(1).max(200),
  temperature: z.number().min(0).max(2).nullish(),
  maxTokens: z.number().int().min(1).max(200_000).nullish(),
  isActive: z.boolean().default(true),
})

export const updatePromptSchema = createPromptSchema.partial()

export type CreatePromptInput = z.infer<typeof createPromptSchema>
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>

export type PromptDto = {
  id: string
  name: string
  systemPrompt: string
  userTemplate: string
  model: string
  temperature: number | null
  maxTokens: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}
