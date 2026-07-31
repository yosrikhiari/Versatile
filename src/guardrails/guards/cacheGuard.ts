import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Cache integrity: verifies a cache entry's key still binds to its payload,
 * that it hasn't outlived its TTL, and that a served entry matches the schema
 * the caller expects.
 *
 * The digest is a fast non-cryptographic hash (FNV-1a). It exists to detect
 * corruption and key/value mismatch, not to resist tampering — an attacker who
 * can write IndexedDB can rewrite the digest too.
 */
export function createCacheGuard(
  opts: {
    enabled?: boolean
    ttlMs?: number
    /** Clock injection point for tests. */
    now?: () => number
  } = {}
): GuardFunction {
  const { enabled = true, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = opts

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const data = context.data as Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') return []

    const results: GuardrailResult[] = []
    const push = (message: string, details: Record<string, unknown>): void => {
      results.push({
        kind: 'cache_integrity',
        passed: false,
        severity: 'blocking',
        message,
        details,
        layer: context.layer,
        contextId: context.cacheKey ?? context.sceneId,
        timestamp: Date.now(),
      })
    }

    const key = (context.cacheKey ?? data.key ?? data.cacheKey) as string | undefined
    const value = data.value ?? data.output ?? data.response

    // Key/value binding — an entry must carry the key it was stored under.
    if (key && typeof data.key === 'string' && data.key !== key) {
      push(`Cache entry key mismatch: entry is "${data.key}" but was looked up as "${key}"`, {
        entryKey: data.key,
        lookupKey: key,
      })
    }

    // Digest binding — recompute and compare when the entry carries one.
    const storedDigest = data.digest ?? data.hash
    if (typeof storedDigest === 'string' && value !== undefined) {
      const actual = digest(value)
      if (actual !== storedDigest) {
        push('Cache entry digest does not match its payload', {
          expected: storedDigest,
          actual,
          key,
        })
      }
    }

    // TTL freshness.
    const createdAt = firstNumber(data.createdAt, data.timestamp, data.storedAt)
    if (createdAt !== undefined) {
      const entryTtl = typeof data.ttlMs === 'number' ? data.ttlMs : ttlMs
      const age = now() - createdAt
      if (age > entryTtl) {
        push(`Cache entry is stale (age ${Math.round(age / 1000)}s exceeds TTL ${Math.round(entryTtl / 1000)}s)`, {
          ageMs: age,
          ttlMs: entryTtl,
          key,
        })
      }
    }

    // Schema match — a cached value served against a schema must still fit it.
    if (context.schema && value !== undefined) {
      const expectedType = (context.schema as { type?: string }).type
      if (expectedType && !matchesType(value, expectedType)) {
        push(`Cached value is ${describe(value)} but the caller expects ${expectedType}`, {
          expected: expectedType,
          actual: describe(value),
          key,
        })
      }
    }

    return results
  }
}

/** FNV-1a, 32-bit, hex encoded. Stable across runs and cheap enough for every cache write. */
export function digest(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    default:
      return true
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
