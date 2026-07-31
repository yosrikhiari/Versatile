import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'
import type { GroundingService } from '../ontology/grounding'

export function createEntityGuard(grounding: GroundingService, enabled: boolean = true): GuardFunction {
  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const data = context.data as Record<string, unknown> | undefined
    if (!data) return []

    grounding.refresh()

    const extractNames = (obj: Record<string, unknown>): string[] => {
      const names: string[] = []

      if (typeof obj.characters === 'string') names.push(obj.characters)
      if (Array.isArray(obj.characters)) {
        for (const c of obj.characters) {
          if (typeof c === 'string') names.push(c)
          else if (c && typeof c === 'object' && 'name' in (c as object) && typeof (c as Record<string, unknown>).name === 'string') names.push((c as Record<string, unknown>).name as string)
        }
      }

      if (typeof obj.location === 'string') names.push(obj.location)
      if (typeof obj.setting === 'string') names.push(obj.setting)
      if (typeof obj.character_location === 'string') names.push(obj.character_location)
      if (typeof obj.plot_thread === 'string') names.push(obj.plot_thread)

      return names.filter(Boolean)
    }

    const names = extractNames(data)
    const unknownNames: string[] = []

    for (const name of names) {
      if (!grounding.isKnownEntityName(name)) {
        unknownNames.push(name)
      }
    }

    if (unknownNames.length > 0) {
      results.push({
        kind: 'entity',
        passed: false,
        severity: 'blocking',
        message: `Unknown entity name(s): ${unknownNames.join(', ')}`,
        details: { unknownNames, allNames: names },
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    return results
  }
}
