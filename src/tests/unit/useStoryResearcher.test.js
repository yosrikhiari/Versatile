import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/dbService', () => ({
  getCharacters: vi.fn(),
  getLocations: vi.fn(),
  getPlotThreads: vi.fn(),
  getAuthorProfile: vi.fn()
}))

let filterRelevant
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useStoryResearcher')
  filterRelevant = mod.filterRelevant
})

describe('filterRelevant', () => {
  const entities = [
    { name: 'John', description: 'A brave warrior with a sword', goal: 'Save the kingdom' },
    { name: 'Jane', description: 'A clever mage', goal: 'Find the lost spell' }
  ]

  it('returns empty for empty/null input', () => {
    expect(filterRelevant(null, 'test', true)).toEqual([])
    expect(filterRelevant([], 'test', true)).toEqual([])
  })

  it('returns all entities (up to MAX) when not short term', () => {
    const result = filterRelevant(entities, '', false)
    expect(result).toHaveLength(2)
  })

  it('filters and scores entities by keyword relevance', () => {
    const result = filterRelevant(entities, 'brave warrior', true)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('John')
  })

  it('returns empty when no entities match keywords', () => {
    const result = filterRelevant(entities, 'quantum physics', true)
    expect(result).toEqual([])
  })

  it('only considers keywords longer than 2 chars', () => {
    const result = filterRelevant(entities, 'a brave ox', true)
    expect(result).toHaveLength(1)
  })
})
