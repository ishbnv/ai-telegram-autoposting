import { z } from "zod"

/**
 * Environment is split into feature-scoped shapes rather than one big schema:
 * the worker has no business failing to start because the admin password hash
 * is missing, and the API has no business needing a bot token.
 */

/**
 * Marks a variable as optional in the way `.env` files actually behave: people
 * copy `.env.example` and leave the keys they have not set up yet blank, so an
 * empty or whitespace-only value has to read as absent rather than invalid.
 */
export function optionalEnv<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional()
  )
}

export const baseEnvShape = {
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  TZ: z.string().min(1).default("UTC"),
}

export const databaseEnvShape = {
  DATABASE_URL: z.string().min(1),
}

export const telegramEnvShape = {
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  /** Default chat that receives moderation cards. Channels may override it. */
  TELEGRAM_MODERATION_CHAT_ID: z.coerce.bigint(),
}

export const openRouterEnvShape = {
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_APP_URL: z.url().default("http://localhost:5173"),
  OPENROUTER_APP_TITLE: z.string().min(1).default("AI Telegram Autoposting"),
}

/**
 * `scrypt:N:r:p:salt:key`, with `$` accepted for hashes generated before the
 * separator changed. The salt and key are base64url, hence `[\w-]`, and the
 * backreference keeps a hash from mixing the two separators.
 *
 * Checking the shape at startup exists to turn a silent failure into a loud
 * one. A `$`-separated hash loses its salt and key to Docker Compose's variable
 * expansion, and a value someone wrapped in quotes keeps the quotes; either way
 * the old code started up healthy and then rejected the correct password
 * forever, with nothing in any log pointing at the cause.
 */
const ADMIN_PASSWORD_HASH_PATTERN =
  /^scrypt([:$])\d+\1\d+\1\d+\1[\w-]+\1[\w-]+$/

/**
 * Reddit's public endpoints answer 403 now, so a Reddit source needs an app of
 * its own. Optional: a deployment with no Reddit sources should not be made to
 * register one. `redditCredentials` below is what enforces that the two halves
 * arrive together — a shape cannot express a rule spanning two of its fields.
 */
export const redditEnvShape = {
  REDDIT_CLIENT_ID: optionalEnv(z.string().min(1)),
  REDDIT_CLIENT_SECRET: optionalEnv(z.string().min(1)),
}

export const apiEnvShape = {
  API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
  ADMIN_PASSWORD_HASH: z
    .string()
    .min(1)
    .regex(
      ADMIN_PASSWORD_HASH_PATTERN,
      "must look like scrypt:N:r:p:salt:key — regenerate it with " +
        "`pnpm --filter @workspace/api hash-password`. If the value came " +
        "through Docker Compose, note that Compose expands `$` inside " +
        "env-file values, which truncates an older `$`-separated hash; " +
        "quoting the value in .env corrupts it too"
    ),
  /** Signs the session cookie. Short secrets are trivially brute-forced. */
  SESSION_SECRET: z.string().min(32),
}

export class EnvironmentError extends Error {
  override readonly name = "EnvironmentError"
}

/**
 * Parses the given shape out of `source`. The thrown message lists offending
 * variable names and why they failed, never their values — these messages end
 * up in logs and crash reports.
 */
export function parseEnv<Shape extends z.ZodRawShape>(
  shape: Shape,
  source: Record<string, string | undefined> = process.env
): z.infer<z.ZodObject<Shape>> {
  const result = z.object(shape).safeParse(source)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n")

    throw new EnvironmentError(
      `Environment is not valid:\n${details}\n\nSee .env.example for the expected variables.`
    )
  }

  return result.data
}

/**
 * Loads a `.env` file into `process.env` if it exists. A missing file is normal
 * in production, where variables come from the container runtime.
 */
export function loadEnvFile(path: string): void {
  try {
    process.loadEnvFile(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT") {
      throw error
    }
  }
}

/**
 * The pair, or nothing. Half a credential is always a mistake — a typo'd
 * variable name, a value that never made it into the env file — and it is worth
 * refusing at boot rather than turning into a 403 at the next fetch, where it
 * looks exactly like Reddit blocking the request.
 */
export function redditCredentials(env: {
  REDDIT_CLIENT_ID?: string | undefined
  REDDIT_CLIENT_SECRET?: string | undefined
}): { clientId: string; clientSecret: string } | undefined {
  const id = env.REDDIT_CLIENT_ID
  const secret = env.REDDIT_CLIENT_SECRET

  if (id && secret) {
    return { clientId: id, clientSecret: secret }
  }

  if (id || secret) {
    throw new EnvironmentError(
      "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set together: one without the other cannot authenticate."
    )
  }

  return undefined
}
