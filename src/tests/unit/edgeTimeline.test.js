import { describe, it, expect } from 'vitest'
import {
  planEdgeWrites,
  sliceEdgesAtChapter,
  isEdgeActiveAt,
  edgePairKey,
  edgeClaimKey,
  edgeHistory
} from '@/services/generation/edgeTimeline'

// The failure this layer exists to fix: `generateRelationships` deduped on the
// endpoint pair alone, so the first run to claim a pair owned it forever. Once
// volume 1 wrote "Kael—Mira: ally", volume 4's "Kael—Mira: enemy" was discarded
// as a duplicate and folded into an `all_duplicate` summary. The betrayal the
// book turns on could not enter the graph, and nothing said so.

const edge = (over = {}) => ({
  sourceId: '1',
  sourceType: 'character',
  targetId: '2',
  targetType: 'character',
  relationshipType: 'ally',
  ...over
})

describe('edge identity', () => {
  it('treats a pair as the same connection in either direction', () => {
    expect(edgePairKey(edge())).toBe(edgePairKey(edge({ sourceId: '2', targetId: '1' })))
  })

  it('separates two different claims about the same pair', () => {
    expect(edgeClaimKey(edge({ relationshipType: 'ally' }))).not.toBe(
      edgeClaimKey(edge({ relationshipType: 'enemy' }))
    )
  })
})

describe('isEdgeActiveAt', () => {
  it('treats an edge with no window as always true', () => {
    // Every edge written before the window existed has neither bound, so nothing
    // already in a graph changes meaning when the schema arrives.
    expect(isEdgeActiveAt(edge(), 1)).toBe(true)
    expect(isEdgeActiveAt(edge(), 900)).toBe(true)
  })

  it('respects both bounds inclusively', () => {
    const e = edge({ validFromChapter: 5, validUntilChapter: 10 })
    expect(isEdgeActiveAt(e, 4)).toBe(false)
    expect(isEdgeActiveAt(e, 5)).toBe(true)
    expect(isEdgeActiveAt(e, 10)).toBe(true)
    expect(isEdgeActiveAt(e, 11)).toBe(false)
  })

  it('treats a null chapter as "any time"', () => {
    expect(isEdgeActiveAt(edge({ validFromChapter: 5 }), null)).toBe(true)
  })
})

describe('sliceEdgesAtChapter', () => {
  it('returns the graph as it stood at that chapter', () => {
    const edges = [
      edge({ id: 1, relationshipType: 'ally', validFromChapter: 1, validUntilChapter: 12 }),
      edge({ id: 2, relationshipType: 'enemy', validFromChapter: 13, validUntilChapter: null })
    ]
    expect(sliceEdgesAtChapter(edges, 3).map((e) => e.id)).toEqual([1])
    expect(sliceEdgesAtChapter(edges, 20).map((e) => e.id)).toEqual([2])
  })

  it('passes everything through when no chapter is given', () => {
    const edges = [edge({ id: 1 }), edge({ id: 2 })]
    expect(sliceEdgesAtChapter(edges, null)).toHaveLength(2)
  })
})

describe('planEdgeWrites', () => {
  it('inserts a new claim with an open window stamped from the chapter', () => {
    const plan = planEdgeWrites({
      existing: [],
      proposed: [edge()],
      atChapter: 4,
      runId: 'run-1',
      volumeId: 'v1'
    })
    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0]).toMatchObject({
      validFromChapter: 4,
      validUntilChapter: null,
      runId: 'run-1',
      volumeId: 'v1'
    })
  })

  it('defaults to chapter 1 — the opening weave describes the story start', () => {
    const plan = planEdgeWrites({ existing: [], proposed: [edge()] })
    expect(plan.inserts[0].validFromChapter).toBe(1)
  })

  it('drops a claim the graph already makes', () => {
    const plan = planEdgeWrites({
      existing: [edge({ id: 1, validFromChapter: 1 })],
      proposed: [edge()],
      atChapter: 5
    })
    expect(plan.inserts).toHaveLength(0)
    expect(plan.duplicates).toHaveLength(1)
  })

  it('records a reversal instead of discarding it — the whole point', () => {
    const plan = planEdgeWrites({
      existing: [edge({ id: 1, relationshipType: 'ally', validFromChapter: 1 })],
      proposed: [edge({ relationshipType: 'enemy' })],
      atChapter: 13
    })
    // The old claim is closed the chapter before the new one opens, so the graph
    // never asserts both sides of a reversal at once.
    expect(plan.supersedes).toEqual([
      { id: 1, validUntilChapter: 12, reason: 'superseded by "enemy" at chapter 13' }
    ])
    expect(plan.inserts[0]).toMatchObject({ relationshipType: 'enemy', validFromChapter: 13 })
  })

  it('recognises a reversal regardless of edge direction', () => {
    const plan = planEdgeWrites({
      existing: [edge({ id: 1, relationshipType: 'ally', validFromChapter: 1 })],
      proposed: [edge({ sourceId: '2', targetId: '1', relationshipType: 'enemy' })],
      atChapter: 9
    })
    expect(plan.supersedes).toHaveLength(1)
    expect(plan.inserts).toHaveLength(1)
  })

  it('refuses to order a conflict against a claim that starts at the same chapter', () => {
    // Which supersedes which is unknowable here. Guessing would silently rewrite
    // a relationship; dropping it and saying so is the honest failure.
    const plan = planEdgeWrites({
      existing: [edge({ id: 1, relationshipType: 'ally', validFromChapter: 5 })],
      proposed: [edge({ relationshipType: 'enemy' })],
      atChapter: 5
    })
    expect(plan.inserts).toHaveLength(0)
    expect(plan.supersedes).toHaveLength(0)
    expect(plan.unorderable).toHaveLength(1)
  })

  it('ignores a claim that has already been closed', () => {
    const plan = planEdgeWrites({
      existing: [
        edge({ id: 1, relationshipType: 'ally', validFromChapter: 1, validUntilChapter: 4 })
      ],
      proposed: [edge({ relationshipType: 'ally' })],
      atChapter: 10
    })
    // The old alliance ended; asserting it again at chapter 10 is a new claim.
    expect(plan.inserts).toHaveLength(1)
    expect(plan.duplicates).toHaveLength(0)
  })

  it('does not insert the same claim twice from one batch', () => {
    const plan = planEdgeWrites({
      existing: [],
      proposed: [edge(), edge({ description: 'said differently' })],
      atChapter: 1
    })
    expect(plan.inserts).toHaveLength(1)
    expect(plan.duplicates).toHaveLength(1)
  })

  it('leaves an unsaved conflicting edge alone rather than trying to close it', () => {
    // A row with no id cannot be updated. Superseding it would be a no-op the
    // caller would report as a successful reversal.
    const plan = planEdgeWrites({
      existing: [edge({ relationshipType: 'ally', validFromChapter: 1 })],
      proposed: [edge({ relationshipType: 'enemy' })],
      atChapter: 6
    })
    expect(plan.supersedes).toHaveLength(0)
    expect(plan.unorderable).toHaveLength(1)
  })
})

describe('edgeHistory', () => {
  it('returns every claim about a pair, oldest first', () => {
    const edges = [
      edge({ id: 2, relationshipType: 'enemy', validFromChapter: 13 }),
      edge({ id: 1, relationshipType: 'ally', validFromChapter: 1, validUntilChapter: 12 }),
      edge({ id: 3, sourceId: '9', targetId: '8' })
    ]
    expect(edgeHistory(edges, edgePairKey(edge())).map((e) => e.id)).toEqual([1, 2])
  })
})
