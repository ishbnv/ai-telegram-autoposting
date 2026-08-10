import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * Guards outbound requests whose target an operator can type in — source URLs.
 *
 * Those requests originate inside the deployment's network, so without a check
 * a source pointed at `http://169.254.169.254/` or `http://127.0.0.1:3000/`
 * turns the worker into a way to reach things the internet cannot. The panel is
 * single-admin, so this is not privilege escalation; it is blast radius, and it
 * is what keeps one leaked password from becoming a pivot onto the host.
 */

export class BlockedHostError extends Error {
  override readonly name = "BlockedHostError"

  constructor(
    readonly url: string,
    reason: string
  ) {
    super(`Refusing to fetch ${url}: ${reason}`)
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number)
  const [a = 0, b = 0] = parts

  return (
    a === 0 || // unspecified
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, and cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  )
}

function isPrivateIPv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0] ?? ""

  if (value === "::" || value === "::1") {
    return true
  }

  // IPv4-mapped (::ffff:127.0.0.1) would otherwise sneak past as IPv6.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)
  if (mapped?.[1]) {
    return isPrivateIPv4(mapped[1])
  }

  return (
    value.startsWith("fc") || // unique local
    value.startsWith("fd") ||
    value.startsWith("fe8") || // link local
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff") // multicast
  )
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)

  if (version === 4) {
    return isPrivateIPv4(address)
  }
  if (version === 6) {
    return isPrivateIPv6(address)
  }

  return false
}

/**
 * Rejects anything that is not plain http(s) to a publicly routable address.
 *
 * The hostname is resolved rather than pattern-matched, because a name an
 * attacker controls can point wherever they like — checking the string would be
 * theatre. This still cannot close the DNS-rebinding window between our lookup
 * and undici's; that would need a pinned-IP dispatcher, and the note stays here
 * so nobody assumes otherwise.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new BlockedHostError(rawUrl, "not a valid URL")
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BlockedHostError(
      rawUrl,
      `protocol ${url.protocol} is not allowed`
    )
  }

  const host = url.hostname.replace(/^\[|\]$/g, "")

  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new BlockedHostError(rawUrl, `${host} is not publicly routable`)
    }
    return
  }

  let resolved: { address: string }[]
  try {
    resolved = await lookup(host, { all: true })
  } catch {
    throw new BlockedHostError(rawUrl, `cannot resolve ${host}`)
  }

  const blocked = resolved.find((entry) => isPrivateAddress(entry.address))
  if (blocked) {
    throw new BlockedHostError(
      rawUrl,
      `${host} resolves to ${blocked.address}, which is not publicly routable`
    )
  }
}
