import { z } from "zod"

import { fetchJson, HttpError, type HttpRequestOptions } from "../http/fetch"

/**
 * Application-only OAuth for Reddit.
 *
 * Reddit closed its unauthenticated `.json` endpoints — they answer 403 from
 * anywhere that is not a browser — so a source that wants what the API gives
 * (images, score, stickied and NSFW flags) has to hold a token. This is the
 * client-credentials half of OAuth: no user is involved, the app authenticates
 * as itself and reads what is already public.
 *
 * Credentials come from the environment and are never stored, logged, or put
 * in the database. Register an app at https://www.reddit.com/prefs/apps as
 * "script"; the token endpoint takes the id and secret as HTTP Basic auth.
 */

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
export const REDDIT_OAUTH_ROOT = "https://oauth.reddit.com"

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number(),
})

export type RedditCredentials = {
  clientId: string
  clientSecret: string
}

export class RedditAuthError extends Error {
  override readonly name = "RedditAuthError"
}

type CachedToken = {
  value: string
  /** Epoch ms. */
  expiresAt: number
}

/**
 * Tokens last a day, so one is reused rather than bought per fetch — Reddit
 * counts token requests against the same quota as everything else. Keyed by
 * client id so two sets of credentials cannot hand each other their tokens.
 */
const cache = new Map<string, CachedToken>()

/** Renew this far before expiry, so a fetch never starts on a dying token. */
const EARLY_RENEWAL_MS = 60_000

export function forgetRedditToken(clientId: string): void {
  cache.delete(clientId)
}

export type RedditAuthOptions = {
  request?: HttpRequestOptions
  /** Overridable so tests can point at a local server. */
  tokenUrl?: string
  now?: number
}

export async function redditAccessToken(
  credentials: RedditCredentials,
  options: RedditAuthOptions = {}
): Promise<string> {
  const now = options.now ?? Date.now()
  const tokenUrl = options.tokenUrl ?? TOKEN_URL
  const cached = cache.get(credentials.clientId)
  if (cached && cached.expiresAt - EARLY_RENEWAL_MS > now) {
    return cached.value
  }

  const basic = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`
  ).toString("base64")

  let token: z.infer<typeof tokenSchema>
  try {
    token = await fetchJson(
      tokenUrl,
      tokenSchema,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
      // Never retried: a rejected credential is rejected every time, and
      // hammering the token endpoint is how an app gets rate-limited.
      { ...options.request, retries: 0 }
    )
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      throw new RedditAuthError(
        "Reddit rejected the credentials. Check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET, and that the app is registered as a script."
      )
    }

    throw error
  }

  cache.set(credentials.clientId, {
    value: token.access_token,
    expiresAt: now + token.expires_in * 1000,
  })

  return token.access_token
}
