import { describe, expect, it } from "vitest"

import { assertPublicUrl, BlockedHostError, isPrivateAddress } from "./ssrf"

describe("isPrivateAddress", () => {
  it.each([
    ["169.254.169.254", "cloud metadata"],
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["0.0.0.0", "unspecified"],
    ["224.0.0.1", "multicast"],
    ["::1", "IPv6 loopback"],
    ["fd00::1", "IPv6 unique local"],
    ["fe80::1", "IPv6 link local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
  ])("blocks %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2606:4700::1"])(
    "allows the publicly routable %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    }
  )
})

describe("assertPublicUrl", () => {
  it("rejects a literal private address", async () => {
    await expect(
      assertPublicUrl("http://169.254.169.254/latest/meta-data/")
    ).rejects.toThrow(BlockedHostError)
  })

  it("rejects loopback by name, not just by address", async () => {
    // The check resolves the host, so a name pointing inward is caught too.
    await expect(assertPublicUrl("http://localhost:3000/api")).rejects.toThrow(
      BlockedHostError
    )
  })

  it.each(["file:///etc/passwd", "gopher://x/", "ftp://host/f"])(
    "rejects the non-http scheme %s",
    async (url) => {
      await expect(assertPublicUrl(url)).rejects.toThrow(BlockedHostError)
    }
  )

  it("rejects a malformed URL", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toThrow(BlockedHostError)
  })

  it("rejects a hostname that does not resolve", async () => {
    await expect(
      assertPublicUrl("https://this-host-does-not-exist.invalid/")
    ).rejects.toThrow(BlockedHostError)
  })
})
