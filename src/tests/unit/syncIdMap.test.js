import { describe, it, expect } from 'vitest'
import { SyncIdMap } from '../../services/sync-id-map'

function makeMap() {
  return new SyncIdMap({}, [{ table: 'characters' }])
}

describe('SyncIdMap mappings', () => {
  it('round-trips local and server ids and removes them', () => {
    const map = makeMap()
    map.setMapping('characters', 'c1', 'api-1')

    expect(map.getApiId('characters', 'c1')).toBe('api-1')
    expect(map.getLocalId('characters', 'api-1')).toBe('c1')

    map.removeMapping('characters', 'c1', 'api-1')

    expect(map.getApiId('characters', 'c1')).toBeNull()
    expect(map.getLocalId('characters', 'api-1')).toBeNull()
  })
})

describe('SyncIdMap delete suppression', () => {
  it('is a one-shot flag consumed by the deleting hook', () => {
    const map = makeMap()

    expect(map.consumeSuppressedDelete('characters', 'c1')).toBe(false)

    map.suppressNextDelete('characters', 'c1')
    expect(map.consumeSuppressedDelete('characters', 'c1')).toBe(true)
    // Second consume finds nothing: a later user delete still queues.
    expect(map.consumeSuppressedDelete('characters', 'c1')).toBe(false)
  })

  it('is scoped per table and row', () => {
    const map = makeMap()
    map.suppressNextDelete('characters', 'c1')

    expect(map.consumeSuppressedDelete('sections', 'c1')).toBe(false)
    expect(map.consumeSuppressedDelete('characters', 'c2')).toBe(false)
    expect(map.consumeSuppressedDelete('characters', 'c1')).toBe(true)
  })
})
