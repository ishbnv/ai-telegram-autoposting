import type { BotContext } from "@/context"

/** Channels change rarely; re-reading them on every update would be silly. */
const CACHE_TTL_MS = 60_000

let cache: { at: number; chats: Set<string> } | null = null

/**
 * The chats this bot will take instructions from: the default moderation chat
 * from the environment, plus whatever the channels point at.
 *
 * Anyone can add a bot to a group. Without this check, a stranger's group could
 * press buttons that publish to someone else's channel.
 */
export async function allowedChats(ctx: BotContext): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.chats
  }

  const channels = await ctx.prisma.channel.findMany({
    select: { moderationChatId: true },
  })

  const chats = new Set<string>([
    ctx.env.TELEGRAM_MODERATION_CHAT_ID.toString(),
    ...channels.map((channel) => channel.moderationChatId.toString()),
  ])

  cache = { at: Date.now(), chats }

  return chats
}

export function isAllowed(
  chats: Set<string>,
  chatId: number | bigint
): boolean {
  return chats.has(chatId.toString())
}
