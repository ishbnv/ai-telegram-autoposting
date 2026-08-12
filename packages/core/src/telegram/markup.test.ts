import { describe, expect, it } from "vitest"

import {
  CALLBACK_DATA_MAX_BYTES,
  CallbackDataTooLongError,
  MODERATION_ACTIONS,
  PRESET_BY_ACTION,
  buildModerationKeyboard,
  buildScheduleKeyboard,
  buildScheduledKeyboard,
  decodeCallbackData,
  encodeCallbackData,
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
  it("offers exactly the moderation actions, in a fixed order", () => {
    const keyboard = buildModerationKeyboard(POST_ID)
    const actions = keyboard.inline_keyboard
      .flat()
      .map((button) => decodeCallbackData(button.callback_data)?.action)

    expect(actions).toEqual([
      "publish",
      "reject",
      "edit",
      "regenerate",
      "schedule",
    ])
  })

  it("points every button at the same post", () => {
    const keyboard = buildModerationKeyboard(POST_ID)

    for (const button of keyboard.inline_keyboard.flat()) {
      expect(decodeCallbackData(button.callback_data)?.postId).toBe(POST_ID)
    }
  })
})

describe("scheduling keyboards", () => {
  it("offers one button per preset plus a way back", () => {
    const now = new Date(2026, 7, 12, 9, 0, 0, 0)
    const actions = buildScheduleKeyboard(POST_ID, now)
      .inline_keyboard.flat()
      .map((button) => decodeCallbackData(button.callback_data)?.action)

    expect(actions).toEqual([
      "scheduleIn1h",
      "scheduleIn3h",
      "scheduleEvening",
      "scheduleMorning",
      "scheduleBack",
    ])
  })

  it("maps every preset button back to its preset", () => {
    const now = new Date(2026, 7, 12, 9, 0, 0, 0)

    for (const button of buildScheduleKeyboard(POST_ID, now)
      .inline_keyboard.flat()
      .slice(0, -1)) {
      const action = decodeCallbackData(button.callback_data)?.action

      expect(action && PRESET_BY_ACTION.get(action)).toBeTruthy()
    }
  })

  /** 64 bytes is Telegram's hard cap, and a cuid leaves little room. */
  it("keeps every callback under the limit", () => {
    const now = new Date(2026, 7, 12, 9, 0, 0, 0)
    const all = [
      ...buildModerationKeyboard(POST_ID).inline_keyboard.flat(),
      ...buildScheduleKeyboard(POST_ID, now).inline_keyboard.flat(),
      ...buildScheduledKeyboard(POST_ID).inline_keyboard.flat(),
    ]

    for (const button of all) {
      expect(
        Buffer.byteLength(button.callback_data, "utf8")
      ).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES)
    }
  })

  it("leaves a scheduled card exactly one way out", () => {
    const actions = buildScheduledKeyboard(POST_ID)
      .inline_keyboard.flat()
      .map((button) => decodeCallbackData(button.callback_data)?.action)

    expect(actions).toEqual(["unschedule"])
  })
})
