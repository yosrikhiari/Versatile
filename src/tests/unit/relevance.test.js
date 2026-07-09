import { describe, it, expect } from 'vitest'
import { sortByRelevance } from '../../composables/generation/shaping/relevance'

describe('sortByRelevance', () => {
  it('sorts characters by lastEditedAt descending', () => {
    const entities = [
      { name: 'old', lastEditedAt: 100 },
      { name: 'new', lastEditedAt: 300 },
      { name: 'mid', lastEditedAt: 200 }
    ]
    const sorted = sortByRelevance(entities, 'character')
    expect(sorted.map((e) => e.name)).toEqual(['new', 'mid', 'old'])
  })

  it('sorts plotThreads by timelineOrder ascending', () => {
    const entities = [
      { title: 'b', timelineOrder: 10 },
      { title: 'c', timelineOrder: 30 },
      { title: 'a', timelineOrder: 5 }
    ]
    const sorted = sortByRelevance(entities, 'plotThread')
    expect(sorted.map((e) => e.title)).toEqual(['a', 'b', 'c'])
  })

  it('defaults to lastEditedAt descending for unknown type', () => {
    const entities = [
      { name: 'old', lastEditedAt: 100 },
      { name: 'new', lastEditedAt: 300 }
    ]
    const sorted = sortByRelevance(entities, 'unknown')
    expect(sorted.map((e) => e.name)).toEqual(['new', 'old'])
  })

  it('handles missing sort fields', () => {
    const entities = [{ name: 'a' }, { name: 'b', lastEditedAt: 100 }]
    const sorted = sortByRelevance(entities, 'character')
    expect(sorted).toHaveLength(2)
  })
})
