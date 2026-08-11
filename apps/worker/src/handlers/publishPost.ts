import {
  HttpError,
  renderCardBody,
  renderRichPostMessage,
  TelegramApiError,
  updateModerationCard,
} from "@core"
import type { Job } from "@db"
import { z } from "zod"

import type { WorkerContext } from "@/context"

export const publishPostPayload = z.object({ postId: z.string().min(1) })

const time = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
})

export async function handlePublishPost(
  ctx: WorkerContext,
  job: Job
): Promise<void> {
  const { postId } = publishPostPayload.parse(job.payload)

  const post = await ctx.prisma.post.findUnique({
    where: { id: postId },
    include: { channel: true },
  })

  if (!post) {
    ctx.logger.debug({ postId }, "post is gone, nothing to publish")
    return
  }

  if (post.status !== "APPROVED") {
    ctx.logger.debug(
      { postId, status: post.status },
      "post is not approved for publishing"
    )
    return
  }

  /**
   * Claim the post before sending, not after.
   *
   * Sending first and marking second is the intuitive order, but a crash in
   * between leaves an APPROVED post that has already been delivered — and the
   * retry posts it to the channel a second time. Duplicates in a public channel
   * are the one failure this project refuses to risk, so the order is inverted
   * and the claim is rolled back only when a failure proves nothing was sent.
   */
  const claimed = await ctx.prisma.post.updateMany({
    where: { id: post.id, status: "APPROVED" },
    data: { status: "PUBLISHED", publishedAt: new Date(), error: null },
  })

  if (claimed.count === 0) {
    ctx.logger.debug({ postId }, "another worker claimed this post")
    return
  }

  const body = renderCardBody(post, post.channel, Boolean(post.mediaUrl))

  /**
   * Set the moment Telegram answers, and never cleared. Everything after the
   * send — recording the publication, rewriting the card — can fail, and the
   * rollback below must not treat those failures as "nothing was delivered".
   */
  let deliveredMessageId: number | null = null

  try {
    const message = await send(ctx, post, body)

    deliveredMessageId = message.message_id

    await ctx.prisma.publication.create({
      data: {
        postId: post.id,
        channelId: post.channelId,
        tgMessageId: message.message_id,
      },
    })

    // The post is already out; a card we could not rewrite is cosmetic.
    await updateModerationCard(
      ctx.telegram,
      post,
      post.channel,
      `✅ Published at ${time.format(new Date())}`
    ).catch((error: unknown) =>
      ctx.logger.warn(
        { postId: post.id, err: String(error) },
        "could not update the moderation card"
      )
    )

    ctx.logger.info(
      { postId, channelId: post.channelId, tgMessageId: message.message_id },
      "post published"
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (deliveredMessageId !== null) {
      /**
       * Telegram took it. Only the bookkeeping failed, so the post stays
       * PUBLISHED — releasing it here is what used to put a second copy in the
       * channel, because the old guard (`publications: { none: {} }`) is
       * satisfied precisely *because* the row failed to insert.
       */
      await recordPublication(ctx, post.id, post.channelId, deliveredMessageId)

      ctx.logger.error(
        { postId, tgMessageId: deliveredMessageId, err: message },
        "post was delivered but its bookkeeping failed"
      )

      // Swallow: a retry would re-send an already published post.
      return
    }

    if (provesNotDelivered(error)) {
      // Telegram rejected the request outright, so nothing reached the channel
      // and the post can safely go back in the queue for another attempt.
      await ctx.prisma.post.updateMany({
        where: { id: post.id, status: "PUBLISHED" },
        data: { status: "APPROVED", publishedAt: null, error: message },
      })

      throw error
    }

    /**
     * A timeout or a dropped connection: Telegram may or may not have sent it,
     * and the Bot API has no way to ask. Retrying could duplicate, so the post
     * is parked as FAILED for a human to check the channel and either publish
     * or regenerate from the panel.
     */
    await ctx.prisma.post.updateMany({
      where: { id: post.id, status: "PUBLISHED" },
      data: {
        status: "FAILED",
        publishedAt: null,
        error: `Delivery outcome unknown, check the channel before retrying: ${message}`,
      },
    })

    ctx.logger.error(
      { postId, err: message },
      "delivery outcome unknown, post parked for review"
    )

    return
  }
}

/**
 * Sends the post, falling back to text when Telegram refuses the image.
 *
 * The moderation card does the same, so a post whose image cannot be fetched
 * still reaches a moderator — but the image can rot between the draft and the
 * approval, and without this the post would then be approvable and unpublishable
 * forever. Only a 4xx triggers the fallback: it proves the photo was rejected
 * rather than sent, so the second call cannot duplicate.
 */
async function send(
  ctx: WorkerContext,
  post: {
    mediaUrl: string | null
    text: string
    sourceName: string
    sourceUrl: string
    channel: { tgChatId: bigint; footerTemplate: string }
  },
  body: string
): Promise<{ message_id: number }> {
  /**
   * Rich first, so the channel gets the formatting the draft was written with.
   * Only a 4xx falls through: that is Telegram refusing this particular
   * message, where the plain path is a genuine alternative. A 5xx or a timeout
   * must keep throwing, because the message may well have landed and retrying
   * it in another shape would publish it twice.
   */
  try {
    return await ctx.telegram.sendRichMessage(post.channel.tgChatId, {
      markdown: renderRichPostMessage({
        text: post.text,
        footerTemplate: post.channel.footerTemplate,
        source: { name: post.sourceName, url: post.sourceUrl },
        mediaUrl: post.mediaUrl,
      }),
    })
  } catch (error) {
    if (!(error instanceof TelegramApiError) || !refusedOutright(error)) {
      throw error
    }

    ctx.logger.warn(
      { err: error.message },
      "channel refused the rich message, publishing as plain text"
    )
  }

  if (!post.mediaUrl) {
    return ctx.telegram.sendMessage(post.channel.tgChatId, body)
  }

  try {
    return await ctx.telegram.sendPhoto(
      post.channel.tgChatId,
      post.mediaUrl,
      body
    )
  } catch (error) {
    if (!(error instanceof TelegramApiError) || !refusedOutright(error)) {
      throw error
    }

    ctx.logger.warn(
      { err: error.message },
      "channel refused the photo, publishing as text"
    )

    return ctx.telegram.sendMessage(post.channel.tgChatId, body)
  }
}

function refusedOutright(error: TelegramApiError): boolean {
  const code = error.errorCode ?? 0
  return code >= 400 && code < 500
}

/**
 * Telegram answered with a 4xx: it parsed the request and refused it, which is
 * proof that no message was sent. A 5xx or a transport error proves nothing —
 * the backend may already have delivered.
 */
function provesNotDelivered(error: unknown): boolean {
  if (error instanceof TelegramApiError) {
    return refusedOutright(error)
  }

  return error instanceof HttpError && error.status >= 400 && error.status < 500
}

/** Best effort: the post is already out, so a missing row is the lesser evil. */
async function recordPublication(
  ctx: WorkerContext,
  postId: string,
  channelId: string,
  tgMessageId: number
): Promise<void> {
  await ctx.prisma.publication
    .create({ data: { postId, channelId, tgMessageId } })
    .catch(() => undefined)
}
