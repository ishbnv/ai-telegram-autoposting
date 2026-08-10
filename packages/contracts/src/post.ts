import { z } from "zod"

import { paginationQuerySchema } from "./common"

export const postStatusSchema = z.enum([
  "GENERATING",
  "PENDING_APPROVAL",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "FAILED",
])

export type PostStatusValue = z.infer<typeof postStatusSchema>

export const postsQuerySchema = paginationQuerySchema.extend({
  status: postStatusSchema.optional(),
  pipelineId: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  search: z.string().max(200).optional(),
})

export const updatePostSchema = z.object({
  /** The moderator's edit of the generated text. */
  text: z.string().min(1).max(8_000),
})

export type PostsQuery = z.infer<typeof postsQuerySchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>

export type PostDto = {
  id: string
  pipelineId: string
  pipelineName: string
  newsItemId: string
  channelId: string
  channelTitle: string
  promptId: string
  model: string
  status: PostStatusValue
  text: string
  mediaUrl: string | null
  sourceName: string
  sourceUrl: string
  moderationMessageId: number | null
  publishedAt: string | null
  error: string | null
  costUsd: number
  createdAt: string
  updatedAt: string
}

export type PublicationDto = {
  id: string
  postId: string
  channelId: string
  channelTitle: string
  tgMessageId: number
  publishedAt: string
  text: string
  sourceName: string
  sourceUrl: string
}
