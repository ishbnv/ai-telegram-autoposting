import { updateModerationCard, type TelegramMessage } from "@core"

import type { BotContext } from "@/context"
import { allowedChats, isAllowed } from "@/lib/allowlist"
import { parseEditPrompt } from "@/lib/editPrompt"

/** Matches the limit the API puts on a manual edit. */
const MAX_TEXT_LENGTH = 8_000

export async function handleMessage(
  ctx: BotContext,
  message: TelegramMessage
): Promise<void> {
  const text = message.text?.trim()
  if (!text) {
    return
  }

  // Answered from any chat on purpose: adding the bot to a group and asking it
  // for the id is how an operator finds the value for the Channels screen.
  if (/^\/id(@\w+)?$/.test(text)) {
    await ctx.telegram.sendMessage(
      message.chat.id,
      `Chat id: <code>${message.chat.id}</code>\nType: ${message.chat.type}`
    )
    return
  }

  const postId = parseEditPrompt(message.reply_to_message?.text)
  if (!postId) {
    return
  }

  if (!isAllowed(await allowedChats(ctx), message.chat.id)) {
    ctx.logger.warn(
      { chatId: message.chat.id },
      "edit reply from a chat that is not a moderation chat"
    )
    return
  }

  const reply = (body: string) =>
    ctx.telegram.sendMessage(message.chat.id, body, {
      replyToMessageId: message.message_id,
    })

  if (text.length > MAX_TEXT_LENGTH) {
    await reply(`That is longer than ${MAX_TEXT_LENGTH} characters.`)
    return
  }

  const post = await ctx.prisma.post.findUnique({
    where: { id: postId },
    include: { channel: true },
  })

  if (!post) {
    await reply("That post no longer exists.")
    return
  }

  // Same guard as every other transition: an edit only applies while the draft
  // is still waiting for a decision.
  const { count } = await ctx.prisma.post.updateMany({
    where: { id: postId, status: "PENDING_APPROVAL" },
    data: { text },
  })

  if (count === 0) {
    await reply("That draft is no longer awaiting approval.")
    return
  }

  // Redraw with the buttons intact — the post still needs a decision.
  const redrawn = await updateModerationCard(
    ctx.telegram,
    { ...post, text },
    post.channel
  ).catch((error: unknown) => {
    ctx.logger.warn(
      { postId, err: String(error) },
      "could not redraw the moderation card"
    )
    return false
  })

  await reply(
    redrawn
      ? "Updated. The card above now shows the new text."
      : "Updated, but the original card could not be redrawn."
  )

  ctx.logger.info({ postId, length: text.length }, "draft edited from Telegram")
}
