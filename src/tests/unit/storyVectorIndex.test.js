import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { db } from '@/services/db-core'

/**
 * Deterministic "embeddings": a 4-dim vector where each text lights up the
 * axis of the word it contains, so cosine ranking is predictable.
 */
const AXES = ['harbour', 'salt', 'railway', 'debt']
function fakeVector(text) {
  const v = new Float32Array(4)
  const t = String(text).toLowerCase()
  AXES.forEach((w, i) => {
    if (t.includes(w)) v[i] = 1
  })
  if (!v.some(Boolean)) v[0] = 0.1
  return v
}

const worker = vi.hoisted(() => ({
  build: vi.fn(async () => {}),
  search: vi.fn(async () => []),
  failSearch: false
}))

vi.mock('@/services/embeddingService', () => ({
  getEmbedding: vi.fn(async (text) => fakeVector(text)),
  getEmbeddings: vi.fn(async (texts) => ({
    vectors: texts.map(fakeVector),
    provider: 'ollama',
    model: 'fake-embed'
  }))
}))
vi.mock('@/services/embeddingConfig', () => ({
  resolveEmbeddingConfig: () => ({ provider: 'ollama', model: 'fake-embed', threshold: 0.1 })
}))
vi.mock('@/services/vectorIndexService', () => ({
  buildVectorIndex: (...a) => worker.build(...a),
  searchVectorIndex: async (...a) => {
    if (worker.failSearch) throw new Error('worker down')
    return worker.search(...a)
  }
}))

import {
  rankVectors,
  indexStoryContent,
  indexStoryContentBatch,
  indexProject,
  searchStorySemantic,
  getStoredVectors,
  buildIndexText,
  scheduleStoryIndex,
  flushStoryIndexScheduler,
  resetDimWarnings,
  STORY_INDEX_DEBOUNCE_MS
} from '@/services/storyVectorIndex'

beforeAll(async () => {
  await db.open()
})

beforeEach(async () => {
  await db.contentVectors.clear()
  await db.characters.clear()
  await db.locations.clear()
  await db.plotThreads.clear()
  await db.sections.clear()
  await db.subsections.clear()
  worker.build.mockClear()
  worker.search.mockClear()
  worker.search.mockResolvedValue([])
  worker.failSearch = false
  resetDimWarnings()
})

afterEach(() => {
  flushStoryIndexScheduler()
  vi.useRealTimers()
})

const row = (kind, refId, text, dim = 4) => ({
  projectId: 'p1',
  kind,
  refId,
  title: refId,
  text,
  model: 'fake-embed',
  dim,
  embedding: dim === 4 ? fakeVector(text) : new Float32Array(dim).fill(0.5),
  embeddingStatus: 'READY',
  updatedAt: 'now'
})

describe('rankVectors (pure)', () => {
  it('returns highest cosine first, honours kinds, threshold and exclude', () => {
    const stored = [
      row('subsection', 's1', 'the harbour at dawn'),
      row('subsection', 's2', 'salt and debt'),
      row('character', 'c1', 'a harbour master'),
      row('location', 'l1', 'the railway survey camp')
    ]
    const { matches } = rankVectors(fakeVector('harbour'), stored, { limit: 3 })
    expect(matches.map((m) => m.refId)).toEqual(['s1', 'c1'])
    expect(matches[0].score).toBeGreaterThan(0.9)

    const onlyChars = rankVectors(fakeVector('harbour'), stored, { kinds: ['character'] }).matches
    expect(onlyChars.map((m) => m.refId)).toEqual(['c1'])

    const excluded = rankVectors(fakeVector('harbour'), stored, {
      exclude: [{ kind: 'subsection', refId: 's1' }]
    }).matches
    expect(excluded.map((m) => m.refId)).toEqual(['c1'])

    const strict = rankVectors(fakeVector('harbour'), stored, { threshold: 0.99 }).matches
    expect(strict).toHaveLength(2)
  })

  it('skips dimension-mismatched rows and counts them', () => {
    const stored = [row('subsection', 's1', 'harbour'), row('subsection', 'old', 'harbour', 8)]
    const { matches, mismatched } = rankVectors(fakeVector('harbour'), stored)
    expect(matches.map((m) => m.refId)).toEqual(['s1'])
    expect(mismatched).toBe(1)
  })
})

describe('indexing', () => {
  it('indexStoryContent upserts one row with model, dim and READY status', async () => {
    expect(
      await indexStoryContent('p1', 'character', 'c1', 'Ines, harbour inspector', 'Ines')
    ).toBe(true)
    let rows = await getStoredVectors('p1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'character',
      refId: 'c1',
      model: 'fake-embed',
      dim: 4,
      embeddingStatus: 'READY',
      title: 'Ines'
    })
    // Same key again replaces, never duplicates.
    await indexStoryContent('p1', 'character', 'c1', 'Ines, salt inspector', 'Ines')
    rows = await getStoredVectors('p1')
    expect(rows).toHaveLength(1)
    expect(rows[0].embedding[1]).toBe(1)
    expect(await indexStoryContent('p1', 'character', 'c2', '   ')).toBe(false)
  })

  it('indexProject embeds the whole bible and manuscript in one batch', async () => {
    await db.characters.add({ id: 'c1', projectId: 'p1', name: 'Ines', role: 'harbour inspector' })
    await db.locations.add({ id: 'l1', projectId: 'p1', name: 'Salt flats' })
    await db.plotThreads.add({ id: 't1', projectId: 'p1', title: 'The railway', summary: 'survey' })
    await db.sections.add({ id: 'sec1', projectId: 'p1', title: 'One', order: 0 })
    await db.subsections.add({
      id: 's1',
      projectId: 'p1',
      sectionId: 'sec1',
      title: 'Debt',
      content: '<p>the debt is due</p>',
      order: 0
    })
    await db.subsections.add({
      id: 's2',
      projectId: 'p1',
      sectionId: 'sec1',
      title: 'Empty',
      content: '',
      order: 1
    })
    const n = await indexProject('p1')
    // s2 still has a title, so it is indexed; every row lands.
    expect(n).toBe(6)
    const kinds = (await getStoredVectors('p1')).map((r) => r.kind).sort()
    expect(kinds).toEqual([
      'character',
      'location',
      'section',
      'subsection',
      'subsection',
      'thread'
    ])
    expect(buildIndexText('subsection', { title: 'Debt', content: '<p>the <b>debt</b></p>' })).toBe(
      'Debt\nthe debt'
    )
  })
})

describe('searchStorySemantic', () => {
  it('uses the worker index and maps hits back to refs', async () => {
    await indexStoryContentBatch('p1', [
      { kind: 'subsection', refId: 's1', text: 'harbour', title: 'Harbour' },
      { kind: 'character', refId: 'c1', text: 'salt', title: 'Salt man' }
    ])
    worker.search.mockResolvedValueOnce([
      {
        id: 'character:c1',
        score: 0.9,
        metadata: { kind: 'character', refId: 'c1', title: 'Salt man', text: 'salt' }
      },
      {
        id: 'subsection:s1',
        score: 0.2,
        metadata: { kind: 'subsection', refId: 's1', title: 'Harbour', text: 'harbour' }
      }
    ])
    const out = await searchStorySemantic('p1', 'salt', { limit: 5 })
    expect(worker.build).toHaveBeenCalledTimes(1)
    expect(out.map((m) => m.refId)).toEqual(['c1', 's1'])
    expect(out[0].title).toBe('Salt man')
  })

  it('falls back to brute-force ranking when the worker throws', async () => {
    await indexStoryContentBatch('p1', [
      { kind: 'subsection', refId: 's1', text: 'harbour at dawn' },
      { kind: 'subsection', refId: 's2', text: 'debt collector' }
    ])
    worker.failSearch = true
    const out = await searchStorySemantic('p1', 'debt')
    expect(out.map((m) => m.refId)).toEqual(['s2'])
  })

  it('warns once per project on a dimension mismatch and still answers from matching rows', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await db.contentVectors.add(row('subsection', 'old', 'harbour', 8))
    await db.contentVectors.add(row('subsection', 's1', 'harbour'))
    worker.search.mockResolvedValue([])
    const out = await searchStorySemantic('p1', 'harbour')
    expect(out.map((m) => m.refId)).toEqual(['s1'])
    await searchStorySemantic('p1', 'harbour')
    const dimWarnings = warn.mock.calls.filter((c) => /dimension does not match/.test(String(c[0])))
    expect(dimWarnings).toHaveLength(1)
    warn.mockRestore()
  })

  it('returns nothing for an empty query or an empty corpus, without touching the worker', async () => {
    expect(await searchStorySemantic('p1', '   ')).toEqual([])
    expect(await searchStorySemantic('p1', 'salt')).toEqual([])
    expect(worker.build).not.toHaveBeenCalled()
  })
})

describe('scheduleStoryIndex', () => {
  it('coalesces rapid saves into one embed, and flush cancels', async () => {
    vi.useFakeTimers()
    const { getEmbedding } = await import('@/services/embeddingService')
    getEmbedding.mockClear()
    scheduleStoryIndex('p1', 'character', 'c1', { name: 'Ines', role: 'harbour' })
    scheduleStoryIndex('p1', 'character', 'c1', { name: 'Ines', role: 'harbour inspector' })
    scheduleStoryIndex('p1', 'character', 'c1', { name: 'Ines', role: 'salt inspector' })
    await vi.advanceTimersByTimeAsync(STORY_INDEX_DEBOUNCE_MS + 10)
    expect(getEmbedding).toHaveBeenCalledTimes(1)
    expect(getEmbedding.mock.calls[0][0]).toContain('salt inspector')

    scheduleStoryIndex('p1', 'character', 'c2', { name: 'Tomas' })
    flushStoryIndexScheduler()
    await vi.advanceTimersByTimeAsync(STORY_INDEX_DEBOUNCE_MS + 10)
    expect(getEmbedding).toHaveBeenCalledTimes(1)
  })
})
