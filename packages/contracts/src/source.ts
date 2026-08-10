import { z } from "zod"

export const sourceTypeSchema = z.enum(["RSS", "HTML", "REDDIT"])
export type SourceTypeValue = z.infer<typeof sourceTypeSchema>

/**
 * Adapter configuration. These live here rather than in `@core` because the
 * admin panel renders forms from them, and the browser has no business pulling
 * in a scraping stack to do it.
 */
export const rssSourceConfigSchema = z.object({}).default({})

export const htmlSourceConfigSchema = z.object({
  /** Selects one element per item, e.g. "article.post". */
  itemSelector: z.string().min(1),
  /** Relative to the item. Omit to use the item's own text. */
  titleSelector: z.string().min(1).optional(),
  /** Relative to the item. Omit to use the first <a> inside it. */
  linkSelector: z.string().min(1).optional(),
  summarySelector: z.string().min(1).optional(),
  imageSelector: z.string().min(1).optional(),
  dateSelector: z.string().min(1).optional(),
  linkAttribute: z.string().min(1).default("href"),
  imageAttribute: z.string().min(1).default("src"),
  /** Attribute holding a machine-readable date, e.g. <time datetime="…">. */
  dateAttribute: z.string().min(1).default("datetime"),
})

export const redditSourceConfigSchema = z.object({
  listing: z.enum(["new", "hot", "top", "rising"]).default("new"),
  limit: z.number().int().min(1).max(100).default(25),
  /** Only meaningful for the "top" listing. */
  timeframe: z.enum(["hour", "day", "week", "month", "year", "all"]).optional(),
  /** Stickied announcements are almost never what you want to post about. */
  includeStickied: z.boolean().default(false),
  includeNsfw: z.boolean().default(false),
})

export type HtmlSourceConfig = z.infer<typeof htmlSourceConfigSchema>
export type RedditSourceConfig = z.infer<typeof redditSourceConfigSchema>

const sourceBase = {
  name: z.string().min(1).max(200),
  url: z.url(),
  isActive: z.boolean().default(true),
  /** Lower bound of 60s keeps a misconfigured source from hammering a site. */
  fetchIntervalSec: z.number().int().min(60).max(86_400).default(900),
  proxyId: z.string().nullish(),
}

/**
 * Discriminated on `type`, so an HTML source cannot be saved without selectors
 * and a Reddit source cannot be saved with them.
 */
export const createSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RSS"),
    ...sourceBase,
    config: rssSourceConfigSchema,
  }),
  z.object({
    type: z.literal("HTML"),
    ...sourceBase,
    config: htmlSourceConfigSchema,
  }),
  z.object({
    type: z.literal("REDDIT"),
    ...sourceBase,
    // prefault, not default: the fallback is fed *through* the schema so the
    // per-field defaults apply, rather than being taken as the finished value.
    config: redditSourceConfigSchema.prefault({}),
  }),
])

export const updateSourceSchema = z.object({
  name: sourceBase.name.optional(),
  url: sourceBase.url.optional(),
  isActive: z.boolean().optional(),
  fetchIntervalSec: z.number().int().min(60).max(86_400).optional(),
  proxyId: z.string().nullish(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export type CreateSourceInput = z.infer<typeof createSourceSchema>
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>

export type SourceDto = {
  id: string
  type: SourceTypeValue
  name: string
  url: string
  config: Record<string, unknown>
  isActive: boolean
  fetchIntervalSec: number
  lastFetchedAt: string | null
  lastError: string | null
  proxyId: string | null
  createdAt: string
  updatedAt: string
}
