import {
  baseEnvShape,
  databaseEnvShape,
  openRouterEnvShape,
  redditEnvShape,
  parseEnv,
  telegramEnvShape,
} from "@config"

/**
 * Unlike the API, the worker cannot do anything useful without Telegram and
 * OpenRouter — generating and delivering posts is its whole job — so both are
 * required here and a missing one is a refusal to start rather than a surprise
 * at three in the morning.
 */
export function loadWorkerEnv() {
  return parseEnv({
    ...baseEnvShape,
    ...databaseEnvShape,
    ...telegramEnvShape,
    ...openRouterEnvShape,
    ...redditEnvShape,
  })
}

export type WorkerEnv = ReturnType<typeof loadWorkerEnv>
