import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

/** International and NANP-style numbers, deliberately narrow to avoid matching years or IDs. */
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g

const API_KEYS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'OpenAI', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { label: 'Anthropic', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { label: 'Stripe', pattern: /\b[ps]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: 'GitHub', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { label: 'AWS', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: 'Google', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'Slack', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: 'Bearer token', pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g },
]

/**
 * Detects personal data and credentials leaking into generated prose.
 *
 * Emails and phone numbers are `detective` — fiction can legitimately contain
 * an invented address. Credentials are `blocking`: a real key in prose means
 * the model echoed something from its context, which must never be persisted.
 */
export function createPiiGuard(
  opts: {
    enabled?: boolean
    /** Fields to scan in addition to the defaults. */
    extraFields?: string[]
    /** Escalate email/phone hits to blocking. */
    strict?: boolean
  } = {}
): GuardFunction {
  const { enabled = true, extraFields = [], strict = false } = opts
  const fields = ['content', 'text', 'narrative', 'summary', 'response', 'message', 'analysis', ...extraFields]

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const texts = collectText(context.data, fields)
    if (texts.length === 0) return []

    const results: GuardrailResult[] = []
    const push = (
      message: string,
      details: Record<string, unknown>,
      severity: 'blocking' | 'detective'
    ): void => {
      results.push({
        kind: 'pii_leakage',
        passed: false,
        severity,
        message,
        details,
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    for (const text of texts) {
      const emails = matchAll(text, EMAIL)
      if (emails.length > 0) {
        push(`Output contains ${emails.length} email address(es)`, { matches: redactAll(emails) }, strict ? 'blocking' : 'detective')
      }

      const phones = matchAll(text, PHONE)
      if (phones.length > 0) {
        push(`Output contains ${phones.length} phone number(s)`, { matches: redactAll(phones) }, strict ? 'blocking' : 'detective')
      }

      for (const { label, pattern } of API_KEYS) {
        const keys = matchAll(text, pattern)
        if (keys.length > 0) {
          push(`Output contains what looks like a ${label} credential`, { provider: label, matches: redactAll(keys) }, 'blocking')
        }
      }
    }

    return results
  }
}

function collectText(data: unknown, fields: string[]): string[] {
  if (typeof data === 'string') return [data]
  if (!data || typeof data !== 'object') return []

  const obj = data as Record<string, unknown>
  const texts: string[] = []
  for (const field of fields) {
    if (typeof obj[field] === 'string') texts.push(obj[field] as string)
  }
  return texts
}

function matchAll(text: string, pattern: RegExp): string[] {
  // Patterns are module-level and carry /g, so lastIndex must be reset per use.
  pattern.lastIndex = 0
  return text.match(pattern) ?? []
}

/** Never echo a full secret into an event log — keep just enough to locate it. */
function redactAll(matches: string[]): string[] {
  return matches.slice(0, 5).map(m => (m.length <= 8 ? '***' : `${m.slice(0, 4)}…${m.slice(-2)}`))
}
