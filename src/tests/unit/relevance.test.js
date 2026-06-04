import { describe, it, expect } from 'vitest'
import { sortByRelevance } from '@/composables/generation/shaping/relevance'

describe('sortByRelevance', () => {
  it('sorts plotThread by timelineOrder ascending', () => {
    const entities = [
      { name: 'B', timelineOrder: 2 },
      { name: 'A', timelineOrder: 1 },
      { name: 'C', timelineOrder: 3 }
    ]
    const result = sortByRelevance(entities, 'plotThread')
    expect(result.map(e => e.name)).toEqual(['A', 'B', 'C'])
  })

  it('handles missing timelineOrder as 0', () => {
    const entities = [
      { name: 'A', timelineOrder: 5 },
      { name: 'B' }
    ]
    const result = sortByRelevance(entities, 'plotThread')
    expect(result.map(e => e.name)).toEqual(['B', 'A'])
  })

  it('sorts characters by lastEditedAt descending', () => {
    const entities = [
      { name: 'Old', lastEditedAt: 100 },
      { name: 'New', lastEditedAt: 200 }
    ]
    const result = sortByRelevance(entities, 'character')
    expect(result.map(e => e.name)).toEqual(['New', 'Old'])
  })

  it('sorts locations by lastEditedAt descending by default', () => {
    const entities = [
      { name: 'B', lastEditedAt: 50 },
      { name: 'A', lastEditedAt: 100 }
    ]
    const result = sortByRelevance(entities, 'location')
    expect(result.map(e => e.name)).toEqual(['A', 'B'])
  })

  it('does not mutate the original array', () => {
    const entities = [{ name: 'B', timelineOrder: 2 }, { name: 'A', timelineOrder: 1 }]
    const original = [...entities]
    sortByRelevance(entities, 'plotThread')
    expect(entities).toEqual(original)
  })

  it('handles empty array', () => {
    expect(sortByRelevance([], 'character')).toEqual([])
  })
})
