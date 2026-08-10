import {
  decodeCallbackData,
  updateModerationCard,
  type ModerationAction,
  type TelegramCallbackQuery,
} from "@core"
import type { Channel, Post, PostStatus } from "@db"

import type { BotContext } from "@/context"
import { buildEditPrompt } from "@/lib/editPrompt"
import { allowedChats, isAllowed } from "@/lib/allowlist"
import { moderatesPost } from "@/lib/moderates"

/** A ForceReply prompt quoting the whole draft would hit Telegram's limit. */
const PROMPT_DRAFT_LIMIT = 2_000

/** Which statuses each button is allowed to act on. */
const ALLOWED_FROM: Record<ModerationAction, PostStatus[]> = {
  publish: ["PENDING_APPROVAL"],
  reject: ["PENDING_APPROVAL"],
  regenerate: ["PENDING_APPROVAL", "FAILED"],
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

type LoadedPost = Post & { channel: Channel }

/**
 * Conditional by status, so two people tapping the same button — or the same
 * person tapping twice on a flaky connection — produce one transition.
 */
async function transition(
  ctx: BotContext,
  postId: string,
  action: Exclude<ModerationAction, "edit">
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
      action === "regenerate" ? { status: to, error: null } : { status: to },
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
