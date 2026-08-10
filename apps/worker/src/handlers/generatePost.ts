import { buildMessages, sendModerationCard } from "@core"
import type { Job } from "@db"
import { z } from "zod"

import type { WorkerContext } from "@/context"

export const generatePostPayload = z.object({ postId: z.string().min(1) })

export async function handleGeneratePost(
  ctx: WorkerContext,
  job: Job
): Promise<void> {
  const { postId } = generatePostPayload.parse(job.payload)

  const post = await ctx.prisma.post.findUnique({
    where: { id: postId },
    include: { newsItem: true, prompt: true, channel: true },
  })

  if (!post) {
    ctx.logger.debug({ postId }, "post is gone, nothing to generate")
    return
  }

  // Anything other than GENERATING means a human or another worker already
  // moved this post on. Re-running would overwrite their decision.
  if (post.status !== "GENERATING") {
    ctx.logger.debug(
      { postId, status: post.status },
      "post is no longer awaiting generation"
    )
    return
  }

  try {
    const result = await ctx.llm.chat({
      model: post.prompt.model,
      messages: buildMessages({
        systemPrompt: post.prompt.systemPrompt,
        userTemplate: post.prompt.userTemplate,
        values: {
          title: post.newsItem.title,
          url: post.newsItem.url,
          summary: post.newsItem.summary,
          content: post.newsItem.content,
        },
      }),
      temperature: post.prompt.temperature,
      maxTokens: post.prompt.maxTokens,
    })

    await ctx.prisma.llmCall.create({
      data: {
        postId: post.id,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      },
    })

    const card = await sendModerationCard(
      ctx.telegram,
      { ...post, text: result.text },
      post.channel,
      {
        onPhotoRejected: (error) =>
          ctx.logger.warn(
            { postId: post.id, err: error.message },
            "photo rejected, falling back to a text card"
          ),
      }
    )

    // Conditional, so a regenerate that landed while the model was thinking
    // wins instead of being silently overwritten.
    const { count } = await ctx.prisma.post.updateMany({
      where: { id: post.id, status: "GENERATING" },
      data: {
        status: "PENDING_APPROVAL",
        text: result.text,
        model: result.model,
        moderationChatId: card.chatId,
        moderationMessageId: card.messageId,
        error: null,
      },
    })

    if (count === 0) {
      ctx.logger.warn(
        { postId },
        "post changed while generating; the card just sent is stale"
      )
      return
    }

    ctx.logger.info(
      { postId, model: result.model, costUsd: result.costUsd },
      "draft sent for approval"
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const lastAttempt = job.attempts >= job.maxAttempts

    // Keep the post in GENERATING while retries remain, so the next attempt is
    // allowed to proceed. Only the final failure is worth showing an operator.
    await ctx.prisma.post.updateMany({
      where: { id: post.id, status: "GENERATING" },
      data: lastAttempt
        ? { status: "FAILED", error: message }
        : { error: message },
    })

    throw error
  }
}
