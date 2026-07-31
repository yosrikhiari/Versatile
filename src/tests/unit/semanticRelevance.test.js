import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deterministic stand-in for the embedding service: each text maps to a vector
// whose direction is driven by which marker words it contains.
const MARKERS = ['garden', 'fountain', 'ship', 'desert']

function fakeVector(text) {
  const lower = (text || '').toLowerCase()
  const v = MARKERS.map((m) => (lower.includes(m) ? 1 : 0))
  // Non-zero floor so cosine similarity is defined for texts with no marker.
  return v.some(Boolean) ? v : [0.01, 0.01, 0.01, 0.01]
}

let embeddingsAvailable = true

vi.mock('../../services/embeddingService', () => ({
  getEmbeddings: async (texts) => {
    if (!embeddingsAvailable) throw new Error('embeddings offline')
    return { vectors: texts.map(fakeVector), provider: 'test', model: 'test' }
  }
}))

const { buildRelevanceIndex } =
  await import('../../composables/generation/shaping/semanticRelevance')
const { sortByRelevance } = await import('../../composables/generation/shaping/relevance')

const GARDEN_QUERY =
  'The garden stretched out behind the estate, dew heavy on the grass near the stone fountain.'

describe('buildRelevanceIndex', () => {
  beforeEach(() => {
    embeddingsAvailable = true
  })

  it('scores entities by closeness to the query', async () => {
    const index = await buildRelevanceIndex({
      query: GARDEN_QUERY,
      entities: {
        locations: [
          { id: '1', name: 'Rosethorn Garden', description: 'a garden with a fountain' },
          { id: '2', name: 'The Desert Road', description: 'a desert crossing' }
        ]
      }
    })

    expect(index).not.toBeNull()
    const near = index.scoreFor({ id: '1' }, 'location')
    const far = index.scoreFor({ id: '2' }, 'location')
    expect(near).toBeGreaterThan(far)
  })

  it('returns null when the query is too short to carry signal', async () => {
    const index = await buildRelevanceIndex({
      query: 'garden',
      entities: { locations: [{ id: '1', name: 'Rosethorn Garden' }] }
    })
    expect(index).toBeNull()
  })

  it('returns null when embeddings are unavailable', async () => {
    embeddingsAvailable = false
    const index = await buildRelevanceIndex({
      query: GARDEN_QUERY,
      entities: { locations: [{ id: '1', name: 'Rosethorn Garden with a fountain' }] }
    })
    expect(index).toBeNull()
  })

  it('returns null when every entity scores the same', async () => {
    // Uniform similarity carries no ranking information — ordering by noise
    // would be worse than the recency heuristic it replaces.
    const index = await buildRelevanceIndex({
      query: GARDEN_QUERY,
      entities: {
        locations: [
          { id: '1', name: 'Alpha', description: 'garden fountain' },
          { id: '2', name: 'Beta', description: 'garden fountain' }
        ]
      }
    })
    expect(index).toBeNull()
  })

  it('returns null when there are no entities', async () => {
    const index = await buildRelevanceIndex({ query: GARDEN_QUERY, entities: {} })
    expect(index).toBeNull()
  })

  it('keys characters and locations under their singular type', async () => {
    const index = await buildRelevanceIndex({
      query: GARDEN_QUERY,
      entities: {
        characters: [
          { id: 'c1', name: 'Gardener', goal: 'tend the garden fountain' },
          { id: 'c2', name: 'Sailor', goal: 'sail the ship' }
        ]
      }
    })

    expect(index.scoreFor({ id: 'c1' }, 'character')).not.toBeNull()
    // Wrong type means a different key, so no score.
    expect(index.scoreFor({ id: 'c1' }, 'location')).toBeNull()
  })
})

describe('sortByRelevance', () => {
  const older = { id: '1', name: 'Garden Path', lastEditedAt: 100 }
  const newer = { id: '2', name: 'Desert Road', lastEditedAt: 900 }

  it('falls back to recency when no index is supplied', () => {
    const sorted = sortByRelevance([older, newer], 'location')
    expect(sorted.map((e) => e.id)).toEqual(['2', '1'])
  })

  it('falls back to timeline order for plot threads', () => {
    const a = { id: 'a', timelineOrder: 2 }
    const b = { id: 'b', timelineOrder: 1 }
    expect(sortByRelevance([a, b], 'plotThread').map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('ranks by score when an index is supplied, overriding recency', () => {
    const index = {
      size: 2,
      scoreFor: (entity) => (entity.id === '1' ? 0.9 : 0.1)
    }
    const sorted = sortByRelevance([older, newer], 'location', index)
    // The older entity wins because it is more relevant.
    expect(sorted.map((e) => e.id)).toEqual(['1', '2'])
  })

  it('sorts unscored entities below scored ones, keeping their heuristic order', () => {
    const unscoredOld = { id: '3', lastEditedAt: 50 }
    const unscoredNew = { id: '4', lastEditedAt: 800 }
    const index = {
      size: 1,
      scoreFor: (entity) => (entity.id === '1' ? 0.9 : null)
    }

    const sorted = sortByRelevance([unscoredOld, older, unscoredNew], 'location', index)

    expect(sorted[0].id).toBe('1')
    expect(sorted.slice(1).map((e) => e.id)).toEqual(['4', '3'])
  })

  it('falls back entirely when the index scores nothing', () => {
    const index = { size: 0, scoreFor: () => null }
    expect(sortByRelevance([older, newer], 'location', index).map((e) => e.id)).toEqual(['2', '1'])
  })

  it('handles an empty or missing entity list', () => {
    expect(sortByRelevance([], 'location')).toEqual([])
    expect(sortByRelevance(undefined, 'location')).toEqual([])
  })
})
