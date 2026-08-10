import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "./generated/prisma/client.js"

export * from "./generated/prisma/client.js"
export { resolveProxyUrl } from "./proxy.js"

/**
 * Every process builds its own client. The connection string is passed in rather
 * than read from the environment here, so that env parsing stays in one place.
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
