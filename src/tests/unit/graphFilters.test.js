import { describe, it, expect } from 'vitest'
import {
  collectRelationshipTypes,
  buildAdjacency,
  computeLocalGraph,
  findNodesByName
} from '@/utils/graphFilters'

// Instance-expanded edges the way StoryNetwork renders them.
const E = [
  { id: 'e1', source: 'char-1', target: 'char-2', data: { relationshipType: 'ally' } },
  { id: 'e2', source: 'char-2', target: 'loc-1', data: { relationshipType: 'lives_in' } },
  { id: 'e3', source: 'char-1', target: 'loc-1', data: { relationshipType: 'lives_in' } },
  { id: 'e4', source: 'char-2', target: 'thread-1', data: { relationshipType: 'drives' } },
  { id: 'e5', source: 'char-9', target: 'loc-9', data: { relationshipType: 'ally' } },
  { source: 'char-1', target: 'char-2', data: { relationshipType: 'rival' } } // no id
]

describe('graphFilters', () => {
  it('collects distinct sorted relationship types', () => {
    expect(collectRelationshipTypes(E)).toEqual(['ally', 'drives', 'lives_in', 'rival'])
    expect(collectRelationshipTypes([])).toEqual([])
    expect(collectRelationshipTypes([{ source: 'a', target: 'b', relationshipType: 'x' }])).toEqual(
      ['x']
    )
  })

  it('builds an undirected adjacency with multi-edges between one pair', () => {
    const adj = buildAdjacency(E)
    expect(adj.get('char-1').get('char-2')).toEqual(['e1', 'char-1->char-2'])
    expect(adj.get('char-2').get('char-1')).toEqual(['e1', 'char-1->char-2'])
    expect(adj.get('loc-1').has('char-1')).toBe(true)
    expect(adj.has('nobody')).toBe(false)
  })

  it('depth 1 keeps the neighbours and every edge among them, drops the rest', () => {
    const { nodeIds, edgeIds } = computeLocalGraph('char-1', E, 1)
    expect([...nodeIds].sort()).toEqual(['char-1', 'char-2', 'loc-1'])
    // e2 joins two depth-1 neighbours: kept. e4 leaves the neighbourhood: dropped.
    expect([...edgeIds].sort()).toEqual(['char-1->char-2', 'e1', 'e2', 'e3'])
    expect(edgeIds.has('e5')).toBe(false)
  })

  it('depth 2 widens the radius; depth 0 is the focus alone', () => {
    const two = computeLocalGraph('char-1', E, 2)
    expect(two.nodeIds.has('thread-1')).toBe(true)
    expect(two.edgeIds.has('e4')).toBe(true)
    expect(two.nodeIds.has('char-9')).toBe(false)
    const zero = computeLocalGraph('char-1', E, 0)
    expect([...zero.nodeIds]).toEqual(['char-1'])
    expect(zero.edgeIds.size).toBe(0)
  })

  it('no focus → empty sets', () => {
    const r = computeLocalGraph(null, E, 3)
    expect(r.nodeIds.size).toBe(0)
    expect(r.edgeIds.size).toBe(0)
  })

  it('finds nodes by label, sublabel or name, case-insensitively', () => {
    const N = [
      { id: 'char-1', data: { label: 'Halden', sublabel: 'customs officer' } },
      { id: 'char-2', data: { label: 'Ines' } },
      { id: 'loc-1', label: 'The Docks' },
      { id: 'thread-1', name: 'The second body' }
    ]
    expect(findNodesByName(N, 'hal').map((n) => n.id)).toEqual(['char-1'])
    expect(findNodesByName(N, 'CUSTOMS').map((n) => n.id)).toEqual(['char-1'])
    expect(findNodesByName(N, 'docks').map((n) => n.id)).toEqual(['loc-1'])
    expect(findNodesByName(N, 'body').map((n) => n.id)).toEqual(['thread-1'])
    expect(findNodesByName(N, '  ')).toEqual([])
  })
})
