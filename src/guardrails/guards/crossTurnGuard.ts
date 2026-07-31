import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'
import type { GroundingService } from '../ontology/grounding'

const PRONOUN_SETS: Record<string, string[]> = {
  he: ['he', 'him', 'his', 'himself'],
  she: ['she', 'her', 'hers', 'herself'],
  they: ['they', 'them', 'their', 'theirs', 'themselves'],
  it: ['it', 'its', 'itself'],
}

/**
 * Cross-turn consistency: catches an entity being referred to by a different
 * name than the one used in earlier turns, and pronouns that contradict a
 * character's recorded set.
 *
 * Detective only — an alias shift is often intentional (a character revealing
 * a true name), so this surfaces rather than blocks.
 */
export function createCrossTurnGuard(
  grounding: GroundingService,
  opts: {
    enabled?: boolean
    /** Pronouns declared per canonical entity name, e.g. `{ 'sarah chen': 'she' }`. */
    getPronouns?: () => Record<string, string>
  } = {}
): GuardFunction {
  const { enabled = true, getPronouns } = opts

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const text = extractText(context.data)
    if (!text) return results

    grounding.refresh()

    const priorText = (context.priorTurns ?? [])
      .map(turn => extractText(turn))
      .filter((t): t is string => Boolean(t))
      .join('\n')

    // Alias drift: an entity named one way now, a different way before.
    if (priorText) {
      const drifted: Array<{ entity: string; previously: string; now: string }> = []
      const current = surfaceFormsByEntity(text, grounding)
      const prior = surfaceFormsByEntity(priorText, grounding)

      for (const [entityId, surface] of current) {
        const previously = prior.get(entityId)
        if (previously && previously !== surface) {
          drifted.push({
            entity: grounding.getEntity(entityId)?.name ?? entityId,
            previously,
            now: surface,
          })
        }
      }

      if (drifted.length > 0) {
        results.push({
          kind: 'cross_turn_consistency',
          passed: false,
          severity: 'detective',
          message: `${drifted.length} entity reference(s) changed name across turns`,
          details: { drifted },
          layer: context.layer,
          contextId: context.sceneId,
          timestamp: Date.now(),
        })
      }
    }

    // Pronoun consistency against declared character pronouns.
    const declared = getPronouns?.() ?? {}
    const conflicts: Array<{ entity: string; expected: string; found: string }> = []

    for (const [entityName, pronoun] of Object.entries(declared)) {
      const expectedSet = PRONOUN_SETS[pronoun.toLowerCase()]
      if (!expectedSet) continue

      const sentences = text.split(/(?<=[.!?])\s+/)
      for (const sentence of sentences) {
        if (!new RegExp(`\\b${escapeRegex(entityName)}\\b`, 'i').test(sentence)) continue

        for (const [setName, forms] of Object.entries(PRONOUN_SETS)) {
          if (setName === pronoun.toLowerCase()) continue
          // `they`/`it` overlap too often with unrelated referents to flag safely.
          if (setName === 'they' || setName === 'it') continue

          const found = forms.find(f => new RegExp(`\\b${f}\\b`, 'i').test(sentence))
          if (found && !expectedSet.some(e => new RegExp(`\\b${e}\\b`, 'i').test(sentence))) {
            conflicts.push({ entity: entityName, expected: pronoun, found })
            break
          }
        }
      }
    }

    if (conflicts.length > 0) {
      results.push({
        kind: 'cross_turn_consistency',
        passed: false,
        severity: 'detective',
        message: `${conflicts.length} pronoun mismatch(es) against declared character pronouns`,
        details: { conflicts },
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    return results
  }
}

/**
 * The surface form each entity appears under in `text`, keyed by entity id.
 *
 * Only the *longest* match per entity is kept. Short aliases are usually
 * substrings of the full name ("Chen" inside "Sarah Chen"), so counting every
 * match would make a single consistent mention look like it drifted from itself.
 */
function surfaceFormsByEntity(text: string, grounding: GroundingService): Map<string, string> {
  const best = new Map<string, string>()

  for (const name of grounding.allKnownNames()) {
    if (name.length < 2) continue
    if (!new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(text)) continue

    const entityId = grounding.findEntityByName(name)
    if (!entityId) continue

    const existing = best.get(entityId)
    if (!existing || name.length > existing.length) {
      best.set(entityId, name)
    }
  }

  return best
}

function extractText(data: unknown): string | null {
  if (typeof data === 'string') return data
  if (!data || typeof data !== 'object') return null

  const obj = data as Record<string, unknown>
  for (const field of ['content', 'text', 'narrative', 'response', 'message']) {
    if (typeof obj[field] === 'string') return obj[field] as string
  }
  return null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
