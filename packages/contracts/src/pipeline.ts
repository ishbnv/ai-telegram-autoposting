import { z } from "zod"

export const pipelineFiltersSchema = z.object({
  /** Case-insensitive substrings; an item must match at least one, if any given. */
  include: z.array(z.string().min(1)).max(50).default([]),
  /** Case-insensitive substrings; an item matching any of these is dropped. */
  exclude: z.array(z.string().min(1)).max(50).default([]),
  /**
   * Items with less text than this are skipped. Keywords cannot catch what
   * makes a post useless — "Someone please help me fix this" shares no word
   * with the next one like it — but having nothing to write from is a property
   * of the item itself. 0 disables the check.
   */
  minContentLength: z.number().int().min(0).max(10_000).default(0),
})

export type PipelineFilters = z.infer<typeof pipelineFiltersSchema>

export const createPipelineSchema = z.object({
  name: z.string().min(1).max(200),
  promptId: z.string().min(1),
  channelId: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().default(true),
  filters: pipelineFiltersSchema.default({
    include: [],
    exclude: [],
    minContentLength: 0,
  }),
  /** Standard five-field cron expression. */
  cron: z.string().min(1).max(100).default("*/30 * * * *"),
  maxPostsPerDay: z.number().int().min(1).max(500).default(10),
  freshnessWindowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(48),
})

export const updatePipelineSchema = createPipelineSchema.partial()

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>

export type PipelineDto = {
  id: string
  name: string
  promptId: string
  channelId: string
  sourceIds: string[]
  isActive: boolean
  filters: PipelineFilters
  cron: string
  maxPostsPerDay: number
  freshnessWindowHours: number
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}
