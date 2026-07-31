import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

/**
 * Fragments that mean the model echoed its own scaffolding into the prose
 * instead of writing. These are the unambiguous failures — unlike subject
 * matter, which in a fiction tool is the author's call.
 */
const PROMPT_LEAKAGE = [
  /\bas an AI (language )?model\b/i,
  /\bI (cannot|can't|won't) (fulfill|comply with|assist with) (that|this|your) request\b/i,
  /\byou are a (helpful|professional|skilled) (assistant|writer|novelist)\b/i,
  /\b(system|user|assistant)\s*:\s*(you are|write|respond)/i,
  /\bhere('s| is) (the|your) (rewritten|revised|generated) (scene|text|output)\b/i,
  /\b(output|respond|return) (only )?(valid )?JSON\b/i,
  /\bdo not (include|add) any (explanation|preamble|commentary)\b/i,
  /\b<\/?(system|instruction|context)>/i,
]

/** Markers that the model refused rather than produced prose. */
const REFUSAL = [
  /\bI'm sorry,? but I (can't|cannot)\b/i,
  /\bI'm (not able|unable) to (help|assist|continue) with\b/i,
]

/**
 * Content-safety guard for generated prose.
 *
 * Deliberately narrow by default: this is a fiction tool, where violence,
 * conflict and dark themes are legitimate craft. The guard ships with
 * prompt-leakage and refusal detection — failures that are unambiguous
 * regardless of genre — and takes a caller-supplied `blockedTerms` lexicon for
 * deployments that need topic restrictions. It does not ship a slur list;
 * that policy belongs to the deployment, not the library.
 */
export function createContentSafetyGuard(
  opts: {
    enabled?: boolean
    /** Deployment-specific lexicon. Matched case-insensitively on word boundaries. */
    blockedTerms?: string[]
    /** Escalate blocked-term hits from detective to blocking. */
    blockOnTerms?: boolean
    extraFields?: string[]
  } = {}
): GuardFunction {
  const { enabled = true, blockedTerms = [], blockOnTerms = false, extraFields = [] } = opts
  const fields = ['content', 'text', 'narrative', 'summary', 'response', 'message', 'analysis', ...extraFields]

  const termPatterns = blockedTerms.map(term => ({
    term,
    pattern: new RegExp(`\\b${escapeRegex(term)}\\b`, 'i'),
  }))

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
        kind: 'content_safety',
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
      for (const pattern of PROMPT_LEAKAGE) {
        const match = text.match(pattern)
        if (match) {
          push(`Output leaks prompt scaffolding: "${truncate(match[0])}"`, { match: match[0], pattern: pattern.source }, 'blocking')
        }
      }

      for (const pattern of REFUSAL) {
        const match = text.match(pattern)
        if (match) {
          push(`Output is a refusal, not prose: "${truncate(match[0])}"`, { match: match[0] }, 'blocking')
        }
      }

      const hits = termPatterns.filter(({ pattern }) => pattern.test(text)).map(({ term }) => term)
      if (hits.length > 0) {
        push(
          `Output contains ${hits.length} blocked term(s)`,
          { terms: hits },
          blockOnTerms ? 'blocking' : 'detective'
        )
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function truncate(s: string, max = 60): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`
}
