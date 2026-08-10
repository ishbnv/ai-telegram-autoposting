import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { afterEach, describe, expect, it } from "vitest"

import { httpRequest, HttpError } from "./fetch"

type Handler = (attempt: number) => {
  status: number
  body?: string
  delayMs?: number
}

let server: Server | undefined

/** Starts a server that counts attempts and answers per the handler. */
async function serve(handler: Handler): Promise<{
  url: string
  attempts: () => number
}> {
  let attempts = 0

  server = createServer((_req, res) => {
    attempts += 1
    const { status, body = "nope", delayMs = 0 } = handler(attempts)

    setTimeout(() => {
      res.writeHead(status, { "content-type": "text/plain" })
      res.end(body)
    }, delayMs)
  })

  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo

  return { url: `http://127.0.0.1:${port}/`, attempts: () => attempts }
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
    server = undefined
  })
})

describe("httpRequest retries", () => {
  it("retries a GET on a transient status", async () => {
    const { url, attempts } = await serve(() => ({ status: 503 }))

    await expect(httpRequest(url, {}, { retries: 2 })).rejects.toThrow(
      HttpError
    )
    expect(attempts()).toBe(3)
  })

  // The one that matters: a resent POST is a second post in the channel.
  it("does not retry a POST on a 5xx, because delivery is unproven", async () => {
    const { url, attempts } = await serve(() => ({ status: 502 }))

    await expect(
      httpRequest(url, { method: "POST" }, { retries: 2 })
    ).rejects.toThrow(HttpError)
    expect(attempts()).toBe(1)
  })

  it("does not retry a POST that times out", async () => {
    const { url, attempts } = await serve(() => ({
      status: 200,
      delayMs: 200,
    }))

    await expect(
      httpRequest(url, { method: "POST" }, { retries: 2, timeoutMs: 50 })
    ).rejects.toThrow()

    // Give the late response somewhere to land before the server closes.
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(attempts()).toBe(1)
  })

  it("does retry a POST on 429, which proves the request was not acted on", async () => {
    const { url, attempts } = await serve((attempt) =>
      attempt < 3 ? { status: 429 } : { status: 200, body: "ok" }
    )

    const response = await httpRequest(url, { method: "POST" }, { retries: 3 })

    expect(response.status).toBe(200)
    expect(attempts()).toBe(3)
  })

  it("retries a POST on 5xx when the caller opts in", async () => {
    const { url, attempts } = await serve((attempt) =>
      attempt < 2 ? { status: 503 } : { status: 200, body: "ok" }
    )

    const response = await httpRequest(
      url,
      { method: "POST" },
      { retries: 2, retryNonIdempotent: true }
    )

    expect(response.status).toBe(200)
    expect(attempts()).toBe(2)
  })

  it("treats a missing method as GET", async () => {
    const { url, attempts } = await serve(() => ({ status: 503 }))

    await expect(httpRequest(url, {}, { retries: 1 })).rejects.toThrow(
      HttpError
    )
    expect(attempts()).toBe(2)
  })
})
