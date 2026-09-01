import { describe, expect, it } from "vitest"

import { ApiRequestError, errorMessage } from "./api"

/**
 * Everything a dialog shows a person when a save fails goes through here, so a
 * wrong answer is not a crash — it is an operator staring at "Something went
 * wrong" while the API said exactly which field was rejected.
 */
describe("errorMessage", () => {
  it("appends the fields the API named", () => {
    const error = new ApiRequestError(400, "Invalid input", [
      { path: "url", message: "must be an http or https URL" },
    ])

    expect(errorMessage(error)).toBe(
      "Invalid input (url: must be an http or https URL)"
    )
  })

  it("joins several fields rather than showing only the first", () => {
    const error = new ApiRequestError(400, "Invalid input", [
      { path: "name", message: "is required" },
      { path: "cron", message: "is not a cron expression" },
    ])

    expect(errorMessage(error)).toBe(
      "Invalid input (name: is required, cron: is not a cron expression)"
    )
  })

  /** A 409 carries no field list, and an empty one must not add "()". */
  it("leaves the message alone when no field was named", () => {
    const error = new ApiRequestError(
      409,
      "Another record already uses this label"
    )

    expect(errorMessage(error)).toBe("Another record already uses this label")
  })

  it("passes an ordinary error through", () => {
    expect(errorMessage(new Error("Failed to fetch"))).toBe("Failed to fetch")
  })

  /** A rejected promise can carry anything at all, including a string. */
  it("has something to say about a value that is not an Error", () => {
    expect(errorMessage("boom")).toBe("Something went wrong")
    expect(errorMessage(undefined)).toBe("Something went wrong")
  })
})
