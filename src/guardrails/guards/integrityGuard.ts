import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'
import type { GroundingService } from '../ontology/grounding'

/**
 * Storage and sync integrity: required fields present, no orphaned rows.
 *
 * Required fields are per-call, supplied via `context.metadata.requiredFields`.
 * The constructor default only applies when a caller supplies none — an insert
 * has no `id` yet, so holding every write to a fixed `['id', 'name']` would
 * flag every row the app has ever created.
 */
export function createIntegrityGuard(
  grounding: GroundingService,
  opts: {
    enabled?: boolean
    checkRequiredFields?: string[]
  } = {}
): GuardFunction {
  const { enabled = true, checkRequiredFields = ['id', 'name'] } = opts

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const data = context.data as Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') return []

    const meta = (context.metadata ?? {}) as {
      requiredFields?: string[]
      parentKeys?: string[]
      entityType?: string
      table?: string
    }

    const required = meta.requiredFields ?? checkRequiredFields
    const parentKeys = meta.parentKeys ?? []
    const label = meta.table ?? meta.entityType ?? String(data.type ?? 'row')

    const results: GuardrailResult[] = []
    const fail = (message: string, details: Record<string, unknown>): void => {
      results.push({
        kind: 'integrity',
        passed: false,
        severity: 'blocking',
        message,
        details: { table: label, ...details },
        layer: context.layer,
        contextId: context.sceneId,
        timestamp: Date.now(),
      })
    }

    const missing = required.filter(f => isEmpty(data[f]))
    if (missing.length > 0) {
      fail(`${label} is missing required field(s): ${missing.join(', ')}`, {
        missingFields: missing,
      })
    }

    // Orphan check: a project-scoped row with no parent key is unreachable —
    // it will never appear in any project query and cannot be cleaned up.
    const orphaned = parentKeys.filter(k => isEmpty(data[k]))
    if (orphaned.length > 0) {
      fail(`${label} would be orphaned — missing parent reference(s): ${orphaned.join(', ')}`, {
        missingParents: orphaned,
      })
    }

    // Named entities are checked against the ontology so a write cannot
    // introduce a name the rest of the system does not know about.
    if (meta.entityType && typeof data.name === 'string' && data.name) {
      grounding.refresh()
      const snapshot = grounding.getSnapshot()
      // Only meaningful once the ontology has been populated; an empty snapshot
      // means the bible has not loaded, not that every name is invalid.
      if (snapshot.entities.size > 0 && !grounding.isKnownEntityName(data.name)) {
        results.push({
          kind: 'integrity',
          passed: false,
          severity: 'detective',
          message: `${label} "${data.name}" is not in the ontology yet`,
          details: { table: label, name: data.name },
          layer: context.layer,
          contextId: context.sceneId,
          timestamp: Date.now(),
        })
      }
    }

    return results
  }
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}
