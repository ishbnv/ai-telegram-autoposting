import { createServer, type Server } from "node:http"
import { afterEach, describe, expect, it } from "vitest"

import { buildListingUrl } from "./reddit"
import {
  forgetRedditToken,
  redditAccessToken,
  RedditAuthError,
} from "./redditAuth"

const CREDENTIALS = { clientId: "id-for-tests", clientSecret: "secret" }

let server: Server | null = null

afterEach(() => {
  server?.close()
  server = null
  // The cache is module state; without this, one test hands the next its token.
  forgetRedditToken(CREDENTIALS.clientId)
})

/** A stand-in for Reddit's token endpoint that counts what it was asked. */
async function tokenServer(
  reply: (auth: string | undefined, body: string) => [number, string]
): Promise<{ url: string; calls: () => number }> {
  let calls = 0

  server = createServer((request, response) => {
    calls += 1
    let body = ""
    request.on("data", (chunk) => (body += String(chunk)))
    request.on("end", () => {
      const [status, payload] = reply(request.headers.authorization, body)
      response.writeHead(status, { "content-type": "application/json" })
      response.end(payload)
    })
  })

  await new Promise<void>((resolve) => server?.listen(0, resolve))
  const address = server?.address()
  const port = typeof address === "object" && address ? address.port : 0

  return { url: `http://127.0.0.1:${port}/token`, calls: () => calls }
}

const granted = (token: string, expiresIn = 3600): [number, string] => [
  200,
  JSON.stringify({
    access_token: token,
    token_type: "bearer",
    expires_in: expiresIn,
  }),
]

describe("buildListingUrl", () => {
  const config = {
    listing: "new" as const,
    limit: 25,
    includeStickied: false,
    includeNsfw: false,
  }

  it("uses the public host and a .json suffix when unauthenticated", () => {
    expect(buildListingUrl("https://www.reddit.com/r/ClaudeAI", config)).toBe(
      "https://www.reddit.com/r/ClaudeAI/new.json?limit=25"
    )
  })

  it("moves to the oauth host and drops the suffix once authenticated", () => {
    expect(
      buildListingUrl("https://www.reddit.com/r/ClaudeAI", config, true)
    ).toBe("https://oauth.reddit.com/r/ClaudeAI/new?limit=25")
  })

  it("keeps the subreddit when the source URL has a trailing slash", () => {
    expect(
      buildListingUrl("https://www.reddit.com/r/ClaudeAI/", config, true)
    ).toBe("https://oauth.reddit.com/r/ClaudeAI/new?limit=25")
  })

  it("carries the timeframe through on a top listing", () => {
    expect(
      buildListingUrl(
        "https://www.reddit.com/r/ClaudeAI",
        { ...config, listing: "top", timeframe: "week" },
        true
      )
    ).toBe("https://oauth.reddit.com/r/ClaudeAI/top?limit=25&t=week")
  })
})

describe("redditAccessToken", () => {
  it("authenticates as the app itself, with no user involved", async () => {
    let seenAuth: string | undefined
    let seenBody = ""

    const { url } = await tokenServer((auth, body) => {
      seenAuth = auth
      seenBody = body
      return granted("t")
    })

    await redditAccessToken(CREDENTIALS, { tokenUrl: url })

    expect(seenAuth).toBe(
      `Basic ${Buffer.from("id-for-tests:secret").toString("base64")}`
    )
    expect(seenBody).toBe("grant_type=client_credentials")
  })

  it("reuses a live token instead of buying one per fetch", async () => {
    const { url, calls } = await tokenServer(() => granted("t"))

    await redditAccessToken(CREDENTIALS, { tokenUrl: url })
    await redditAccessToken(CREDENTIALS, { tokenUrl: url })
    await redditAccessToken(CREDENTIALS, { tokenUrl: url })

    expect(calls()).toBe(1)
  })

  /** A token that dies mid-fetch is worse than one renewed a minute early. */
  it("renews before expiry rather than on it", async () => {
    let issued = 0
    const { url } = await tokenServer(() => granted(`t${++issued}`, 90))

    const first = await redditAccessToken(CREDENTIALS, {
      tokenUrl: url,
      now: 0,
    })
    const second = await redditAccessToken(CREDENTIALS, {
      tokenUrl: url,
      // 40s in: 50s of life left, inside the 60s renewal margin.
      now: 40_000,
    })

    expect(first).toBe("t1")
    expect(second).toBe("t2")
  })

  it("explains a rejected credential instead of leaking a 401", async () => {
    const { url } = await tokenServer(() => [
      401,
      JSON.stringify({ message: "Unauthorized", error: 401 }),
    ])

    await expect(
      redditAccessToken(CREDENTIALS, { tokenUrl: url })
    ).rejects.toThrow(RedditAuthError)
  })

  it("does not hammer the token endpoint when refused", async () => {
    const { url, calls } = await tokenServer(() => [
      401,
      JSON.stringify({ message: "Unauthorized" }),
    ])

    await redditAccessToken(CREDENTIALS, { tokenUrl: url }).catch(() => null)

    expect(calls()).toBe(1)
  })

  it("keeps one client's token away from another's", async () => {
    let issued = 0
    const { url } = await tokenServer(() => granted(`t${++issued}`))

    const a = await redditAccessToken(CREDENTIALS, { tokenUrl: url })
    const b = await redditAccessToken(
      { clientId: "other", clientSecret: "s" },
      { tokenUrl: url }
    )

    expect(a).not.toBe(b)
    forgetRedditToken("other")
  })
})
