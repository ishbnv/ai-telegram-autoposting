import {
  decodeCallbackData,
  buildModerationKeyboard,
  buildScheduledKeyboard,
  buildScheduleKeyboard,
  describeMoment,
  PRESET_BY_ACTION,
  resolveSchedule,
  updateModerationCard,
  type ModerationAction,
  type SchedulePreset,
  type TelegramCallbackQuery,
} from "@core"
import type { Channel, Post, PostStatus } from "@db"

import type { BotContext } from "@/context"
import { buildEditPrompt } from "@/lib/editPrompt"
import { allowedChats, isAllowed } from "@/lib/allowlist"
import { moderatesPost } from "@/lib/moderates"

/** A ForceReply prompt quoting the whole draft would hit Telegram's limit. */
const PROMPT_DRAFT_LIMIT = 2_000

/**
 * Which statuses each button is allowed to act on.
 *
 * APPROVED is included in the two escape hatches on purpose. A post whose
 * publish job exhausts its retries stays APPROVED, and every action used to
 * require PENDING_APPROVAL — so it could never be published, retried or
 * dismissed again, and sat in the "queued" counter forever. Both are safe: the
 * publish handler re-checks the status when it claims, so a post moved out of
 * APPROVED is skipped rather than sent.
 */
/**
 * The actions that move a post from one status to another. The scheduling
 * buttons are deliberately not among them: opening the picker only swaps the
 * keyboard, and scheduling and cancelling have their own conditional writes
 * further down. Keeping them out of this table means the compiler will not let
 * one be routed through `transition` by accident.
 */
const TRANSITION_ACTIONS = [
  "publish",
  "reject",
  "regenerate",
  "edit",
] as const satisfies readonly ModerationAction[]

type TransitionAction = (typeof TRANSITION_ACTIONS)[number]

function isTransitionAction(
  action: ModerationAction
): action is TransitionAction {
  return (TRANSITION_ACTIONS as readonly ModerationAction[]).includes(action)
}

const ALLOWED_FROM: Record<TransitionAction, PostStatus[]> = {
  publish: ["PENDING_APPROVAL"],
  reject: ["PENDING_APPROVAL", "APPROVED", "FAILED"],
  regenerate: ["PENDING_APPROVAL", "APPROVED", "FAILED"],
  edit: ["PENDING_APPROVAL"],
}

export async function handleCallback(
  ctx: BotContext,
  query: TelegramCallbackQuery
): Promise<void> {
  const answer = (text: string) =>
    ctx.telegram
      .answerCallbackQuery(query.id, { text })
      .catch((error: unknown) =>
        ctx.logger.warn({ err: String(error) }, "could not answer callback")
      )

  const chatId = query.message?.chat.id
  if (chatId === undefined) {
    await answer("This card is too old to act on")
    return
  }

  if (!isAllowed(await allowedChats(ctx), chatId)) {
    ctx.logger.warn(
      { chatId, from: query.from.id },
      "callback from a chat that is not a moderation chat"
    )
    await answer("This bot does not take instructions from this chat")
    return
  }

  const payload = query.data ? decodeCallbackData(query.data) : null
  if (!payload) {
    await answer("Unrecognised button")
    return
  }

  const post = await ctx.prisma.post.findUnique({
    where: { id: payload.postId },
    include: { channel: true },
  })

  if (!post) {
    await answer("This post no longer exists")
    return
  }

  /**
   * The allowlist above only established that this chat may talk to the bot.
   * callback_data is client-supplied — a modified client can submit any post id
   * — so without this, a moderator of one channel could publish another
   * channel's draft, and the edit prompt would carry its text into their chat.
   */
  if (!moderatesPost(chatId, post)) {
    ctx.logger.warn(
      { postId: payload.postId, action: payload.action },
      "callback came from a chat that does not moderate this post"
    )
    await answer("This post is moderated in a different chat")
    return
  }

  if (payload.action === "edit") {
    await sendEditPrompt(ctx, post)
    await answer("Reply with the new text")
    return
  }

  // Opening and closing the time picker only swaps the buttons — no status
  // moves, so these run before the transition guard below.
  if (payload.action === "schedule" || payload.action === "scheduleBack") {
    if (post.status !== "PENDING_APPROVAL") {
      await answer("Already handled")
      return
    }

    await ctx.telegram.editMessageReplyMarkup(
      chatId,
      query.message?.message_id ?? 0,
      payload.action === "schedule"
        ? buildScheduleKeyboard(post.id, new Date())
        : buildModerationKeyboard(post.id)
    )
    await answer(payload.action === "schedule" ? "Pick a time" : "")
    return
  }

  const preset = PRESET_BY_ACTION.get(payload.action)
  if (preset) {
    await schedulePost(ctx, post, preset)
    await answer("Scheduled")
    return
  }

  if (payload.action === "unschedule") {
    const undone = await cancelSchedule(ctx, post)
    await answer(undone ? "Schedule cancelled" : "Too late — already sent")
    return
  }

  if (!isTransitionAction(payload.action)) {
    // Every remaining action was handled above; this is here so a new one
    // cannot slip through as a silent no-op.
    ctx.logger.warn({ action: payload.action }, "unhandled moderation action")
    await answer("Unsupported action")
    return
  }

  const moved = await transition(ctx, post.id, payload.action)

  if (!moved) {
    // The guard that makes a double tap safe: whoever pressed first won, and
    // this press must not do the work a second time.
    await answer("Already handled")
    return
  }

  if (payload.action === "publish") {
    await ctx.queue.enqueue({
      type: "PUBLISH_POST",
      payload: { postId: post.id },
    })
    await closeCard(ctx, post, "✅ Approved — publishing")
    await answer("Publishing")
    return
  }

  if (payload.action === "reject") {
    await closeCard(ctx, post, "❌ Rejected")
    await answer("Rejected")
    return
  }

  await ctx.queue.enqueue({
    type: "GENERATE_POST",
    payload: { postId: post.id },
    dedupeKey: `generate:${post.id}`,
  })
  await closeCard(ctx, post, "♻️ Regenerating — a new card will arrive")
  await answer("Regenerating")
}

/**
 * Approves the post and queues its publication for later. The delay is the
 * job's `runAt`; nothing polls, and the worker will not touch the job before
 * then. The dedupe key is what makes the schedule cancellable — it gives the
 * one row to delete — and it also stops a second tap queueing a second send.
 */
async function schedulePost(
  ctx: BotContext,
  post: LoadedPost,
  preset: SchedulePreset
): Promise<void> {
  const now = new Date()
  const at = resolveSchedule(preset, now)

  const { count } = await ctx.prisma.post.updateMany({
    where: { id: post.id, status: "PENDING_APPROVAL" },
    data: { status: "APPROVED", scheduledFor: at },
  })

  if (count === 0) {
    return
  }

  await ctx.queue.enqueue({
    type: "PUBLISH_POST",
    payload: { postId: post.id },
    runAt: at,
    dedupeKey: publishKey(post.id),
  })

  await updateModerationCard(
    ctx.telegram,
    post,
    post.channel,
    `⏰ Scheduled for ${describeMoment(at, now)}`,
    buildScheduledKeyboard(post.id)
  )
}

/**
 * Undoes a schedule, provided the worker has not started on it.
 *
 * The job row is deleted under `status: "PENDING"`, so a job already claimed —
 * or already run — survives and the post still goes out. Cancelling has to be
 * the thing that loses that race: the alternative is a post that a moderator
 * believes was called back sitting in the channel.
 */
async function cancelSchedule(
  ctx: BotContext,
  post: LoadedPost
): Promise<boolean> {
  const { count } = await ctx.prisma.job.deleteMany({
    where: { dedupeKey: publishKey(post.id), status: "PENDING" },
  })

  if (count === 0) {
    return false
  }

  const released = await ctx.prisma.post.updateMany({
    where: { id: post.id, status: "APPROVED" },
    data: { status: "PENDING_APPROVAL", scheduledFor: null },
  })

  if (released.count === 0) {
    return false
  }

  await updateModerationCard(
    ctx.telegram,
    post,
    post.channel,
    undefined,
    buildModerationKeyboard(post.id)
  )

  return true
}

const publishKey = (postId: string) => `publish:${postId}`

type LoadedPost = Post & { channel: Channel }

/**
 * Conditional by status, so two people tapping the same button — or the same
 * person tapping twice on a flaky connection — produce one transition.
 */
async function transition(
  ctx: BotContext,
  postId: string,
  action: Exclude<TransitionAction, "edit">
): Promise<boolean> {
  const to: PostStatus =
    action === "publish"
      ? "APPROVED"
      : action === "reject"
        ? "REJECTED"
        : "GENERATING"

  const { count } = await ctx.prisma.post.updateMany({
    where: { id: postId, status: { in: ALLOWED_FROM[action] } },
    data:
      action === "regenerate"
        ? // Cleared so the worker writes a new draft rather than reusing the one
          // being rejected — an empty text on a GENERATING post means "unwritten".
          { status: to, error: null, text: "" }
        : { status: to },
  })

  return count > 0
}

async function closeCard(
  ctx: BotContext,
  post: LoadedPost,
  note: string
): Promise<void> {
  await updateModerationCard(ctx.telegram, post, post.channel, note).catch(
    (error: unknown) =>
      ctx.logger.warn(
        { postId: post.id, err: String(error) },
        "could not close the moderation card"
      )
  )
}

async function sendEditPrompt(
  ctx: BotContext,
  post: LoadedPost
): Promise<void> {
  // The post's own moderation chat, not the pressing one: the prompt quotes the
  // draft, and it must not travel to a chat that is not moderating this post.
  await ctx.telegram.sendMessage(
    post.moderationChatId ?? post.channel.moderationChatId,
    buildEditPrompt(post.id, post.text.slice(0, PROMPT_DRAFT_LIMIT)),
    {
      // Plain text: the draft is quoted verbatim and may contain anything.
      parseMode: null,
      forceReply: true,
      ...(post.moderationMessageId
        ? { replyToMessageId: post.moderationMessageId }
        : {}),
    }
  )
}
