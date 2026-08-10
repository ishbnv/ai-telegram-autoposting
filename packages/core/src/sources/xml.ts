/**
 * fast-xml-parser hands back loosely shaped objects: a tag is a string, an
 * object with `#text`, or an array when it repeats. These helpers narrow that
 * without spraying `any` through the adapters.
 */

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function asText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined
  }

  if (typeof value === "number") {
    return String(value)
  }

  const inner = asRecord(value)?.["#text"]
  if (typeof inner === "string") {
    return inner.trim() || undefined
  }
  if (typeof inner === "number") {
    return String(inner)
  }

  return undefined
}

export function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

export function attribute(value: unknown, name: string): string | undefined {
  const attr = asRecord(value)?.[`@_${name}`]
  return typeof attr === "string" ? attr : undefined
}
