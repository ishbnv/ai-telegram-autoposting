/**
 * Whether this chat is the one that moderates this post.
 *
 * The allowlist answers a different question — "is this chat allowed to talk to
 * the bot at all" — and it is the union of every channel's moderation chat. On
 * a deployment with two channels moderated in different groups, passing the
 * allowlist says nothing about whether the presser may act on *this* draft.
 *
 * `moderationChatId` on the post is where the card was actually delivered, so
 * it is preferred; the channel's current setting is the fallback for rows
 * written before the card was placed.
 */
export function moderatesPost(
  chatId: number | bigint,
  post: {
    moderationChatId: bigint | null
    channel: { moderationChatId: bigint }
  }
): boolean {
  const expected = post.moderationChatId ?? post.channel.moderationChatId

  return chatId.toString() === expected.toString()
}
