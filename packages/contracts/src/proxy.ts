import { z } from "zod"

export const proxyUsageSchema = z.enum(["LLM", "SOURCE", "TELEGRAM"])
export type ProxyUsage = z.infer<typeof proxyUsageSchema>

export const createProxySchema = z.object({
  label: z.string().min(1).max(100),
  /** Full proxy URL, credentials included: http://user:pass@host:3128. */
  url: z
    .url()
    .refine(
      (value) => /^(https?|socks[45]?):\/\//i.test(value),
      "must be an http, https or socks proxy URL"
    ),
  usedFor: proxyUsageSchema,
  isActive: z.boolean().default(true),
})

export const updateProxySchema = createProxySchema.partial()

export type CreateProxyInput = z.infer<typeof createProxySchema>
export type UpdateProxyInput = z.infer<typeof updateProxySchema>

export type ProxyDto = {
  id: string
  label: string
  /** Credentials are masked — the API never returns a usable proxy URL. */
  url: string
  usedFor: ProxyUsage
  isActive: boolean
  createdAt: string
  updatedAt: string
}
