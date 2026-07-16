import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import { db } from '@/services/db-core'
import {
  addResearchChunks,
  searchLexical,
  semanticSearch,
  cosineSimilarity,
  setEmbeddingCacheEntry,
  getBulkCachedEmbeddings,
  pruneEmbeddingCache
} from '@/services/researchDb'

const PROJECT = 'search-tests'

/** Deterministic non-unit vector so normalisation is actually exercised. */
function vec(...values) {
  return values
}

async function seed(chunks) {
  await db.researchChunks.clear()
  await addResearchChunks(
    chunks.map((c, i) => ({
      projectId: PROJECT,
      documentId: 'doc-1',
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
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('searchLexical', () => {
  it('ranks the chunk with more occurrences higher', async () => {
    await seed([
      { text: 'harbor' },
      { text: 'harbor harbor harbor and more harbor' },
      { text: 'nothing relevant here' }
    ])
    const results = await searchLexical(PROJECT, 'harbor')
    expect(results.length).toBe(2)
    expect(results[0].text).toContain('more harbor')
  })

  it('matches case-insensitively without lowercasing whole chunks', async () => {
    // The rewrite dropped the per-chunk toLowerCase() in favour of an 'i' regex.
    await seed([{ text: 'The HARBOR lights' }, { text: 'unrelated' }])
    const results = await searchLexical(PROJECT, 'harbor')
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('The HARBOR lights')
  })

  it('cannot match symbol-bearing terms — the tokenizer strips them first', async () => {
    // Documents actual behaviour, not aspiration. The query is tokenized with
    // split(/\W+/) and tokens of length <= 1 are dropped, so 'c++' becomes
    // ['c',''] -> []. Two consequences worth knowing:
    //   1. Terms like 'c++' or 'f#' are unsearchable. A real limitation, not
    //      caused by the regex rewrite — it predates it.
    //   2. Tokens can therefore only ever contain [A-Za-z0-9_], which makes the
    //      regex-escaping in searchLexical unreachable. It is kept as a guard in
    //      case the tokenizer is ever loosened.
    await seed([{ text: 'written in c++ mostly' }, { text: 'written in rust' }])
    expect(await searchLexical(PROJECT, 'c++')).toEqual([])
  })

  it('does not treat a metacharacter-adjacent token as a pattern', async () => {
    // 'harbor' extracted from 'harbor.*' must match literally, not as a regex.
    await seed([{ text: 'the harbor lights' }, { text: 'xxxxxxxx' }])
    const results = await searchLexical(PROJECT, 'harbor.*')
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('the harbor lights')
  })

  it('returns [] for a query with no usable tokens', async () => {
    await seed([{ text: 'anything' }])
    expect(await searchLexical(PROJECT, '')).toEqual([])
    expect(await searchLexical(PROJECT, 'a !')).toEqual([])
  })

  it('returns [] when the project has no chunks', async () => {
    expect(await searchLexical('empty-project', 'harbor')).toEqual([])
  })

  it('excludes chunks that score zero', async () => {
    await seed([{ text: 'harbor' }, { text: 'completely different' }])
    const results = await searchLexical(PROJECT, 'harbor')
    expect(results.every((r) => r._score > 0)).toBe(true)
  })

  it('respects the limit', async () => {
    await seed([{ text: 'harbor a' }, { text: 'harbor b' }, { text: 'harbor c' }])
    expect(await searchLexical(PROJECT, 'harbor', 2)).toHaveLength(2)
  })

  it('counts multiple query tokens independently', async () => {
    await seed([{ text: 'harbor and ledger' }, { text: 'harbor only' }])
    const results = await searchLexical(PROJECT, 'harbor ledger')
    expect(results[0].text).toBe('harbor and ledger')
  })
})

describe('semanticSearch', () => {
  it('ranks by cosine similarity regardless of vector magnitude', async () => {
    // Chunks are normalised at the cache boundary, so a long vector pointing the
    // same way as the query must beat a short one pointing elsewhere.
    await seed([
      { text: 'aligned but tiny', embedding: vec(0.01, 0, 0) },
      { text: 'orthogonal but huge', embedding: vec(0, 100, 0) }
    ])
    const results = await semanticSearch(PROJECT, vec(1, 0, 0))
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('aligned but tiny')
  })

  it('agrees with the reference cosineSimilarity implementation', async () => {
    const a = vec(0.3, 0.5, 0.81)
    const q = vec(0.2, 0.9, 0.4)
    await seed([{ text: 'x', embedding: a }])

    const results = await semanticSearch(PROJECT, q)
    expect(results[0]._score).toBeCloseTo(cosineSimilarity(a, q), 5)
  })

  it('returns [] when given no query embedding', async () => {
    await seed([{ text: 'x', embedding: vec(1, 0, 0) }])
    expect(await semanticSearch(PROJECT, null)).toEqual([])
  })

  it('skips zero-magnitude vectors rather than dividing by zero', async () => {
    await seed([{ text: 'zero', embedding: vec(0, 0, 0) }])
    const results = await semanticSearch(PROJECT, vec(1, 0, 0))
    expect(results).toEqual([])
  })

  it('skips dimension-mismatched chunks and warns loudly', async () => {
    // A provider switch (768-dim nomic -> 1024-dim mistral) previously fell
    // through cosineSimilarity's length guard and scored 0 — silent zero recall.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await seed([
      { text: 'wrong dims', embedding: vec(1, 0) },
      { text: 'right dims', embedding: vec(1, 0, 0) }
    ])
    const results = await semanticSearch(PROJECT, vec(1, 0, 0))

    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('right dims')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('embedding dimension'))
  })

  it('ignores chunks with no embedding at all', async () => {
    await seed([{ text: 'unembedded' }, { text: 'embedded', embedding: vec(1, 0, 0) }])
    const results = await semanticSearch(PROJECT, vec(1, 0, 0))
    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('embedded')
  })
})

describe('embedding cache storage', () => {
  it('round-trips through Dexie as a Float32Array', async () => {
    await setEmbeddingCacheEntry('h1', new Float32Array([0.5, 0.25]))
    const got = await getBulkCachedEmbeddings(['h1'])
    expect(got.get('h1')).toBeInstanceOf(Float32Array)
    expect(Array.from(got.get('h1'))).toEqual([0.5, 0.25])
  })

  it('accepts a plain array on write for backward compatibility', async () => {
    await setEmbeddingCacheEntry('h2', [0.5, 0.25])
    const got = await getBulkCachedEmbeddings(['h2'])
    expect(got.get('h2')).toBeInstanceOf(Float32Array)
    expect(Array.from(got.get('h2'))).toEqual([0.5, 0.25])
  })
})

describe('pruneEmbeddingCache', () => {
  it('reports how many entries it deleted', async () => {
    for (let i = 0; i < 5; i++) {
      await db.embeddingCache.put({
        hash: `k${i}`,
        embedding: new Float32Array([i]),
        createdAt: i
      })
    }
    // Was previously returning undefined, so the caller could not log a count.
    expect(await pruneEmbeddingCache(2)).toBe(3)
    expect(await db.embeddingCache.count()).toBe(2)
  })

  it('deletes the oldest entries first', async () => {
    for (let i = 0; i < 4; i++) {
      await db.embeddingCache.put({ hash: `k${i}`, embedding: new Float32Array([i]), createdAt: i })
    }
    await pruneEmbeddingCache(2)
    const left = (await db.embeddingCache.toArray()).map((e) => e.hash).sort()
    expect(left).toEqual(['k2', 'k3'])
  })

  it('is a no-op below the threshold', async () => {
    await db.embeddingCache.put({ hash: 'k', embedding: new Float32Array([1]), createdAt: 0 })
    expect(await pruneEmbeddingCache(10)).toBe(0)
    expect(await db.embeddingCache.count()).toBe(1)
  })
})
