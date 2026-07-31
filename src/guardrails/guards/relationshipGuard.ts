import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'
import type { GroundingService } from '../ontology/grounding'

export function createRelationshipGuard(grounding: GroundingService, enabled: boolean = true): GuardFunction {
  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const data = context.data as Record<string, unknown> | undefined
    if (!data) return []

    grounding.refresh()

    const extractRelationships = (obj: Record<string, unknown>): Array<[string, string]> => {
      const pairs: Array<[string, string]> = []

      if (Array.isArray(obj.relationships)) {
        for (const rel of obj.relationships) {
          if (rel && typeof rel === 'object') {
            const src = (rel as Record<string, unknown>).source ?? (rel as Record<string, unknown>).character
            const tgt = (rel as Record<string, unknown>).target ?? (rel as Record<string, unknown>).other
            if (src && tgt && typeof src === 'string' && typeof tgt === 'string') {
              pairs.push([src, tgt])
            }
          }
        }
      }


      if (typeof obj.character === 'string' && typeof obj.relationship_to === 'string') {
        pairs.push([obj.character, obj.relationship_to])
      }
      if (Array.isArray(obj.interacting_characters) && obj.interacting_characters.length >= 2) {
        for (let i = 0; i < obj.interacting_characters.length - 1; i++) {
          for (let j = i + 1; j < obj.interacting_characters.length; j++) {
            const a = obj.interacting_characters[i]
            const b = obj.interacting_characters[j]
            if (typeof a === 'string' && typeof b === 'string') {
              pairs.push([a, b])
            }
          }
        }
      }

      return pairs
    }

    const pairs = extractRelationships(data)
    const unknownPairs: Array<[string, string]> = []

    for (const [src, tgt] of pairs) {
      const srcId = grounding.findEntityByName(src)
      const tgtId = grounding.findEntityByName(tgt)
      if (!srcId || !tgtId) {
        unknownPairs.push([src, tgt])
        continue
      }

      const rels = grounding.getRelationshipsForEntity(srcId)
      const hasRelationship = rels.some(r => r && (r.targetId === tgtId || r.sourceId === tgtId))
      if (!hasRelationship) {
        unknownPairs.push([src, tgt])
      }
    }

    if (unknownPairs.length > 0) {
      results.push({
        kind: 'relationship',
        passed: false,
        severity: 'blocking',
        message: `Unknown relationship(s): ${unknownPairs.map(([s, t]) => `${s} ↔ ${t}`).join(', ')}`,
        details: { unknownPairs },
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    return results
  }
}
