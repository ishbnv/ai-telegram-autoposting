import type { PrismaClient, ProxyUsage } from "./generated/prisma/client.js"

/**
 * The active proxy for a given use, or undefined for a direct connection.
 *
 * Resolved once at process start rather than per request: the clients that need
 * it are built at boot, and a self-hoster who adds a proxy to get around a block
 * restarts anyway. The admin panel says as much.
 *
 * If several proxies are marked active for the same use, the oldest wins — that
 * is the one the operator set up first, and picking at random would make the
 * behaviour untraceable.
 */
export async function resolveProxyUrl(
  prisma: PrismaClient,
  usedFor: ProxyUsage
): Promise<string | undefined> {
  const proxy = await prisma.proxy.findFirst({
    where: { usedFor, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { url: true },
  })

  return proxy?.url
}
