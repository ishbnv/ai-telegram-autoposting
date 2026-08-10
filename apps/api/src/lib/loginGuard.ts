/**
 * Rate limiting for the one endpoint that is reachable without a session.
 *
 * Three layers, because each covers a case the others miss:
 *
 * 1. Per-client window — the ordinary "stop guessing" limit.
 * 2. Global window — behind a reverse proxy every request can share one source
 *    address, which would make layer 1 either useless or a self-inflicted
 *    lockout. This bounds the damage in that case without trusting a header an
 *    attacker controls.
 * 3. Concurrent verification cap — the important one. scrypt at N=2^15 costs
 *    ~33 MB and ~64 ms per attempt, so a flood of parallel requests is an
 *    unauthenticated memory-and-CPU amplifier that can take the API down with
 *    no correct password at all. Slots are taken *before* the KDF runs.
 */

export const DEFAULT_WINDOW_MS = 15 * 60 * 1000
export const DEFAULT_MAX_PER_CLIENT = 5
export const DEFAULT_MAX_GLOBAL = 50
export const DEFAULT_MAX_CONCURRENT = 2

/** Stops the failure map growing without bound on rotating source addresses. */
const MAX_TRACKED_CLIENTS = 10_000

export type LoginGuardOptions = {
  windowMs?: number
  maxPerClient?: number
  maxGlobal?: number
  maxConcurrent?: number
  /** Injectable so the tests do not have to sleep. */
  now?: () => number
}

export type Denied = {
  reason: "too-many-attempts" | "too-many-global" | "too-busy"
  retryAfterSec: number
}

export type Admission =
  | { allowed: true; release: () => void }
  | { allowed: false; denial: Denied }

export class LoginGuard {
  private readonly windowMs: number
  private readonly maxPerClient: number
  private readonly maxGlobal: number
  private readonly maxConcurrent: number
  private readonly now: () => number

  /** Failure timestamps, newest last. */
  private readonly failures = new Map<string, number[]>()
  private globalFailures: number[] = []
  private inFlight = 0

  constructor(options: LoginGuardOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
    this.maxPerClient = options.maxPerClient ?? DEFAULT_MAX_PER_CLIENT
    this.maxGlobal = options.maxGlobal ?? DEFAULT_MAX_GLOBAL
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    this.now = options.now ?? Date.now
  }

  /**
   * Call before verifying a password. On success the caller MUST invoke
   * `release()` in a finally, or the concurrency slot leaks.
   */
  admit(client: string): Admission {
    const denial =
      this.overLimit(
        this.recent(this.failures.get(client)),
        this.maxPerClient,
        "too-many-attempts"
      ) ??
      this.overLimit(
        this.recent(this.globalFailures),
        this.maxGlobal,
        "too-many-global"
      )

    if (denial) {
      return { allowed: false, denial }
    }

    if (this.inFlight >= this.maxConcurrent) {
      // Shed the request rather than queue it: queueing is what lets a flood
      // pin one scrypt allocation per connection.
      return {
        allowed: false,
        denial: { reason: "too-busy", retryAfterSec: 1 },
      }
    }

    this.inFlight += 1
    let released = false

    return {
      allowed: true,
      release: () => {
        if (!released) {
          released = true
          this.inFlight -= 1
        }
      },
    }
  }

  recordFailure(client: string): void {
    const at = this.now()

    this.failures.set(client, [...this.recent(this.failures.get(client)), at])
    this.globalFailures = [...this.recent(this.globalFailures), at]

    this.evictIfCrowded()
  }

  /** A correct password clears that client's history; the global one stands. */
  recordSuccess(client: string): void {
    this.failures.delete(client)
  }

  private recent(timestamps: number[] | undefined): number[] {
    if (!timestamps) {
      return []
    }

    const cutoff = this.now() - this.windowMs
    return timestamps.filter((at) => at > cutoff)
  }

  private overLimit(
    recent: number[],
    limit: number,
    reason: Denied["reason"]
  ): Denied | null {
    if (recent.length < limit) {
      return null
    }

    const oldest = recent[0] ?? this.now()
    const waitMs = Math.max(0, oldest + this.windowMs - this.now())

    return { reason, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) }
  }

  private evictIfCrowded(): void {
    if (this.failures.size <= MAX_TRACKED_CLIENTS) {
      return
    }

    for (const [client, timestamps] of this.failures) {
      if (this.recent(timestamps).length === 0) {
        this.failures.delete(client)
      }
    }
  }
}
