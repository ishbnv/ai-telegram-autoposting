import type { ApiError } from "@contracts"
import { zValidator } from "@hono/zod-validator"
import type { ValidationTargets } from "hono"
import type { ZodType } from "zod"

/**
 * zValidator with a failure body matching the rest of the API, so the panel has
 * one error shape to handle instead of two.
 */
export function validate<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json<ApiError>(
        {
          error: {
            message: "Validation failed",
            fields: result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        400
      )
    }

    return undefined
  })
}
