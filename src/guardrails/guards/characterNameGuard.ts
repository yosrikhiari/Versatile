import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

const ROLE_TITLE_PATTERNS: RegExp[] = [
  /^the\s+\w+$/i,
  /^\w+\s+who\s+/i,
  /^(a|an)\s+/i,
  /^(betrayer|antagonist|mentor|protagonist|villain|hero|sidekick|detective|spy|assassin|guardian|traitor|rival|ally|foe|friend|enemy|leader|follower|master|student|teacher|parent|child|sibling|lover|partner|stranger|outsider|insider|insider|traitor|mole|double\s+agent|secret\s+agent|undercover|informant|snitch|rat)$/i,
  /^[A-Z][a-z]+\s+[A-Z][a-z]+\s+(who|that|which)\b/i,
]

const COMMON_TITLES = new Set([
  'the betrayer',
  'the mentor',
  'the villain',
  'the hero',
  'the protagonist',
  'the antagonist',
  'the rival',
  'the sidekick',
  'the detective',
  'the spy',
  'the assassin',
  'the guardian',
  'the traitor',
  'the mole',
  'the informant',
])

function isProperName(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed.length < 2) return false

  const lower = trimmed.toLowerCase()
  if (COMMON_TITLES.has(lower)) return false

  for (const pattern of ROLE_TITLE_PATTERNS) {
    if (pattern.test(trimmed)) return false
  }

  const words = trimmed.split(/\s+/).filter(w => w.length > 0)
  if (words.length < 2) return false

  if (!words.every(w => /^[A-Z][a-z'-]+$/.test(w))) return false

  return true
}

export function createCharacterNameGuard(enabled: boolean = true): GuardFunction {
  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const data = context.data as Record<string, unknown> | undefined
    if (!data) return []

    const name = data.name
    if (typeof name !== 'string') return results

    if (!isProperName(name)) {
      results.push({
        kind: 'character_name',
        passed: false,
        severity: 'detective',
        message: `Character name "${name}" appears to be a role title or description, not a proper personal name`,
        details: { name, suggestion: 'Use a proper name like "Marcus Vane" or "Elara Thorne". Put the narrative role in the "role" field.' },
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    return results
  }
}