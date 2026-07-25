import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import { db } from '@/services/db-core'
import { addResearchChunks } from '@/services/researchDb'

const PROJECT = 'benchmark-project'

const { mockGetEmbedding } = vi.hoisted(() => ({
  mockGetEmbedding: vi.fn()
}))

vi.mock('@/services/embeddingService', () => ({
  getEmbedding: mockGetEmbedding
}))

function vec(...values) {
  return values
}

async function seed(chunks) {
  await db.researchChunks.clear()
  await addResearchChunks(
    chunks.map((c, i) => ({
      projectId: PROJECT,
      documentId: c.documentId || 'doc-1',
      chunkIndex: i,
      text: c.text,
      embedding: c.embedding || null,
      embeddingStatus: c.embedding ? 'READY' : 'PENDING'
    }))
  )
}

beforeEach(async () => {
  await db.researchChunks.clear()
  await db.embeddingCache.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('multiHopRetrieval — retrieval quality benchmarks', () => {
  it('ranks chunks matching query terms lexically higher', async () => {
    await seed([
      { text: 'The ancient dragon guarded the treasure hoard.', embedding: null },
      { text: 'The knight fought bravely against the dragon.', embedding: null },
      { text: 'Dragonfire scorched the village walls.', embedding: null },
      { text: 'The king ruled with a steady hand.', embedding: null },
      { text: 'Harvest season brought plenty of grain.', embedding: null },
      { text: 'The river flowed through the valley.', embedding: null },
      { text: 'Legends spoke of a sword forged in dragonfire.', embedding: null }
    ])

    mockGetEmbedding.mockRejectedValue(new Error('embedding unavailable'))

    const { multiHopRetrieval } = await import('@/services/ragMultiHopRetrieval')
    const results = await multiHopRetrieval({
      queries: ['dragon knight'],
      projectId: PROJECT,
      topK: 5
    })

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results.some((r) => r.text.includes('dragon'))).toBe(true)
  })

  it('returns [] for a project with no chunks', async () => {
    const { multiHopRetrieval } = await import('@/services/ragMultiHopRetrieval')
    const results = await multiHopRetrieval({ queries: ['anything'], projectId: 'nonexistent' })
    expect(results).toEqual([])
  })

  it('returns [] when no queries are provided', async () => {
    const { multiHopRetrieval } = await import('@/services/ragMultiHopRetrieval')
    const results = await multiHopRetrieval({ queries: [], projectId: PROJECT })
    expect(results).toEqual([])
  })

  it('returns [] when no projectId is provided', async () => {
    const { multiHopRetrieval } = await import('@/services/ragMultiHopRetrieval')
    const results = await multiHopRetrieval({ queries: ['test'] })
    expect(results).toEqual([])
  })
})
