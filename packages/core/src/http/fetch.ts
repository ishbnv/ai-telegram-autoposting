import {
  fetch,
  ProxyAgent,
  type Dispatcher,
  type RequestInit,
  type Response,
} from "undici"
import type { ZodType } from "zod"

export const DEFAULT_TIMEOUT_MS = 15_000
export const DEFAULT_RETRIES = 2

/** Statuses worth trying again: transient overload or explicit rate limiting. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

/** Keep failure bodies out of the logs beyond what is useful for diagnosis. */
const MAX_ERROR_BODY_CHARS = 500

export type HttpRequestOptions = {
  timeoutMs?: number
  /** Number of *additional* attempts after the first one. */
  retries?: number
  proxyUrl?: string
  signal?: AbortSignal
}

export class HttpError extends Error {
  override readonly name = "HttpError"

  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, MAX_ERROR_BODY_CHARS)}`)
  }
}

export class ResponseShapeError extends Error {
  override readonly name = "ResponseShapeError"

  constructor(
    readonly url: string,
    readonly detail: string
  ) {
    super(`Unexpected response shape from ${url}: ${detail}`)
  }
}

// One agent per proxy URL. Building a fresh one per request would leak sockets.
const proxyAgents = new Map<string, ProxyAgent>()

function dispatcherFor(proxyUrl: string | undefined): Dispatcher | undefined {
  if (!proxyUrl) {
    return undefined
  }

  let agent = proxyAgents.get(proxyUrl)
  if (!agent) {
    agent = new ProxyAgent(proxyUrl)
    proxyAgents.set(proxyUrl, agent)
  }

  return agent
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Honours `Retry-After`, which may be seconds or an HTTP date. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after")
  if (!header) {
    return undefined
  }

  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

function backoffMs(attempt: number): number {
  const base = 500 * 2 ** attempt
  // Jitter keeps several workers from retrying in lockstep.
  return base + Math.random() * base
}

/**
 * A single HTTP call with a timeout, bounded retries and optional proxying.
 * Every outbound request in the project goes through here, so that timeouts and
 * retry behaviour are consistent across OpenRouter, Telegram and content sources.
 */
export async function httpRequest(
  url: string,
  init: RequestInit = {},
  options: HttpRequestOptions = {}
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    proxyUrl,
    signal,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

    try {
      const response = await fetch(url, {
        ...init,
        signal: combined,
        dispatcher: dispatcherFor(proxyUrl),
      })

      if (response.ok) {
        return response
      }

      const body = await response.text().catch(() => "")

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === retries) {
        throw new HttpError(response.status, url, body)
      }

      lastError = new HttpError(response.status, url, body)
      await sleep(retryAfterMs(response) ?? backoffMs(attempt))
      continue
    } catch (error) {
      // A caller-initiated abort is a decision, not a failure to retry around.
      if (signal?.aborted) {
        throw error
      }

      if (error instanceof HttpError && !RETRYABLE_STATUSES.has(error.status)) {
        throw error
      }

      if (attempt === retries) {
        throw error
      }

      lastError = error
      await sleep(backoffMs(attempt))
    }
  }

  // Unreachable: the loop either returns or throws on its final attempt.
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function fetchText(
  url: string,
  init?: RequestInit,
  options?: HttpRequestOptions
): Promise<string> {
  const response = await httpRequest(url, init, options)
  return response.text()
}

/**
 * Fetches JSON and validates it before it reaches domain code — third-party
 * responses are an external boundary like any other.
 */
export async function fetchJson<T>(
  url: string,
  schema: ZodType<T>,
  init?: RequestInit,
  options?: HttpRequestOptions
): Promise<T> {
  const response = await httpRequest(url, init, options)
  const raw = await response.text()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ResponseShapeError(url, "body is not valid JSON")
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
      .join("; ")
    throw new ResponseShapeError(url, detail)
  }

  return result.data
}
