import { describe, expect, it } from "vitest"

import { moderatesPost } from "./moderates"

const post = (moderationChatId: bigint | null, channelChat: bigint) => ({
  moderationChatId,
  channel: { moderationChatId: channelChat },
})

describe("moderatesPost", () => {
  it("accepts the chat the card was delivered to", () => {
    expect(moderatesPost(-1001n, post(-1001n, -1001n))).toBe(true)
  })

  // The whole point: passing the global allowlist is not the same as moderating
  // this particular post.
  it("rejects a different channel's moderation chat", () => {
    expect(moderatesPost(-1002n, post(-1001n, -1001n))).toBe(false)
  })

  it("falls back to the channel when the card was never placed", () => {
    expect(moderatesPost(-1001n, post(null, -1001n))).toBe(true)
    expect(moderatesPost(-1002n, post(null, -1001n))).toBe(false)
  })

  it("prefers where the card actually went over the channel's current setting", () => {
    // The operator repointed the channel; cards already delivered stay valid in
    // the chat that received them, and only there.
    expect(moderatesPost(-1001n, post(-1001n, -1002n))).toBe(true)
    expect(moderatesPost(-1002n, post(-1001n, -1002n))).toBe(false)
  })

  it("compares numeric and bigint ids by value", () => {
    // Telegram hands chat ids over as JS numbers; the database stores BigInt.
    expect(moderatesPost(-1001234567890, post(-1001234567890n, 0n))).toBe(true)
  })
})
