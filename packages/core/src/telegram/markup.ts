import {
  describePreset,
  SCHEDULE_PRESETS,
  type SchedulePreset,
} from "../posts/schedule"

/**
 * Telegram caps callback_data at 64 bytes, so the encoding is deliberately terse.
 * The version prefix means a bot rolled out mid-flight can still recognise, and
 * decline, cards produced by an older one.
 */
const PREFIX = "atp"
const VERSION = "1"
export const CALLBACK_DATA_MAX_BYTES = 64

export const MODERATION_ACTIONS = [
  "publish",
  "edit",
  "regenerate",
  "reject",
  // Scheduling. Each preset is its own action rather than a parameter: the
  // payload is fixed at four colon-separated parts, and the version field
  // exists so an older bot declines cards it cannot read — bumping it to carry
  // one extra field would invalidate every card already in a chat.
  "schedule",
  "scheduleIn1h",
  "scheduleIn3h",
  "scheduleEvening",
  "scheduleMorning",
  "unschedule",
  "scheduleBack",
] as const

export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

const ACTION_CODES = {
  publish: "pub",
  edit: "edt",
  regenerate: "reg",
  reject: "rej",
  schedule: "sch",
  scheduleIn1h: "s1h",
  scheduleIn3h: "s3h",
  scheduleEvening: "sev",
  scheduleMorning: "smo",
  unschedule: "uns",
  scheduleBack: "bak",
} as const satisfies Record<ModerationAction, string>

const CODE_TO_ACTION = new Map<string, ModerationAction>(
  MODERATION_ACTIONS.map((action) => [ACTION_CODES[action], action])
)

export type CallbackPayload = {
  action: ModerationAction
  postId: string
}

export class CallbackDataTooLongError extends Error {
  override readonly name = "CallbackDataTooLongError"
}

export function encodeCallbackData(payload: CallbackPayload): string {
  const encoded = `${PREFIX}:${VERSION}:${ACTION_CODES[payload.action]}:${payload.postId}`
  const size = Buffer.byteLength(encoded, "utf8")

  if (size > CALLBACK_DATA_MAX_BYTES) {
    throw new CallbackDataTooLongError(
      `Callback data is ${size} bytes, Telegram allows ${CALLBACK_DATA_MAX_BYTES}`
    )
  }

  return encoded
}

/**
 * Returns null for anything this bot did not produce — other bots in the same
 * chat, or cards from an incompatible version.
 */
export function decodeCallbackData(data: string): CallbackPayload | null {
  const parts = data.split(":")
  if (parts.length !== 4) {
    return null
  }

  const [prefix, version, code, postId] = parts
  if (prefix !== PREFIX || version !== VERSION || !postId) {
    return null
  }

  const action = code ? CODE_TO_ACTION.get(code) : undefined
  if (!action) {
    return null
  }

  return { action, postId }
}

export type InlineKeyboardMarkup = {
  inline_keyboard: { text: string; callback_data: string }[][]
}

/**
 * The only way a post reaches a channel. Publish and Reject are on the first
 * row so the destructive-looking pair sits together and away from Edit.
 */
export function buildModerationKeyboard(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Publish", callback_data: encode("publish", postId) },
        { text: "❌ Reject", callback_data: encode("reject", postId) },
      ],
      [
        { text: "✏️ Edit", callback_data: encode("edit", postId) },
        { text: "♻️ Regenerate", callback_data: encode("regenerate", postId) },
      ],
      [{ text: "⏰ Schedule", callback_data: encode("schedule", postId) }],
    ],
  }
}

const PRESET_ACTIONS = {
  in1h: "scheduleIn1h",
  in3h: "scheduleIn3h",
  evening: "scheduleEvening",
  morning: "scheduleMorning",
} as const satisfies Record<SchedulePreset, ModerationAction>

export const PRESET_BY_ACTION = new Map<ModerationAction, SchedulePreset>(
  SCHEDULE_PRESETS.map((preset) => [PRESET_ACTIONS[preset], preset])
)

/**
 * Replaces the moderation buttons while a time is being picked. Labels are
 * resolved against `now` so none of them can promise the wrong day.
 */
export function buildScheduleKeyboard(
  postId: string,
  now: Date
): InlineKeyboardMarkup {
  const rows = SCHEDULE_PRESETS.map((preset) => [
    {
      text: describePreset(preset, now),
      callback_data: encode(PRESET_ACTIONS[preset], postId),
    },
  ])

  return {
    inline_keyboard: [
      ...rows,
      [{ text: "← Back", callback_data: encode("scheduleBack", postId) }],
    ],
  }
}

/** The single button a scheduled card keeps, so the plan can be undone. */
export function buildScheduledKeyboard(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✖ Cancel schedule",
          callback_data: encode("unschedule", postId),
        },
      ],
    ],
  }
}

function encode(action: ModerationAction, postId: string): string {
  return encodeCallbackData({ action, postId })
}
