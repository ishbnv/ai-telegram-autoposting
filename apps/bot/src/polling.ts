import type { TelegramUpdate } from "@core"

import type { BotContext } from "@/context"
import { handleCallback } from "@/handlers/callback"
import { handleMessage } from "@/handlers/message"

const OFFSET_KEY = "bot:updateOffset"

/** Back off after a failed poll so a Telegram outage is not a tight loop. */
const ERROR_DELAY_MS = 5_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readOffset(ctx: BotContext): Promise<number> {
  const row = await ctx.prisma.setting.findUnique({
    where: { key: OFFSET_KEY },
  })
  return typeof row?.value === "number" ? row.value : 0
}

async function writeOffset(ctx: BotContext, offset: number): Promise<void> {
  await ctx.prisma.setting.upsert({
    where: { key: OFFSET_KEY },
    create: { key: OFFSET_KEY, value: offset },
    update: { value: offset },
  })
}

async function dispatch(
  ctx: BotContext,
  update: TelegramUpdate
): Promise<void> {
  if (update.callback_query) {
    await handleCallback(ctx, update.callback_query)
    return
  }

  if (update.message) {
    await handleMessage(ctx, update.message)
  }
}

/**
 * Long polling. The offset is persisted because Telegram redelivers anything
 * not acknowledged: after a restart the bot would otherwise replay old button
 * presses. The status guards make that survivable, but replaying it is still
 * work nobody asked for.
 */
export async function runPolling(
  ctx: BotContext,
  signal: AbortSignal
): Promise<void> {
  let offset = await readOffset(ctx)
  ctx.logger.info({ offset }, "polling for updates")

  while (!signal.aborted) {
    try {
      const updates = await ctx.telegram.getUpdates(offset)

      for (const update of updates) {
        try {
          await dispatch(ctx, update)
        } catch (error) {
          // One bad update must not stall the offset and wedge the bot.
          ctx.logger.error(
            { updateId: update.update_id, err: String(error) },
            "update handler failed"
          )
        }

        offset = update.update_id + 1
      }

      if (updates.length > 0) {
        await writeOffset(ctx, offset)
      }
    } catch (error) {
      if (signal.aborted) {
        return
      }

      ctx.logger.error({ err: String(error) }, "poll failed")
      await sleep(ERROR_DELAY_MS)
    }
  }
}
