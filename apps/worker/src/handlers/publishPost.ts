import { renderCardBody, updateModerationCard } from "@core"
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
   * and a send failure rolls the claim back.
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

  try {
    const message = post.mediaUrl
      ? await ctx.telegram.sendPhoto(post.channel.tgChatId, post.mediaUrl, body)
      : await ctx.telegram.sendMessage(post.channel.tgChatId, body)

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
    // Hand the post back so the retry — or a human — can try again. The claim
    // above means it was never delivered, so releasing it cannot duplicate.
    await ctx.prisma.post.updateMany({
      where: { id: post.id, status: "PUBLISHED", publications: { none: {} } },
      data: {
        status: "APPROVED",
        publishedAt: null,
        error: error instanceof Error ? error.message : String(error),
      },
    })

    throw error
  }
}
