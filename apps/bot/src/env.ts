import {
  baseEnvShape,
  databaseEnvShape,
  parseEnv,
  telegramEnvShape,
} from "@config"

export function loadBotEnv() {
  return parseEnv({
    ...baseEnvShape,
    ...databaseEnvShape,
    ...telegramEnvShape,
  })
}

export type BotEnv = ReturnType<typeof loadBotEnv>
