import { describe, expect, it } from "vitest"

import { buildEditPrompt, parseEditPrompt } from "./editPrompt"

const POST_ID = "cmsm63a04000mejna9dtz260d"

describe("edit prompt", () => {
  it("round-trips the post id through the message body", () => {
    const prompt = buildEditPrompt(POST_ID, "Some draft text")
    expect(parseEditPrompt(prompt)).toBe(POST_ID)
  })

  it("quotes the current draft so the editor can see what they are changing", () => {
    expect(buildEditPrompt(POST_ID, "Some draft text")).toContain(
      "Some draft text"
    )
  })

  it("ignores a reply to anything that is not one of our prompts", () => {
    expect(parseEditPrompt(undefined)).toBeNull()
    expect(parseEditPrompt("")).toBeNull()
    expect(parseEditPrompt("just a normal message")).toBeNull()
    expect(parseEditPrompt("[post:]")).toBeNull()
  })

  it("is not fooled by a draft that carries its own marker", () => {
    // The draft is untrusted text quoted verbatim inside the prompt. A model
    // that echoes a marker from a scraped page must not redirect the edit.
    const prompt = buildEditPrompt(POST_ID, "look at me: [post:injected]")

    expect(parseEditPrompt(prompt)).toBe(POST_ID)
  })

  it("ignores a marker that is not the last thing in the message", () => {
    expect(parseEditPrompt("[post:injected] trailing words")).toBeNull()
  })
})
