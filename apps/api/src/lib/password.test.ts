import { describe, expect, it } from "vitest"

import { hashPassword, verifyPassword } from "./password"

describe("password hashing", () => {
  it("accepts the password it was derived from", async () => {
    const hash = await hashPassword("correct horse battery staple")
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true
    )
  })

  it("rejects a different password", async () => {
    const hash = await hashPassword("correct horse battery staple")
    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(
      false
    )
  })

  it("uses a fresh salt, so the same password hashes differently", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same"),
      hashPassword("same"),
    ])

    expect(a).not.toBe(b)
    expect(await verifyPassword("same", a)).toBe(true)
    expect(await verifyPassword("same", b)).toBe(true)
  })

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false)
    expect(await verifyPassword("x", "not-a-hash")).toBe(false)
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false)
    expect(await verifyPassword("x", "scrypt$32768$8$1$c2FsdA$")).toBe(false)
  })
})
