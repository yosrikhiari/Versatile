import { describe, it, expect, vi, beforeEach } from 'vitest'

// Prompt → vector. Similarity is driven by shared marker words.
const MARKERS = ['garden', 'fountain', 'ship', 'desert']
function fakeVector(text) {
  const lower = (text || '').toLowerCase()
  const v = MARKERS.map((m) => (lower.includes(m) ? 1 : 0))
  return v.some(Boolean) ? v : [0.01, 0.01, 0.01, 0.01]
}

vi.mock('../../services/embeddingService', () => ({
  getEmbedding: async (text) => fakeVector(text)
}))

/** Minimal in-memory stand-in for the Dexie aiResponseCache table. */
function makeTable(rows = []) {
  const store = new Map(rows.map((r) => [r.hash, { ...r }]))
  return {
    store,
    async get(hash) {
      return store.get(hash) ?? null
    },
    async add(row) {
      store.set(row.hash, row)
    },
    async update(hash, patch) {
      const existing = store.get(hash)
      if (!existing) return 0
      store.set(hash, { ...existing, ...patch })
      return 1
    },
    where() {
      return {
        equals: () => ({ toArray: async () => [...store.values()] }),
        below: () => ({ delete: async () => 0 })
      }
    },
    async count() {
      return store.size
    },
    orderBy() {
      return { limit: () => ({ toArray: async () => [] }) }
    },
    async bulkDelete() {}
  }
}

let table
// `getDb()` memoises the imported `db` object, so the object identity must be
// stable while the table behind it is swapped per test.
vi.mock('../../services/db-core', () => ({
  db: {
    get aiResponseCache() {
      return table
    }
  }
}))

const cache = await import('../../services/aiResponseCache')

const FEATURE = 'writer.scene'
const ARGS = ['openai', 'gpt-4o-mini', 0.7, FEATURE, 'system', 'Write the garden fountain scene.']

function entry(overrides = {}) {
  return {
    hash: overrides.hash ?? 'h1',
    output: overrides.output ?? 'cached prose',
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    feature: FEATURE,
    embedding: fakeVector(overrides.prompt ?? 'Write the garden fountain scene.'),
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

describe('aiResponseCache semantic lookup', () => {
  beforeEach(() => {
    cache.clearInMemoryCache()
    cache.resetCacheStats()
    table = makeTable()
  })

  it('returns null on a miss with no candidates', async () => {
    expect(await cache.lookup(...ARGS)).toBeNull()
    expect(cache.getCacheStats().misses).toBe(1)
  })

  it('serves a semantically similar entry', async () => {
    table = makeTable([entry({ hash: 'other', output: 'garden prose' })])

    const result = await cache.lookup(...ARGS)

    expect(result).toBe('garden prose')
    expect(cache.getCacheStats().semanticHits).toBe(1)
  })

  it('picks the closest candidate, not the first one over the threshold', async () => {
    // Dexie returns insertion order; the old scan returned whichever entry
    // happened to come first, so a weaker match could beat a stronger one.
    table = makeTable([
      entry({ hash: 'weaker', output: 'weaker match', prompt: 'garden fountain ship' }),
      entry({ hash: 'exactish', output: 'closest match', prompt: 'garden fountain' })
    ])

    const result = await cache.lookup(...ARGS)

    expect(result).toBe('closest match')
  })

  it('does not serve an entry the critic scored badly', async () => {
    table = makeTable([entry({ hash: 'bad', output: 'poor prose', qualityScore: 3 })])

    const result = await cache.lookup(...ARGS)

    expect(result).toBeNull()
    expect(cache.getCacheStats().semanticRejectedByQuality).toBe(1)
  })

  it('falls through a bad entry to a good one', async () => {
    table = makeTable([
      entry({ hash: 'bad', output: 'poor prose', qualityScore: 2 }),
      entry({ hash: 'good', output: 'good prose', qualityScore: 9 })
    ])

    expect(await cache.lookup(...ARGS)).toBe('good prose')
  })

  it('serves entries with no recorded quality — unknown is not bad', async () => {
    table = makeTable([entry({ hash: 'unscored', output: 'unscored prose' })])
    expect(await cache.lookup(...ARGS)).toBe('unscored prose')
  })

  it('ignores semantically distant entries', async () => {
    table = makeTable([entry({ hash: 'far', output: 'desert prose', prompt: 'a desert ship' })])
    expect(await cache.lookup(...ARGS)).toBeNull()
  })

  it('does not cache uncacheable features', async () => {
    table = makeTable([entry()])
    const result = await cache.lookup('openai', 'gpt-4o-mini', 0.7, 'ui.autocomplete', 's', 'p')
    expect(result).toBeNull()
  })
})

describe('cache quality attribution', () => {
  beforeEach(() => {
    cache.clearInMemoryCache()
    cache.resetCacheStats()
    table = makeTable()
  })

  it('records a score against the entry that served the output', async () => {
    table = makeTable([entry({ hash: 'served', output: 'garden prose' })])

    const output = await cache.lookup(...ARGS)
    const recorded = await cache.recordQualityForOutput(output, 4)

    expect(recorded).toBe(true)
    expect(table.store.get('served').qualityScore).toBe(4)
  })

  it('makes a badly-scored entry stop being served', async () => {
    table = makeTable([entry({ hash: 'served', output: 'garden prose' })])

    const first = await cache.lookup(...ARGS)
    expect(first).toBe('garden prose')

    await cache.recordQualityForOutput(first, 3)
    cache.clearInMemoryCache()

    // Same prompt, same entry — but it is now known to be poor.
    expect(await cache.lookup(...ARGS)).toBeNull()
  })

  it('keeps the worst score seen rather than letting one good eval clear it', async () => {
    table = makeTable([entry({ hash: 'served', output: 'garden prose' })])

    const output = await cache.lookup(...ARGS)
    await cache.recordQualityForOutput(output, 3)
    await cache.recordQualityForOutput(output, 9)

    expect(table.store.get('served').qualityScore).toBe(3)
  })

  it('no-ops for output that did not come from the cache', async () => {
    expect(await cache.recordQualityForOutput('freshly generated prose', 8)).toBe(false)
  })

  it('ignores a non-numeric score', async () => {
    table = makeTable([entry({ hash: 'served', output: 'garden prose' })])
    const output = await cache.lookup(...ARGS)
    expect(await cache.recordQualityForOutput(output, NaN)).toBe(false)
  })

  it('reports provenance of the last lookup', async () => {
    table = makeTable([entry({ hash: 'served', output: 'garden prose' })])

    await cache.lookup(...ARGS)
    const meta = cache.getLastLookupMeta()

    expect(meta.source).toBe('semantic')
    expect(meta.hash).toBe('served')
    expect(meta.similarity).toBeGreaterThanOrEqual(0.95)
  })
})
