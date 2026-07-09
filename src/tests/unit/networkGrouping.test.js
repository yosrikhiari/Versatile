import { describe, it, expect } from 'vitest'
import {
  computeVolumeGroups,
  wouldCreateCycle,
  sortGroupsParentFirst
} from '@/utils/networkGrouping'

describe('computeVolumeGroups', () => {
  const volumes = [
    { id: 1, title: 'Volume I' },
    { id: 2, title: 'Volume II' }
  ]
  const volumeNodeIds = {
    1: ['char-1', 'char-2', 'loc-10'],
    2: ['char-3', 'thread-100']
  }

  it('creates one group per volume, named by the volume', () => {
    const { groups } = computeVolumeGroups({ volumes, volumeNodeIds })
    const volGroups = groups.filter((g) => g.volumeId != null)
    expect(volGroups).toHaveLength(2)
    expect(volGroups.map((g) => g.name)).toEqual(['Volume I', 'Volume II'])
    expect(volGroups.every((g) => g.parentGroupId === null)).toBe(true)
  })

  it('assigns every listed node to its volume group with a relative position', () => {
    const { nodeParents, nodePositions } = computeVolumeGroups({ volumes, volumeNodeIds })
    expect(nodeParents['char-1']).toBe('group-vol-1')
    expect(nodeParents['loc-10']).toBe('group-vol-1')
    expect(nodeParents['char-3']).toBe('group-vol-2')
    expect(nodeParents['thread-100']).toBe('group-vol-2')
    // relative positions are non-negative and inside the header offset
    for (const id of Object.keys(nodePositions)) {
      expect(nodePositions[id].x).toBeGreaterThanOrEqual(0)
      expect(nodePositions[id].y).toBeGreaterThanOrEqual(0)
    }
  })

  it('sizes a group to fit its node count', () => {
    const { groups } = computeVolumeGroups({ volumes, volumeNodeIds })
    const v1 = groups.find((g) => g.volumeId === 1) // 3 nodes → 2 rows
    const v2 = groups.find((g) => g.volumeId === 2) // 2 nodes → 1 row
    expect(v1.height).toBeGreaterThan(v2.height)
  })

  it('preserves existing manual (non-volume) groups untouched', () => {
    const existingGroups = [
      { id: 'group-manual-1', name: 'My cluster', x: 5, y: 5, width: 200, height: 100 }
    ]
    const { groups } = computeVolumeGroups({ volumes, volumeNodeIds, existingGroups })
    const manual = groups.find((g) => g.id === 'group-manual-1')
    expect(manual).toMatchObject({ name: 'My cluster', x: 5, y: 5 })
    expect(groups.filter((g) => g.volumeId != null)).toHaveLength(2)
  })

  it('re-running reuses the same volume group id (idempotent, no duplicates)', () => {
    const first = computeVolumeGroups({ volumes, volumeNodeIds })
    const second = computeVolumeGroups({
      volumes,
      volumeNodeIds,
      existingGroups: first.groups
    })
    expect(second.groups.filter((g) => g.volumeId != null)).toHaveLength(2)
    expect(second.groups.filter((g) => g.id === 'group-vol-1')).toHaveLength(1)
  })

  it('records volumes that ended up empty', () => {
    const { emptyVolumeIds } = computeVolumeGroups({
      volumes,
      volumeNodeIds: { 1: ['char-1'], 2: [] }
    })
    expect(emptyVolumeIds).toEqual([2])
  })

  it('does not overlap groups across rows (row y-stride ≥ tallest group)', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: `V${i + 1}` }))
    const ids = {}
    many.forEach(
      (v, i) => (ids[v.id] = Array.from({ length: (i + 1) * 2 }, (_, k) => `n-${i}-${k}`))
    )
    const { groups } = computeVolumeGroups({
      volumes: many,
      volumeNodeIds: ids,
      layout: { groupsPerRow: 3 }
    })
    const g = (id) => groups.find((x) => x.volumeId === id)
    // Row 2 (volume 4) must start below the bottom of the tallest row-1 group.
    const row1Bottom = Math.max(g(1).y + g(1).height, g(2).y + g(2).height, g(3).y + g(3).height)
    expect(g(4).y).toBeGreaterThanOrEqual(row1Bottom)
  })

  it('handles no volumes without throwing', () => {
    const res = computeVolumeGroups({ volumes: [], volumeNodeIds: {} })
    expect(res.groups).toEqual([])
    expect(res.nodeParents).toEqual({})
  })
})

describe('wouldCreateCycle', () => {
  // a -> b -> c  (parentOf[child] = parent)
  const parentOf = { c: 'b', b: 'a', a: null }

  it('flags parenting a group under itself', () => {
    expect(wouldCreateCycle('a', 'a', parentOf)).toBe(true)
  })

  it('flags parenting a group under its own descendant', () => {
    // Making 'a' a child of 'c' would create a cycle (c descends from a).
    expect(wouldCreateCycle('a', 'c', parentOf)).toBe(true)
  })

  it('allows a valid re-parent', () => {
    expect(wouldCreateCycle('c', 'a', parentOf)).toBe(false)
    expect(wouldCreateCycle('x', 'a', parentOf)).toBe(false)
  })
})

describe('sortGroupsParentFirst', () => {
  it('orders parents before their children', () => {
    const groups = [
      { id: 'child', parentGroupId: 'parent' },
      { id: 'grandchild', parentGroupId: 'child' },
      { id: 'parent', parentGroupId: null }
    ]
    const sorted = sortGroupsParentFirst(groups)
    const idx = (id) => sorted.findIndex((g) => g.id === id)
    expect(idx('parent')).toBeLessThan(idx('child'))
    expect(idx('child')).toBeLessThan(idx('grandchild'))
  })

  it('is stable for flat (unparented) groups', () => {
    const groups = [
      { id: 'a', parentGroupId: null },
      { id: 'b', parentGroupId: null }
    ]
    expect(sortGroupsParentFirst(groups).map((g) => g.id)).toEqual(['a', 'b'])
  })
})
