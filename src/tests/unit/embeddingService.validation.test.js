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
    expect(r1.vectors[0]).toEqual(mockVec)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    const r2 = await getEmbeddings(['hello world'])
    expect(r2.vectors[0]).toEqual(mockVec)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
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
    expect(r2.vectors[0]).toEqual([0.1])
    expect(r2.vectors[1]).toEqual([0.2])
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
