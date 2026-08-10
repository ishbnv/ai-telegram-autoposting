import { describe, expect, it } from "vitest"

import {
  buildModerationKeyboard,
  CALLBACK_DATA_MAX_BYTES,
  CallbackDataTooLongError,
  decodeCallbackData,
  encodeCallbackData,
  MODERATION_ACTIONS,
} from "./markup"

// Prisma cuid2 ids are 25 characters.
const POST_ID = "clz1a2b3c4d5e6f7g8h9i0j1k"

describe("callback data", () => {
  it("round-trips every action", () => {
    for (const action of MODERATION_ACTIONS) {
      const encoded = encodeCallbackData({ action, postId: POST_ID })
      expect(decodeCallbackData(encoded)).toEqual({ action, postId: POST_ID })
    }
  })

  it("stays inside Telegram's 64-byte cap", () => {
    for (const action of MODERATION_ACTIONS) {
      const encoded = encodeCallbackData({ action, postId: POST_ID })
      expect(Buffer.byteLength(encoded, "utf8")).toBeLessThanOrEqual(
        CALLBACK_DATA_MAX_BYTES
      )
    }
  })

  it("refuses to build data that would exceed the cap", () => {
    expect(() =>
      encodeCallbackData({ action: "publish", postId: "x".repeat(80) })
    ).toThrow(CallbackDataTooLongError)
  })

  it("ignores data produced by something else", () => {
    expect(decodeCallbackData("publish:123")).toBeNull()
    expect(decodeCallbackData("otherbot:1:pub:abc")).toBeNull()
    expect(decodeCallbackData("")).toBeNull()
  })

  it("ignores a different protocol version", () => {
    expect(decodeCallbackData(`atp:2:pub:${POST_ID}`)).toBeNull()
  })

  it("ignores an unknown action code", () => {
    expect(decodeCallbackData(`atp:1:zzz:${POST_ID}`)).toBeNull()
  })

  it("ignores an empty post id", () => {
    expect(decodeCallbackData("atp:1:pub:")).toBeNull()
  })
})

describe("buildModerationKeyboard", () => {
  it("offers exactly the four moderation actions", () => {
    const keyboard = buildModerationKeyboard(POST_ID)
    const actions = keyboard.inline_keyboard
      .flat()
      .map((button) => decodeCallbackData(button.callback_data)?.action)

    expect(actions).toEqual(["publish", "reject", "edit", "regenerate"])
  })

  it("points every button at the same post", () => {
    const keyboard = buildModerationKeyboard(POST_ID)

    for (const button of keyboard.inline_keyboard.flat()) {
      expect(decodeCallbackData(button.callback_data)?.postId).toBe(POST_ID)
    }
  })
})
