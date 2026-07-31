import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GuardrailRegistry } from '../../guardrails/registry'
import { installGuardrails } from '../../guardrails/setup'
import { buildOntologySnapshot } from '../../guardrails/ontology/instantiate'
import {
  guardStorageWrite,
  guardStorageWriteBatch,
  guardSyncPush,
  TABLE_CONTRACTS
} from '../../guardrails/integration/storageGuardrails'
import {
  setGuardrailEnforcement,
  GuardrailBlockedError
} from '../../guardrails/integration/aiGuardrails'

function install({ characters = [] } = {}) {
  GuardrailRegistry.clear()
  installGuardrails({
    buildSnapshot: () =>
      buildOntologySnapshot({
        getCharacters: () => characters,
        getLocations: () => [],
        getPlotThreads: () => [],
        getScenes: () => [],
        getRelationships: () => []
      })
  })
}

describe('storage integrity guardrails', () => {
  beforeEach(() => {
    install()
    setGuardrailEnforcement('detective')
  })

  afterEach(() => {
    setGuardrailEnforcement('detective')
    GuardrailRegistry.clear()
  })

  it('accepts an insert that satisfies its table contract', () => {
    const run = guardStorageWrite(
      'characters',
      { name: 'Sarah Chen' },
      {
        parentValues: { projectId: 1 }
      }
    )
    expect(run.passed).toBe(true)
  })

  it('does not require an id on insert', () => {
    // Regression: the guard used to default to ['id', 'name'], which flagged
    // every auto-incremented insert the app had ever made.
    const run = guardStorageWrite(
      'characters',
      { name: 'Sarah Chen' },
      {
        parentValues: { projectId: 1 }
      }
    )
    expect(run.blocking).toHaveLength(0)
  })

  it('flags a row missing a required field', () => {
    const run = guardStorageWrite(
      'characters',
      { role: 'protagonist' },
      {
        parentValues: { projectId: 1 }
      }
    )
    expect(run.blocking).toHaveLength(1)
    expect(run.blocking[0].message).toContain('missing required field')
  })

  it('flags a row that would be orphaned', () => {
    const run = guardStorageWrite(
      'characters',
      { name: 'Sarah Chen' },
      {
        parentValues: { projectId: undefined }
      }
    )
    expect(run.blocking.some((r) => r.message.includes('orphaned'))).toBe(true)
  })

  it('reads the parent key off the row when not passed separately', () => {
    const run = guardStorageWrite('characters', { name: 'Sarah Chen', projectId: 7 })
    expect(run.passed).toBe(true)
  })

  it('uses the per-table contract — plotThreads require title, not name', () => {
    expect(TABLE_CONTRACTS.plotThreads.required).toEqual(['title'])

    const bad = guardStorageWrite(
      'plotThreads',
      { name: 'wrong field' },
      {
        parentValues: { projectId: 1 }
      }
    )
    const good = guardStorageWrite(
      'plotThreads',
      { title: 'The Crown Quest' },
      {
        parentValues: { projectId: 1 }
      }
    )

    expect(bad.blocking).toHaveLength(1)
    expect(good.passed).toBe(true)
  })

  it('is a no-op for a table with no contract', () => {
    const run = guardStorageWrite('someUntrackedTable', {})
    expect(run.results).toEqual([])
  })

  it('validates every row in a batch', () => {
    const run = guardStorageWriteBatch(
      'characters',
      [{ name: 'A' }, { role: 'no name' }, { name: 'C' }],
      { parentValues: { projectId: 1 } }
    )
    expect(run.blocking).toHaveLength(1)
    expect(run.passed).toBe(false)
  })

  it('throws under blocking enforcement', () => {
    setGuardrailEnforcement('blocking')
    expect(() => guardStorageWrite('characters', {}, { parentValues: { projectId: 1 } })).toThrow(
      GuardrailBlockedError
    )
  })

  it('does nothing when enforcement is off', () => {
    setGuardrailEnforcement('off')
    const run = guardStorageWrite('characters', {})
    expect(run.results).toEqual([])
  })

  it('reports a name absent from a populated ontology as detective, not blocking', () => {
    install({ characters: [{ id: '1', name: 'Sarah Chen' }] })

    const run = guardStorageWrite(
      'characters',
      { name: 'Brand New Person' },
      {
        parentValues: { projectId: 1 }
      }
    )

    // Creating a character is exactly how a name enters the ontology, so this
    // must never block — it is a notice, not an error.
    expect(run.passed).toBe(true)
    expect(run.detective.some((r) => r.message.includes('not in the ontology'))).toBe(true)
  })

  it('stays silent about unknown names while the ontology is empty', () => {
    const run = guardStorageWrite(
      'characters',
      { name: 'Anyone' },
      {
        parentValues: { projectId: 1 }
      }
    )
    expect(run.detective).toHaveLength(0)
  })
})

describe('sync integrity guardrails', () => {
  beforeEach(() => {
    install()
    setGuardrailEnforcement('detective')
  })

  afterEach(() => {
    setGuardrailEnforcement('detective')
    GuardrailRegistry.clear()
  })

  it('requires an id on push — a pushed row has already been persisted', () => {
    const run = guardSyncPush('characters', [{ name: 'Sarah Chen', projectId: 1 }])
    expect(run.blocking.some((r) => r.message.includes('id'))).toBe(true)
  })

  it('accepts a fully-formed pending row', () => {
    const run = guardSyncPush('characters', [{ id: 4, name: 'Sarah Chen', projectId: 1 }])
    expect(run.passed).toBe(true)
  })

  it('never throws, even under blocking enforcement', () => {
    setGuardrailEnforcement('blocking')
    // Sync runs on a background timer; throwing would strand local changes
    // with no user-visible cause.
    expect(() => guardSyncPush('characters', [{}])).not.toThrow()
  })

  it('is a no-op for an empty push', () => {
    expect(guardSyncPush('characters', []).results).toEqual([])
  })
})
