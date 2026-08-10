import type { Channel } from "@db"
import { describe, expect, it } from "vitest"

import { maskProxyUrl, toChannelDto } from "./dto"

describe("maskProxyUrl", () => {
  it("hides the password but keeps the shape readable", () => {
    expect(maskProxyUrl("http://user:s3cret@proxy.example:3128")).toBe(
      "http://***:***@proxy.example:3128/"
    )
  })

  it("leaves a credential-free proxy alone", () => {
    expect(maskProxyUrl("http://proxy.example:3128")).toBe(
      "http://proxy.example:3128/"
    )
  })

  it("never returns something usable when it cannot parse the value", () => {
    expect(maskProxyUrl("not a url")).toBe("***")
  })
})

describe("toChannelDto", () => {
  it("stringifies the 64-bit chat ids that JSON cannot carry", () => {
    const channel: Channel = {
      id: "c1",
      title: "My channel",
      tgChatId: -1001234567890n,
      username: null,
      moderationChatId: -1009876543210n,
      footerTemplate: "🔗 Source: {sourceLink}",
      isActive: true,
      createdAt: new Date("2026-08-05T10:00:00Z"),
      updatedAt: new Date("2026-08-05T10:00:00Z"),
    }

    const dto = toChannelDto(channel)

    expect(dto.tgChatId).toBe("-1001234567890")
    expect(dto.moderationChatId).toBe("-1009876543210")
    expect(() => JSON.stringify(dto)).not.toThrow()
  })
})
