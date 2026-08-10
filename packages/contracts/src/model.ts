/** An OpenRouter model, as offered in the prompt editor. */
export type ModelDto = {
  id: string
  name: string
  contextLength: number | null
  /** USD per million tokens — the unit prices are unreadable at this scale. */
  promptUsdPerMillion: number
  completionUsdPerMillion: number
}
