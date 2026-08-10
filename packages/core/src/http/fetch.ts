import {
  fetch,
  ProxyAgent,
  type Dispatcher,
  type RequestInit,
  type Response,
} from "undici"
import type { ZodType } from "zod"

import { assertPublicUrl, BlockedHostError } from "./ssrf"

export const DEFAULT_TIMEOUT_MS = 15_000
export const DEFAULT_RETRIES = 2

/** Statuses worth trying again: transient overload or explicit rate limiting. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

/** Keep failure bodies out of the logs beyond what is useful for diagnosis. */
const MAX_ERROR_BODY_CHARS = 500

/**
 * Methods where a retry cannot create a second side effect, so replaying one
 * whose response we never saw is safe.
 */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"])

export type HttpRequestOptions = {
  timeoutMs?: number
  /** Number of *additional* attempts after the first one. */
  retries?: number
  proxyUrl?: string
  signal?: AbortSignal
  /**
   * Allows retries on a non-idempotent method. Off by default and it should
   * stay off for anything that sends a message or spends money: a timeout tells
   * us the response was lost, not that the server ignored the request.
   */
  retryNonIdempotent?: boolean
  /**
   * Refuse http(s) requests to addresses that are not publicly routable, and
   * re-check after every redirect. On for operator-supplied URLs — sources —
   * and off for the fixed hosts we ship, which need no guarding.
   */
  blockPrivateHosts?: boolean
  /** Cap on the body a `fetchText`/`fetchJson` will buffer. */
  maxBytes?: number
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

/** Enough for any feed worth reading; a bomb is far past it. */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

/** Bounded so a redirect loop cannot spin forever. */
const MAX_REDIRECTS = 5

export class ResponseTooLargeError extends Error {
  override readonly name = "ResponseTooLargeError"

  constructor(
    readonly url: string,
    readonly maxBytes: number
  ) {
    super(`Response from ${url} exceeds ${maxBytes} bytes`)
  }
}

/**
 * Follows redirects by hand so every hop is checked, not just the first. With
 * `redirect: "follow"` a public URL could bounce the request straight to
 * 169.254.169.254 and the guard would never see it.
 */
async function fetchGuarded(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  proxyUrl: string | undefined
): Promise<Response> {
  let target = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(target)

    const response = await fetch(target, {
      ...init,
      signal,
      redirect: "manual",
      dispatcher: dispatcherFor(proxyUrl),
    })

    const location = response.headers.get("location")
    if (response.status < 300 || response.status >= 400 || !location) {
      return response
    }

    target = new URL(location, target).toString()
  }

  throw new BlockedHostError(url, `more than ${MAX_REDIRECTS} redirects`)
}

/**
 * Reads a body with a ceiling. `response.text()` buffers whatever arrives, so
 * an endpoint streaming gigabytes — or a compressed bomb, which undici expands
 * transparently — takes the process out with an allocation failure.
 */
async function readCapped(
  response: Response,
  url: string,
  maxBytes: number
): Promise<string> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel()
    throw new ResponseTooLargeError(url, maxBytes)
  }

  if (!response.body) {
    return ""
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new ResponseTooLargeError(url, maxBytes)
    }

    chunks.push(value)
  }

  return new TextDecoder().decode(Buffer.concat(chunks))
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
    retryNonIdempotent = false,
    blockPrivateHosts = false,
  } = options

  const method = (init.method ?? "GET").toUpperCase()
  const replayable = retryNonIdempotent || IDEMPOTENT_METHODS.has(method)

  /**
   * A POST that Telegram accepted but whose reply was lost is indistinguishable
   * from one it never received, and the Bot API has no idempotency key — so
   * replaying it puts a second copy in the channel. For those, only a status
   * that *proves* the request was not acted on is worth retrying: 429 means
   * "rate limited, I did not process this". A timeout, a socket error or a 502
   * from an edge node prove nothing, because the backend may already have run
   * the send.
   */
  const canRetry = (status: number | null): boolean => {
    if (replayable) {
      return status === null || RETRYABLE_STATUSES.has(status)
    }

    return status === 429
  }

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

    try {
      const response = blockPrivateHosts
        ? await fetchGuarded(url, init, combined, proxyUrl)
        : await fetch(url, {
            ...init,
            signal: combined,
            dispatcher: dispatcherFor(proxyUrl),
          })

      if (response.ok) {
        return response
      }

      // Capped like any other body: an error page can be enormous, and this one
      // is kept on the error object and written to Source.lastError.
      const body = await readCapped(response, url, MAX_ERROR_BODY_CHARS).catch(
        () => ""
      )

      if (!canRetry(response.status) || attempt === retries) {
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

      // Deterministic refusals: the next attempt reaches the same verdict.
      if (
        error instanceof BlockedHostError ||
        error instanceof ResponseTooLargeError
      ) {
        throw error
      }

      // No response means we cannot tell whether the server acted on it.
      const status = error instanceof HttpError ? error.status : null

      if (!canRetry(status)) {
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
  return readCapped(response, url, options?.maxBytes ?? DEFAULT_MAX_BYTES)
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
  const raw = await readCapped(
    response,
    url,
    options?.maxBytes ?? DEFAULT_MAX_BYTES
  )

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
