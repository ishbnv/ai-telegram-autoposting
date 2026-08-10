import { newsQuerySchema, type NewsItemDto, type Paginated } from "@contracts"
import type { Prisma } from "@db"
import { Hono } from "hono"

import type { AppEnv } from "../context"
import { validate } from "../lib/validate"
import { toNewsItemDto } from "../lib/dto"

export const newsRoutes = new Hono<AppEnv>().get(
  "/",
  validate("query", newsQuerySchema),
  async (c) => {
    const { page, pageSize, search, sourceId, status } = c.req.valid("query")
    const prisma = c.get("prisma")

    const where: Prisma.NewsItemWhereInput = {
      ...(sourceId ? { sourceId } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { summary: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      prisma.newsItem.findMany({
        where,
        include: { source: { select: { name: true } } },
        orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.newsItem.count({ where }),
    ])

    return c.json<Paginated<NewsItemDto>>({
      items: items.map(toNewsItemDto),
      total,
      page,
      pageSize,
    })
  }
)
