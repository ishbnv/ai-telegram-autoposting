import { describe, expect, it } from "vitest"

import { LoginGuard } from "./loginGuard"

/** A clock the test drives, so nothing has to sleep. */
function clock(start = 1_000_000) {
  let value = start
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms
    },
  }
}

const admit = (guard: LoginGuard, client = "1.2.3.4") => {
  const admission = guard.admit(client)
  if (admission.allowed) {
    admission.release()
  }
  return admission
}

describe("LoginGuard", () => {
  it("allows attempts below the per-client limit", () => {
    const guard = new LoginGuard({ maxPerClient: 3 })

    for (let i = 0; i < 3; i += 1) {
      expect(admit(guard).allowed).toBe(true)
      guard.recordFailure("1.2.3.4")
    }

    expect(admit(guard).allowed).toBe(false)
  })

  it("reports how long to wait, and lets the window expire", () => {
    const time = clock()
    const guard = new LoginGuard({
      maxPerClient: 2,
      windowMs: 60_000,
      now: time.now,
    })

    guard.recordFailure("1.2.3.4")
    guard.recordFailure("1.2.3.4")

    const denied = admit(guard)
    expect(denied.allowed).toBe(false)
    if (!denied.allowed) {
      expect(denied.denial.reason).toBe("too-many-attempts")
      expect(denied.denial.retryAfterSec).toBe(60)
    }

    time.advance(60_001)
    expect(admit(guard).allowed).toBe(true)
  })

  it("does not let one client's failures lock out another", () => {
    const guard = new LoginGuard({ maxPerClient: 1, maxGlobal: 100 })

    guard.recordFailure("1.2.3.4")

    expect(admit(guard, "1.2.3.4").allowed).toBe(false)
    expect(admit(guard, "5.6.7.8").allowed).toBe(true)
  })

  it("clears a client's history on a correct password", () => {
    const guard = new LoginGuard({ maxPerClient: 2 })

    guard.recordFailure("1.2.3.4")
    guard.recordFailure("1.2.3.4")
    expect(admit(guard).allowed).toBe(false)

    guard.recordSuccess("1.2.3.4")
    expect(admit(guard).allowed).toBe(true)
  })

  // Behind a reverse proxy every request shares one source address, so the
  // per-client limit alone would either do nothing or lock out the operator.
  it("enforces a global ceiling across rotating addresses", () => {
    const guard = new LoginGuard({ maxPerClient: 100, maxGlobal: 5 })

    for (let i = 0; i < 5; i += 1) {
      guard.recordFailure(`10.0.0.${i}`)
    }

    const denied = admit(guard, "10.0.0.99")
    expect(denied.allowed).toBe(false)
    if (!denied.allowed) {
      expect(denied.denial.reason).toBe("too-many-global")
    }
  })

  // The layer that matters most: without it, N parallel requests mean N
  // simultaneous 33 MB scrypt allocations and the API falls over.
  it("caps concurrent verifications and sheds the excess", () => {
    const guard = new LoginGuard({ maxConcurrent: 2 })

    const first = guard.admit("a")
    const second = guard.admit("b")
    const third = guard.admit("c")

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
    if (!third.allowed) {
      expect(third.denial.reason).toBe("too-busy")
    }

    if (first.allowed) {
      first.release()
    }
    expect(guard.admit("d").allowed).toBe(true)
  })

  it("does not leak a slot when release is called twice", () => {
    const guard = new LoginGuard({ maxConcurrent: 1 })

    const admission = guard.admit("a")
    expect(admission.allowed).toBe(true)
    if (admission.allowed) {
      admission.release()
      admission.release()
    }

    expect(guard.admit("b").allowed).toBe(true)
  })
})
