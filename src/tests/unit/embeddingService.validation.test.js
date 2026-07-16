import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getEmbeddings,
  clearEmbeddingCache,
  getEmbeddingCacheSize
} from '../../services/embeddingService'

vi.mock('../../services/researchDb', () => ({
  getBulkCachedEmbeddings: vi.fn(() => Promise.resolve(new Map())),
  setEmbeddingCacheEntry: vi.fn()
}))

/**
 * Compare a returned vector against the values the API mock produced.
 *
 * Vectors are Float32Array now, so an exact toEqual against a plain float64
 * literal fails on both type and precision (float32 0.1 is 0.10000000149...).
 * Assert the values, at float32 tolerance.
 */
function expectVector(actual, expected) {
  expect(actual).toBeInstanceOf(Float32Array)
  expect(actual).toHaveLength(expected.length)
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 6))
}

describe('content-hash embedding cache', () => {
  beforeEach(() => {
    clearEmbeddingCache()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getEmbeddingCacheSize returns 0 after clear', () => {
    expect(getEmbeddingCacheSize()).toBe(0)
  })

  it('caches repeated text and avoids duplicate API call', async () => {
    const mockVec = [0.1, 0.2, 0.3]
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embeddings: [mockVec], model: 'nomic-embed-text' })
    })

    const r1 = await getEmbeddings(['hello world'])
    expectVector(r1.vectors[0], mockVec)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    const r2 = await getEmbeddings(['hello world'])
    expectVector(r2.vectors[0], mockVec)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('returns Float32Array, not the float64 array the API decoded to', async () => {
    // Contract change: vectors arrive from JSON.parse as plain float64 arrays
    // (8 bytes/element) and are converted at this boundary. At 768 dims and a
    // 5000-entry cache that is the difference between ~30MB and ~15MB resident —
    // and on a machine running the model locally, browser RAM comes straight out
    // of the KV cache. float32 is what every vector store uses; the ~1e-7
    // relative error is far below anything cosine similarity can notice, and the
    // RAG eval harness reports identical NDCG/MRR before and after.
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embeddings: [[0.1, 0.2, 0.3]], model: 'nomic-embed-text' })
    })

    const r = await getEmbeddings(['hello world'])
    expect(r.vectors[0]).toBeInstanceOf(Float32Array)
  })

  it('different texts each miss cache and call API', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embeddings: [[0.1]], model: 'm1' })
    })

    await getEmbeddings(['alpha'])
    await getEmbeddings(['beta'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('partial cache hit merges cached and API results in order', async () => {
    let callCount = 0
    globalThis.fetch.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({ embeddings: [[0.1]], model: 'm1' })
        }
      }
      return {
        ok: true,
        json: () => Promise.resolve({ embeddings: [[0.2]], model: 'm1' })
      }
    })

    await getEmbeddings(['first call'])
    const r2 = await getEmbeddings(['first call', 'new text'])
    expect(r2.vectors).toHaveLength(2)
    expectVector(r2.vectors[0], [0.1])
    expectVector(r2.vectors[1], [0.2])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('clearEmbeddingCache resets cache so next call refetches', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embeddings: [[0.1]], model: 'm1' })
    })

    await getEmbeddings(['hello'])
    expect(getEmbeddingCacheSize()).toBeGreaterThan(0)

    clearEmbeddingCache()
    expect(getEmbeddingCacheSize()).toBe(0)

    await getEmbeddings(['hello'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('cache handles empty input gracefully', async () => {
    const r = await getEmbeddings([])
    expect(r.vectors).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('cache handles texts with only whitespace as null vectors', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embeddings: [[0.1, 0.2, 0.3]], model: 'nomic-embed-text' })
    })

    const r = await getEmbeddings(['  ', '', 'hello'])
    expect(r.vectors[0]).toBeNull()
    expect(r.vectors[1]).toBeNull()
    expect(r.vectors[2]).not.toBeNull()
  })
})
