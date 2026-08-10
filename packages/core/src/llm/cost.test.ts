import { describe, expect, it } from "vitest"

import { computeCostUsd, parsePricing } from "./cost"

describe("parsePricing", () => {
  it("reads OpenRouter's decimal strings", () => {
    expect(
      parsePricing({ prompt: "0.000003", completion: "0.000015" })
    ).toEqual({ prompt: 0.000003, completion: 0.000015 })
  })

  it("treats missing prices as zero rather than NaN", () => {
    expect(parsePricing({})).toEqual({ prompt: 0, completion: 0 })
    expect(parsePricing({ prompt: null, completion: undefined })).toEqual({
      prompt: 0,
      completion: 0,
    })
  })

  it("rejects garbage and negatives instead of poisoning the totals", () => {
    expect(parsePricing({ prompt: "free", completion: "-1" })).toEqual({
      prompt: 0,
      completion: 0,
    })
  })
})

describe("computeCostUsd", () => {
  it("charges prompt and completion tokens at their own rates", () => {
    const cost = computeCostUsd(
      { promptTokens: 1000, completionTokens: 500 },
      { prompt: 0.000003, completion: 0.000015 }
    )

    expect(cost).toBeCloseTo(0.0105, 10)
  })

  it("is zero when the model is free", () => {
    expect(
      computeCostUsd(
        { promptTokens: 1000, completionTokens: 1000 },
        { prompt: 0, completion: 0 }
      )
    ).toBe(0)
  })
})
