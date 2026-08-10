import type { HttpRequestOptions } from "../http/fetch"
import type { SourceFetchContext } from "./types"

/**
 * The request options every source adapter uses.
 *
 * `blockPrivateHosts` is the point of having this in one place: source URLs are
 * the only outbound targets an operator types in, so they are the only ones
 * that can be aimed at the deployment's own network. The fixed hosts we ship —
 * Telegram, OpenRouter — need no such guard and do not pay for the DNS lookup.
 */
export function requestOptions(
  context: SourceFetchContext
): HttpRequestOptions {
  return {
    blockPrivateHosts: true,
    ...(context.proxyUrl ? { proxyUrl: context.proxyUrl } : {}),
    ...(context.signal ? { signal: context.signal } : {}),
  }
}
