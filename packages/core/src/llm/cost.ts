export type ModelPricing = {
  /** USD per prompt token. */
  prompt: number
  /** USD per completion token. */
  completion: number
}

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
}

/**
 * OpenRouter reports prices as decimal strings in USD per token, e.g. "0.000003".
 * Unparseable or absent values become 0 rather than NaN: an unknown price should
 * show up as "we do not know", not poison every sum on the dashboard.
 */
export function parsePricing(pricing: {
  prompt?: string | null
  completion?: string | null
}): ModelPricing {
  return {
    prompt: parsePrice(pricing.prompt),
    completion: parsePrice(pricing.completion),
  }
}

function parsePrice(value: string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function computeCostUsd(
  usage: TokenUsage,
  pricing: ModelPricing
): number {
  return (
    usage.promptTokens * pricing.prompt +
    usage.completionTokens * pricing.completion
  )
}
