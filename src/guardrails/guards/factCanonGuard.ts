import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'
import type { GroundingService } from '../ontology/grounding'

export function createFactCanonGuard(
  grounding: GroundingService,
  opts: {
    enabled?: boolean
    getFactLedger?: () => string[]
  } = {}
): GuardFunction {
  const { enabled = true, getFactLedger } = opts

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []
    if (!getFactLedger) return []

    const results: GuardrailResult[] = []
    const data = context.data as Record<string, unknown> | undefined
    if (!data) return []

    grounding.refresh()

    const newFacts: string[] = []
    if (Array.isArray(data.keyFacts)) {
      newFacts.push(...data.keyFacts.filter((f): f is string => typeof f === 'string'))
    }
    if (Array.isArray(data.facts)) {
      newFacts.push(...data.facts.filter((f): f is string => typeof f === 'string'))
    }

    if (newFacts.length === 0) return results

    const existingFacts = getFactLedger()
    const contradictions: string[] = []

    for (const fact of newFacts) {
      const factLower = fact.toLowerCase()
      for (const existing of existingFacts) {
        const existingLower = existing.toLowerCase()
        const negated = detectNegation(factLower, existingLower)
        if (negated) {
          contradictions.push(`New: "${fact}" contradicts existing: "${existing}"`)
        }
      }
    }

    if (contradictions.length > 0) {
      results.push({
        kind: 'fact_canon',
        passed: false,
        severity: 'detective',
        message: `Found ${contradictions.length} fact contradiction(s)`,
        details: { contradictions, newFacts },
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    return results
  }
}

function detectNegation(a: string, b: string): boolean {
  const negations = ['not ', "n't", 'never ', 'no ']
  const aWords = new Set(a.split(/\s+/))
  const bWords = new Set(b.split(/\s+/))

  const hasNegation = (s: Set<string>) => {
    for (const n of negations) {
      for (const w of s) {
        if (w.startsWith(n) || w.endsWith(n.trim())) return true
      }
    }
    return false
  }

  const sharedVerbs = ['is', 'was', 'has', 'had', 'does', 'did', 'will', 'can', 'must', 'lives', 'knows', 'wants', 'goes', 'killed', 'saved', 'found', 'lost', 'took', 'gave', 'said', 'went', 'came', 'left', 'met', 'saw', 'heard', 'felt', 'thought', 'believed']

  if (hasNegation(aWords) !== hasNegation(bWords)) {
    const shared = new Set([...aWords].filter(w => sharedVerbs.includes(w) || bWords.has(w)))
    shared.delete('not')
    shared.delete('no')
    const sharedSignificant = [...shared].filter(w => w.length > 2)
    if (sharedSignificant.length >= 2) {
      return true
    }
  }

  return false
}
