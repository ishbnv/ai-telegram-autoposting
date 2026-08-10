import { z } from "zod"

import { paginationQuerySchema } from "./common"

export const newsQuerySchema = paginationQuerySchema.extend({
  /** Matched against title and summary. */
  search: z.string().max(200).optional(),
  sourceId: z.string().min(1).optional(),
  status: z.enum(["NEW", "TAKEN", "SKIPPED"]).optional(),
})

export type NewsQuery = z.infer<typeof newsQuerySchema>

export type NewsItemDto = {
  id: string
  sourceId: string
  sourceName: string
  title: string
  url: string
  summary: string | null
  imageUrl: string | null
  author: string | null
  publishedAt: string | null
  fetchedAt: string
  status: "NEW" | "TAKEN" | "SKIPPED"
}
