import { GuardrailRegistry } from '../registry'
import { getGuardrailEnforcement, GuardrailBlockedError } from './aiGuardrails'
import type { GuardrailRunResult } from '../types'

const NOOP: GuardrailRunResult = {
  passed: true,
  results: [],
  blocking: [],
  detective: [],
  skipped: [],
  durationMs: 0,
}

/**
 * Per-table integrity contract.
 *
 * `required` are fields a row cannot be written without. `parents` are the
 * foreign keys whose absence would orphan the row. Neither list includes `id`:
 * inserts are auto-incremented and have no id until Dexie assigns one.
 */
export interface TableContract {
  required: string[]
  parents: string[]
  /** Set for rows the ontology tracks, so names can be cross-checked. */
  entityType?: string
}

export const TABLE_CONTRACTS: Record<string, TableContract> = {
  characters: { required: ['name'], parents: ['projectId'], entityType: 'character' },
  locations: { required: ['name'], parents: ['projectId'], entityType: 'location' },
  plotThreads: { required: ['title'], parents: ['projectId'] },
  characterRelationships: { required: [], parents: ['projectId'] },
  subsections: { required: [], parents: ['projectId'] },
  evalResults: { required: ['evalType'], parents: ['projectId'] },
  projectBlurbs: { required: [], parents: ['projectId'] },
  graphEdges: { required: [], parents: ['projectId'] },
}

/**
 * Validate a row before it is written.
 *
 * Synchronous and non-throwing under the default `detective` enforcement, so a
 * DB write path gains no await boundary and no new failure mode. Under
 * `blocking` enforcement a failing row throws `GuardrailBlockedError`.
 */
export function guardStorageWrite(
  table: string,
  row: unknown,
  extra: { parentValues?: Record<string, unknown>; entryPoint?: string } = {}
): GuardrailRunResult {
  if (getGuardrailEnforcement() === 'off') return NOOP

  const contract = TABLE_CONTRACTS[table]
  if (!contract) return NOOP

  // Parent keys often live in the function argument rather than the row body
  // (`addCharacter(projectId, data)`), so callers merge them in for the check.
  const data =
    row && typeof row === 'object'
      ? { ...(extra.parentValues ?? {}), ...(row as Record<string, unknown>) }
      : row

  const result = GuardrailRegistry.runSync({
    layer: 'storage_write',
    kinds: ['integrity'],
    data,
    entryPoint: extra.entryPoint ?? `db.${table}.write`,
    metadata: {
      table,
      requiredFields: contract.required,
      parentKeys: contract.parents,
      entityType: contract.entityType,
    },
  })

  if (getGuardrailEnforcement() === 'blocking' && result.blocking.length > 0) {
    throw new GuardrailBlockedError(result.blocking)
  }
  return result
}

/** Batch variant — validates each row and merges the results. */
export function guardStorageWriteBatch(
  table: string,
  rows: unknown[],
  extra: { parentValues?: Record<string, unknown>; entryPoint?: string } = {}
): GuardrailRunResult {
  if (getGuardrailEnforcement() === 'off' || !Array.isArray(rows)) return NOOP

  const merged: GuardrailRunResult = {
    passed: true,
    results: [],
    blocking: [],
    detective: [],
    skipped: [],
    durationMs: 0,
  }

  for (const row of rows) {
    const one = guardStorageWrite(table, row, extra)
    merged.results.push(...one.results)
    merged.blocking.push(...one.blocking)
    merged.detective.push(...one.detective)
    merged.durationMs += one.durationMs
  }

  merged.passed = merged.blocking.length === 0
  return merged
}

/**
 * Validate a batch of rows queued for push to PostgreSQL.
 *
 * Never throws, regardless of enforcement: a sync push runs in the background
 * on a timer, and aborting it would strand local changes with no user-visible
 * cause. Failures are reported to the guardrail feed instead.
 */
export function guardSyncPush(
  table: string,
  rows: unknown[],
  extra: { entryPoint?: string } = {}
): GuardrailRunResult {
  if (getGuardrailEnforcement() === 'off' || !Array.isArray(rows) || rows.length === 0) {
    return NOOP
  }

  const contract = TABLE_CONTRACTS[table]
  if (!contract) return NOOP

  const merged: GuardrailRunResult = {
    passed: true,
    results: [],
    blocking: [],
    detective: [],
    skipped: [],
    durationMs: 0,
  }

  for (const row of rows) {
    const one = GuardrailRegistry.runSync({
      layer: 'sync',
      kinds: ['integrity'],
      data: row,
      entryPoint: extra.entryPoint ?? `sync.push.${table}`,
      metadata: {
        table,
        // A row being pushed has already been persisted, so it must carry its id.
        requiredFields: [...contract.required, 'id'],
        parentKeys: contract.parents,
      },
    })
    merged.results.push(...one.results)
    merged.blocking.push(...one.blocking)
    merged.detective.push(...one.detective)
    merged.durationMs += one.durationMs
  }

  merged.passed = merged.blocking.length === 0
  return merged
}
