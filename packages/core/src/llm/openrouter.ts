import { z } from "zod"

import { fetchJson, type HttpRequestOptions } from "../http/fetch"
import { computeCostUsd, parsePricing, type ModelPricing } from "./cost"

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
/** Generation is slow by nature; the shared 15s default is far too tight. */
const CHAT_TIMEOUT_MS = 120_000

export type ChatRole = "system" | "user" | "assistant"

export type ChatMessage = {
  role: ChatRole
  content: string
}

const chatCompletionSchema = z.object({
  id: z.string(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullish(),
        }),
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().default(0),
      completion_tokens: z.number().default(0),
      /** Present when the request asks for usage accounting. */
      cost: z.number().nullish(),
    })
    .optional(),
})

const modelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().nullish(),
      pricing: z
        .object({
          prompt: z.string().nullish(),
          completion: z.string().nullish(),
        })
        .optional(),
    })
  ),
})

export type ModelInfo = {
  id: string
  name: string
  contextLength: number | null
  pricing: ModelPricing
}

export type ChatResult = {
  text: string
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  latencyMs: number
  finishReason: string | null
}

export class OpenRouterError extends Error {
  override readonly name = "OpenRouterError"
}

export type OpenRouterClientOptions = {
  apiKey: string
  /** Sent as HTTP-Referer; OpenRouter shows it in the activity log. */
  appUrl: string
  appTitle: string
  baseUrl?: string
  proxyUrl?: string
}

export type ChatParams = {
  model: string
  messages: ChatMessage[]
  temperature?: number | null
  maxTokens?: number | null
  signal?: AbortSignal
}

export class OpenRouterClient {
  private readonly baseUrl: string

  constructor(private readonly options: OpenRouterClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  }

  private get headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.options.apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": this.options.appUrl,
      "X-Title": this.options.appTitle,
    }
  }

  private get requestOptions(): HttpRequestOptions {
    return { proxyUrl: this.options.proxyUrl }
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const startedAt = Date.now()

    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      // Asks OpenRouter to return the actual charged cost alongside token counts.
      usage: { include: true },
    }

    if (typeof params.temperature === "number") {
      body["temperature"] = params.temperature
    }
    if (typeof params.maxTokens === "number") {
      body["max_tokens"] = params.maxTokens
    }

    const response = await fetchJson(
      `${this.baseUrl}/chat/completions`,
      chatCompletionSchema,
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      },
      {
        ...this.requestOptions,
        timeoutMs: CHAT_TIMEOUT_MS,
        ...(params.signal ? { signal: params.signal } : {}),
      }
    )

    const choice = response.choices[0]
    const text = choice?.message.content?.trim() ?? ""

    if (!text) {
      throw new OpenRouterError(
        `Model ${params.model} returned an empty completion (finish reason: ${
          choice?.finish_reason ?? "unknown"
        })`
      )
    }

    const promptTokens = response.usage?.prompt_tokens ?? 0
    const completionTokens = response.usage?.completion_tokens ?? 0

    return {
      text,
      model: response.model ?? params.model,
      promptTokens,
      completionTokens,
      // Prefer what OpenRouter actually charged; fall back to the price list.
      costUsd:
        response.usage?.cost ??
        computeCostUsd(
          { promptTokens, completionTokens },
          await this.pricingFor(params.model)
        ),
      latencyMs: Date.now() - startedAt,
      finishReason: choice?.finish_reason ?? null,
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetchJson(
      `${this.baseUrl}/models`,
      modelListSchema,
      { method: "GET", headers: this.headers },
      this.requestOptions
    )

    return response.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.context_length ?? null,
      pricing: parsePricing(model.pricing ?? {}),
    }))
  }

  private async pricingFor(modelId: string): Promise<ModelPricing> {
    try {
      const models = await this.listModels()
      const match = models.find((model) => model.id === modelId)
      return match?.pricing ?? { prompt: 0, completion: 0 }
    } catch {
      // Cost is bookkeeping, not correctness — never fail a generation over it.
      return { prompt: 0, completion: 0 }
    }
  }
}
