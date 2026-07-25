import { describe, it, expect, vi, beforeEach } from 'vitest'

function createMockTable() {
  const store = new Map()
  return {
    _store: store,
    get: vi.fn((hash) => Promise.resolve(store.get(hash))),
    add: vi.fn((row) => {
      store.set(row.hash, row)
      return Promise.resolve(row.hash)
    }),
    count: vi.fn(() => Promise.resolve(store.size)),
    where: vi.fn((index) => ({
      equals: vi.fn((val) => ({
        toArray: vi.fn(() =>
          Promise.resolve(
            [...store.values()].filter(
              (r) =>
                r.provider === val[0] &&
                r.model === val[1] &&
                r.temperature === val[2] &&
                r.feature === val[3]
            )
          )
        )
      })),
      below: vi.fn(() => ({
        delete: vi.fn(() => Promise.resolve())
      }))
    })),
    orderBy: vi.fn(() => ({
      limit: vi.fn((n) => ({
        toArray: vi.fn(() =>
          Promise.resolve(
            [...store.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).slice(0, n)
          )
        )
      }))
    })),
    bulkDelete: vi.fn((hashes) => {
      hashes.forEach((h) => store.delete(h))
      return Promise.resolve()
    })
  }
}

const mockTable = createMockTable()

vi.mock('../../services/db-core', () => ({
  db: { aiResponseCache: mockTable }
}))

const mockEmbeddings = new Map()
function hashToVec(text) {
  let s = 0
  for (let i = 0; i < text.length; i++) s += text.charCodeAt(i) * (i + 1)
  const x = (s % 1000) / 1000
  const y = ((s * 7) % 1000) / 1000
  const z = ((s * 13) % 1000) / 1000
  return [x, y, z]
}
vi.mock('../../services/embeddingService', () => ({
  getEmbedding: vi.fn(async (text) => {
    if (mockEmbeddings.has(text)) return mockEmbeddings.get(text)
    return hashToVec(text)
  })
}))

let cache
beforeEach(async () => {
  vi.clearAllMocks()
  mockTable._store.clear()
  mockEmbeddings.clear()
  vi.resetModules()
  cache = await import('../../services/aiResponseCache')
})

const PROVIDER = 'ollama'
const MODEL = 'llama3'
const TEMP = 0.7
const FEATURE = 'writer.scene'
const SYS = 'You are a writer.'
const PROMPT = 'Write a scene about a dragon.'
const PROMPT_B = 'Write a scene about a robot.'
const OUTPUT = 'Once upon a time, there was a dragon...'
const OUTPUT_B = 'In a futuristic world, a robot awoke...'

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('computeCosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cache.computeCosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cache.computeCosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cache.computeCosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5)
  })

  it('returns 0 for null first vector', () => {
    expect(cache.computeCosineSimilarity(null, [1, 2])).toBe(0)
  })

  it('returns 0 for null second vector', () => {
    expect(cache.computeCosineSimilarity([1, 2], null)).toBe(0)
  })

  it('returns 0 for mismatched lengths', () => {
    expect(cache.computeCosineSimilarity([1, 0], [1, 0, 0])).toBe(0)
  })
})

describe('diagnostic', () => {
  it('should have mockTable working', async () => {
    const dbCore = await import('../../services/db-core')
    expect(dbCore.db.aiResponseCache).toBe(mockTable)
    expect(mockTable.add.mock).toBeDefined()

    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    expect(cache.getInMemoryCacheSize()).toBe(1)

    await flushMicrotasks()
    expect(mockTable.add).toHaveBeenCalledTimes(1)
    expect(mockTable._store.size).toBe(1)
  })
})

describe('cache hit/miss lifecycle', () => {
  it('returns null on miss for non-cacheable feature', async () => {
    const result = await cache.lookup(PROVIDER, MODEL, TEMP, 'noncacheable.test', SYS, PROMPT)
    expect(result).toBeNull()
  })

  it('stores output and returns it on subsequent lookup (L1 hit)', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    const result = await cache.lookup(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT)
    expect(result).toBe(OUTPUT)
  })

  it('tracks hit/miss ratio across multiple lookups', async () => {
    expect(await cache.lookup(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT)).toBeNull()
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)

    let hits = 0
    let misses = 0

    for (let i = 0; i < 5; i++) {
      const r = await cache.lookup(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT)
      if (r) hits++
      else misses++
    }

    expect(hits).toBe(5)
    expect(misses).toBe(0)
  })

  it('returns null for a different prompt after storing one', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    const result = await cache.lookup(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT_B)
    expect(result).toBeNull()
  })

  it('recovers stored output from L2 (Dexie) when L1 is cleared', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    await flushMicrotasks()

    cache.clearInMemoryCache()
    expect(cache.getInMemoryCacheSize()).toBe(0)

    const result = await cache.lookup(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT)
    expect(result).toBe(OUTPUT)
  })

  it('promotes L2 entry to L1 on access', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    await flushMicrotasks()

    cache.clearInMemoryCache()
    expect(cache.getInMemoryCacheSize()).toBe(0)

    await cache.lookup(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT)
    expect(cache.getInMemoryCacheSize()).toBe(1)
  })

  it('returns null for different provider', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    const result = await cache.lookup('openai', MODEL, TEMP, FEATURE, SYS, PROMPT)
    expect(result).toBeNull()
  })

  it('returns null for different model', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    const result = await cache.lookup(PROVIDER, 'gpt4', TEMP, FEATURE, SYS, PROMPT)
    expect(result).toBeNull()
  })

  it('returns null for different temperature', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    const result = await cache.lookup(PROVIDER, MODEL, 0.2, FEATURE, SYS, PROMPT)
    expect(result).toBeNull()
  })
})

describe('semantic cache', () => {
  it('returns cached output for semantically similar prompt', async () => {
    mockEmbeddings.set(PROMPT, [1, 0, 0])
    mockEmbeddings.set('Write a scene about a large dragon.', [0.97, 0.03, 0])

    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    await flushMicrotasks()
    cache.clearInMemoryCache()

    const result = await cache.lookup(
      PROVIDER,
      MODEL,
      TEMP,
      FEATURE,
      SYS,
      'Write a scene about a large dragon.'
    )
    expect(result).toBe(OUTPUT)
  })

  it('misses for semantically dissimilar prompt', async () => {
    mockEmbeddings.set(PROMPT, [1, 0, 0])
    mockEmbeddings.set(PROMPT_B, [0, 1, 0])

    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    await flushMicrotasks()
    cache.clearInMemoryCache()

    const result = await cache.lookup(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT_B)
    expect(result).toBeNull()
  })
})

describe('cache boundaries', () => {
  it('does not store for non-cacheable feature', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, 'noncacheable.test', SYS, PROMPT, OUTPUT)
    expect(cache.getInMemoryCacheSize()).toBe(0)
  })

  it('does not store falsy output', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, '')
    expect(cache.getInMemoryCacheSize()).toBe(0)
  })

  it('does not store null output', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, null)
    expect(cache.getInMemoryCacheSize()).toBe(0)
  })

  it('tracks in-memory cache size correctly', async () => {
    expect(cache.getInMemoryCacheSize()).toBe(0)
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    expect(cache.getInMemoryCacheSize()).toBe(1)
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT_B, OUTPUT_B)
    expect(cache.getInMemoryCacheSize()).toBe(2)
  })

  it('clears in-memory cache', async () => {
    await cache.store(PROVIDER, MODEL, TEMP, FEATURE, SYS, PROMPT, OUTPUT)
    expect(cache.getInMemoryCacheSize()).toBe(1)
    cache.clearInMemoryCache()
    expect(cache.getInMemoryCacheSize()).toBe(0)
  })
})

describe('cache statistics (hit/miss ratio)', () => {
  beforeEach(() => {
    cache.resetCacheStats()
  })

  it('tracks hits and misses across lookups', async () => {
    await cache.lookup(PROVIDER, MODEL, TEMP, 'writer.test', SYS, PROMPT)
    await cache.lookup(PROVIDER, MODEL, TEMP, 'writer.test', SYS, PROMPT)

    let stats = cache.getCacheStats()
    expect(stats.misses).toBeGreaterThanOrEqual(1)

    await cache.store(PROVIDER, MODEL, TEMP, 'writer.test', SYS, PROMPT, OUTPUT)
    await cache.lookup(PROVIDER, MODEL, TEMP, 'writer.test', SYS, PROMPT)

    stats = cache.getCacheStats()
    expect(stats.hits).toBeGreaterThanOrEqual(1)
  })

  it('tracks non-cacheable feature as miss', async () => {
    await cache.lookup(PROVIDER, MODEL, TEMP, 'noncacheable.test', SYS, PROMPT)
    const stats = cache.getCacheStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(0)
  })

  it('resetCacheStats clears all counters', async () => {
    await cache.lookup(PROVIDER, MODEL, TEMP, 'writer.test', SYS, PROMPT)
    cache.resetCacheStats()
    const stats = cache.getCacheStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.semanticHits).toBe(0)
  })
})
