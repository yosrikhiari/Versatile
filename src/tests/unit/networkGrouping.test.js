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

  // The in-memory idempotency above passes because `first.groups` still carries
  // volumeId. Persisted groups did not: `saveGraphGroups`/`getGraphGroups` only
  // round-tripped id/name/color/geometry, so after a reload every volume group
  // came back with volumeId null — matching failed, a SECOND group was built
  // with the same deterministic `group-vol-N` id, and the bulkAdd that saves
  // them hit a duplicate primary key. Auto-running this on every generation
  // would have hit it constantly.
  it('adopts a persisted volume group that came back without its volumeId', () => {
    const reloaded = [
      { id: 'group-vol-1', name: 'Volume I', x: 0, y: 0, width: 300, height: 200 },
      { id: 'group-vol-2', name: 'Volume II', x: 0, y: 0, width: 300, height: 200 }
    ]
    const { groups } = computeVolumeGroups({ volumes, volumeNodeIds, existingGroups: reloaded })

    const ids = groups.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicate primary keys
    expect(groups.filter((g) => g.id === 'group-vol-1')).toHaveLength(1)
    // and the orphaned group is re-linked rather than abandoned
    expect(groups.find((g) => g.id === 'group-vol-1').volumeId).toBe(1)
    expect(groups.find((g) => g.id === 'group-vol-2').volumeId).toBe(2)
  })

  it('still matches on volumeId when the id scheme differs', () => {
    const legacy = [
      { id: 'group-legacy-xyz', name: 'Old name', volumeId: 1, x: 7, y: 7, width: 300, height: 200 }
    ]
    const { groups } = computeVolumeGroups({ volumes, volumeNodeIds, existingGroups: legacy })
    const v1 = groups.filter((g) => g.volumeId === 1)
    expect(v1).toHaveLength(1)
    expect(v1[0].id).toBe('group-legacy-xyz') // reused, not replaced
    expect(v1[0].name).toBe('Volume I') // renamed to match the volume
  })

  // Factions are created during planning, tagged with parentVolumeId, before the
  // volume's box exists. This pass is where the nesting actually resolves.
  describe('faction sub-groups', () => {
    const faction = {
      id: 'group-faction-the-shadow-court',
      name: 'The Shadow Court',
      parentVolumeId: 1,
      parentGroupId: null,
      x: 0,
      y: 0,
      width: 300,
      height: 200
    }
    // char-1 and char-2 are in the faction; loc-10 is loose in the volume.
    const existingNodeParents = {
      'char-1': 'group-faction-the-shadow-court',
      'char-2': 'group-faction-the-shadow-court'
    }

    it('nests the faction inside its volume box', () => {
      const { groups } = computeVolumeGroups({
        volumes,
        volumeNodeIds,
        existingGroups: [faction],
        existingNodeParents
      })
      const nested = groups.find((g) => g.id === faction.id)
      expect(nested.parentGroupId).toBe('group-vol-1')
    })

    it('leaves faction members with the faction rather than reclaiming them', () => {
      const { nodeParents } = computeVolumeGroups({
        volumes,
        volumeNodeIds,
        existingGroups: [faction],
        existingNodeParents
      })
      expect(nodeParents['char-1']).toBe(faction.id)
      expect(nodeParents['char-2']).toBe(faction.id)
      expect(nodeParents['loc-10']).toBe('group-vol-1') // loose node still claimed
    })

    it('grows the volume box to contain the faction it holds', () => {
      const without = computeVolumeGroups({ volumes, volumeNodeIds })
      const with_ = computeVolumeGroups({
        volumes,
        volumeNodeIds,
        existingGroups: [faction],
        existingNodeParents
      })
      const v1Without = without.groups.find((g) => g.id === 'group-vol-1')
      const v1With = with_.groups.find((g) => g.id === 'group-vol-1')
      expect(v1With.height).toBeGreaterThan(v1Without.height)

      // and the faction sits inside its parent's bounds
      const nested = with_.groups.find((g) => g.id === faction.id)
      expect(nested.y + nested.height).toBeLessThanOrEqual(v1With.height)
      expect(nested.width).toBeLessThanOrEqual(v1With.width)
    })

    it('ignores a faction pointing at a volume that no longer exists', () => {
      const orphan = { ...faction, parentVolumeId: 99 }
      const { groups, nodeParents } = computeVolumeGroups({
        volumes,
        volumeNodeIds,
        existingGroups: [orphan],
        existingNodeParents
      })
      // Left top-level rather than parented to a group that isn't there.
      expect(groups.find((g) => g.id === orphan.id).parentGroupId).toBeNull()
      // Its members fall back to the volume box so they stay visible.
      expect(nodeParents['char-1']).toBe('group-vol-1')
    })
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
