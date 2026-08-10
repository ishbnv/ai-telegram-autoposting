import { z } from "zod"

/**
 * Telegram chat ids are 64-bit. They travel as strings so that neither JSON nor
 * JavaScript numbers get a chance to round them.
 */
export const chatIdSchema = z
  .string()
  .regex(/^-?\d{1,20}$/, "must be a Telegram chat id, e.g. -1001234567890")

export const idParamSchema = z.object({
  id: z.string().min(1),
})

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Shape of every error body the API produces. */
export type ApiError = {
  error: {
    message: string
    /** Present for validation failures: which field, and why. */
    fields?: { path: string; message: string }[]
  }
}
