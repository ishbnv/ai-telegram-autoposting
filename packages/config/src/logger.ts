import { pino, type Logger, type LoggerOptions } from "pino"

export type { Logger }

export type CreateLoggerOptions = {
  /** Process name, e.g. "api" or "worker". Shows up on every line. */
  name: string
  level: LoggerOptions["level"]
  /** Human-readable output. On in development, off in production. */
  pretty: boolean
}

/**
 * Paths scrubbed from log output. The project handles a bot token, an API key
 * and session cookies; none of them should ever reach a log file, including via
 * an error object that happens to carry the request that produced it.
 */
const REDACTED_PATHS = [
  "token",
  "apiKey",
  "password",
  "authorization",
  "cookie",
  "*.token",
  "*.apiKey",
  "*.password",
  "*.authorization",
  "*.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
]

export function createLogger(options: CreateLoggerOptions): Logger {
  return pino({
    name: options.name,
    level: options.level,
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
    ...(options.pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
          },
        }
      : {}),
  })
}
