import {
  idParamSchema,
  paginationQuerySchema,
  postsQuerySchema,
  updatePostSchema,
  type Paginated,
  type PostDto,
  type PostStatusValue,
  type PublicationDto,
} from "@contracts"
import type { Prisma, PrismaClient } from "@db"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { toPostDto, toPublicationDto } from "../lib/dto"

const withRelations = {
  pipeline: { select: { name: true } },
  channel: { select: { title: true } },
  llmCalls: { select: { costUsd: true } },
} as const

/**
 * Moves a post between statuses only if it is currently in one of `from`.
 * Returning 0 means somebody — or a second tap on the same Telegram button —
 * already moved it, and the caller must not treat that as success.
 */
async function transition(
  prisma: PrismaClient,
  id: string,
  from: PostStatusValue[],
  to: PostStatusValue,
  extra: Prisma.PostUpdateManyMutationInput = {}
): Promise<boolean> {
  const { count } = await prisma.post.updateMany({
    where: { id, status: { in: from } },
    data: { status: to, ...extra },
  })

  return count > 0
}

async function loadPost(prisma: PrismaClient, id: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    include: withRelations,
  })

  if (!post) {
    throw new HTTPException(404, { message: "Post not found" })
  }

  return post
}

export const postRoutes = new Hono<AppEnv>()
  .get("/", validate("query", postsQuerySchema), async (c) => {
    const { page, pageSize, status, pipelineId, channelId, search } =
      c.req.valid("query")
    const prisma = c.get("prisma")

    const where: Prisma.PostWhereInput = {
      ...(status ? { status } : {}),
      ...(pipelineId ? { pipelineId } : {}),
      ...(channelId ? { channelId } : {}),
      ...(search
        ? {
            OR: [
              { text: { contains: search, mode: "insensitive" } },
              { sourceName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: withRelations,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.post.count({ where }),
    ])

    return c.json<Paginated<PostDto>>({
      items: items.map(toPostDto),
      total,
      page,
      pageSize,
    })
  })

  .get("/publications", validate("query", paginationQuerySchema), async (c) => {
    const { page, pageSize } = c.req.valid("query")
    const prisma = c.get("prisma")

    const [items, total] = await Promise.all([
      prisma.publication.findMany({
        include: {
          channel: { select: { title: true } },
          post: {
            select: { text: true, sourceName: true, sourceUrl: true },
          },
        },
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.publication.count(),
    ])

    return c.json<Paginated<PublicationDto>>({
      items: items.map(toPublicationDto),
      total,
      page,
      pageSize,
    })
  })

  .get("/:id", validate("param", idParamSchema), async (c) => {
    const post = await loadPost(c.get("prisma"), c.req.valid("param").id)
    return c.json<PostDto>(toPostDto(post))
  })

  /** Editing is only meaningful while the post is still awaiting a decision. */
  .patch(
    "/:id",
    validate("param", idParamSchema),
    validate("json", updatePostSchema),
    async (c) => {
      const { id } = c.req.valid("param")
      const prisma = c.get("prisma")

      const { count } = await prisma.post.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { text: c.req.valid("json").text },
      })

      if (count === 0) {
        throw new HTTPException(409, {
          message: "Post is not awaiting approval",
        })
      }

      return c.json<PostDto>(toPostDto(await loadPost(prisma, id)))
    }
  )

  .post("/:id/approve", validate("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param")
    const prisma = c.get("prisma")

    const moved = await transition(prisma, id, ["PENDING_APPROVAL"], "APPROVED")
    if (!moved) {
      throw new HTTPException(409, { message: "Post is not awaiting approval" })
    }

    // No dedupe key: only one caller can win the transition above, and a later
    // regenerate-then-approve cycle must be able to queue a fresh publish.
    await c.get("queue").enqueue({
      type: "PUBLISH_POST",
      payload: { postId: id },
    })

    c.get("logger").info({ postId: id }, "post approved for publishing")

    return c.json<PostDto>(toPostDto(await loadPost(prisma, id)))
  })

  .post("/:id/reject", validate("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param")
    const prisma = c.get("prisma")

    // APPROVED too: a post whose publish job ran out of attempts stays there,
    // and without an exit it could never be dismissed. Safe because the publish
    // handler re-checks the status when it claims the job.
    const moved = await transition(
      prisma,
      id,
      ["PENDING_APPROVAL", "APPROVED", "FAILED"],
      "REJECTED"
    )
    if (!moved) {
      throw new HTTPException(409, {
        message: "Post cannot be rejected in its current state",
      })
    }

    return c.json<PostDto>(toPostDto(await loadPost(prisma, id)))
  })

  .post("/:id/regenerate", validate("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param")
    const prisma = c.get("prisma")

    const moved = await transition(
      prisma,
      id,
      ["PENDING_APPROVAL", "APPROVED", "FAILED"],
      "GENERATING",
      { error: null }
    )

    if (!moved) {
      throw new HTTPException(409, {
        message: "Post cannot be regenerated in its current state",
      })
    }

    await c.get("queue").enqueue({
      type: "GENERATE_POST",
      payload: { postId: id },
    })

    return c.json<PostDto>(toPostDto(await loadPost(prisma, id)))
  })
