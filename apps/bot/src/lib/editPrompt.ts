/**
 * The "send me the new text" prompt carries the post id in its own body.
 *
 * Telegram gives us `reply_to_message` on a reply, so reading the id back out
 * of our own message keeps the edit flow completely stateless: it survives a
 * bot restart, needs no table, and leaves nothing to clean up. The alternative,
 * a map from prompt message id to post id, has to be persisted and swept.
 */
/**
 * Anchored to the end of the message on purpose. The prompt quotes the draft,
 * which is untrusted text fetched from the internet: a draft containing its own
 * `[post:...]` would otherwise be matched first and the bot would edit whatever
 * post that text named. Our marker is always the last line.
 */
const MARKER = /\[post:([A-Za-z0-9_-]{1,64})\]\s*$/

export function buildEditPrompt(postId: string, currentText: string): string {
  return [
    "✏️ Reply to this message with the new text.",
    "",
    `Current draft:\n${currentText}`,
    "",
    `[post:${postId}]`,
  ].join("\n")
}

/** Returns null for a reply to anything that is not one of our prompts. */
export function parseEditPrompt(text: string | undefined): string | null {
  if (!text) {
    return null
  }

  return MARKER.exec(text)?.[1] ?? null
}
