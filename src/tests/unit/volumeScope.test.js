import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Volume scoping decides what the writer is told about. Getting it wrong in the
 * generous direction wastes context; getting it wrong in the strict direction
 * deletes a character out from under a scene that was planned to use them. The
 * rules below encode which way each edge case falls.
 */

let volumes
let assignments

vi.mock('@/services/db-core', () => ({
  db: {
    volumes: {
      where: () => ({ equals: () => ({ toArray: async () => volumes }) })
    },
    volumeEntities: {
      where: () => ({
        anyOf: (ids) => ({
          toArray: async () => assignments.filter((a) => ids.includes(a.volumeId))
        })
      })
    }
  }
}))

let scopeBibleToVolume

const characters = [
  { id: 'c1', name: 'Kael' }, // volume 1 only
  { id: 'c2', name: 'Riven' }, // volume 2 only
  { id: 'c3', name: 'Sera' }, // both volumes — a protagonist
  { id: 'c4', name: 'Unassigned Ghost' } // never assigned anywhere
]
const locations = [{ id: 'l1', name: 'Ashfall Keep' }]
const plotThreads = [{ id: 't1', title: 'The Betrayal' }]

beforeEach(async () => {
  vi.resetModules()
  volumes = [{ id: 'v1' }, { id: 'v2' }]
  assignments = [
    { volumeId: 'v1', entityType: 'character', entityId: 'c1' },
    { volumeId: 'v2', entityType: 'character', entityId: 'c2' },
    { volumeId: 'v1', entityType: 'character', entityId: 'c3' },
    { volumeId: 'v2', entityType: 'character', entityId: 'c3' },
    { volumeId: 'v1', entityType: 'location', entityId: 'l1' },
    { volumeId: 'v1', entityType: 'plotThread', entityId: 't1' }
  ]
  scopeBibleToVolume = (await import('@/services/volumeScope')).scopeBibleToVolume
})

const run = (overrides = {}) =>
  scopeBibleToVolume({
    projectId: 'p1',
    volumeId: 'v1',
    characters,
    locations,
    plotThreads,
    ...overrides
  })

describe('scopeBibleToVolume', () => {
  it('keeps this volume’s cast and drops the other volume’s', async () => {
    const result = await run()
    const names = result.characters.map((c) => c.name)
    expect(names).toContain('Kael')
    expect(names).not.toContain('Riven')
    expect(result.scoped).toBe(true)
    expect(result.omitted).toBe(1)
  })

  // A protagonist assigned to every volume needs no special flag — being in the
  // volume is what puts them in scope.
  it('keeps a character assigned to several volumes in each of them', async () => {
    const v1 = await run({ volumeId: 'v1' })
    const v2 = await run({ volumeId: 'v2' })
    expect(v1.characters.map((c) => c.name)).toContain('Sera')
    expect(v2.characters.map((c) => c.name)).toContain('Sera')
  })

  // An entity that never opted into a volume cannot be excluded by one. This is
  // what keeps hand-authored entities from silently vanishing.
  it('keeps an entity that was never assigned to any volume', async () => {
    const result = await run()
    expect(result.characters.map((c) => c.name)).toContain('Unassigned Ghost')
  })

  it('keeps a character the plan explicitly names, even from another volume', async () => {
    const result = await run({ alwaysInclude: ['Riven'] })
    expect(result.characters.map((c) => c.name)).toContain('Riven')
    expect(result.omitted).toBe(0)
  })

  it('matches alwaysInclude names case- and whitespace-insensitively', async () => {
    const result = await run({ alwaysInclude: ['  rIvEn  '] })
    expect(result.characters.map((c) => c.name)).toContain('Riven')
  })

  describe('falls back to the full cast when scoping cannot be trusted', () => {
    it('when no volume is given', async () => {
      const result = await run({ volumeId: null })
      expect(result.characters).toHaveLength(4)
      expect(result.scoped).toBe(false)
    })

    it('when the project has only one volume — nothing to separate from', async () => {
      volumes = [{ id: 'v1' }]
      const result = await run()
      expect(result.characters).toHaveLength(4)
      expect(result.scoped).toBe(false)
    })

    it('when nothing has been assigned to a volume at all', async () => {
      assignments = []
      const result = await run()
      expect(result.characters).toHaveLength(4)
      expect(result.scoped).toBe(false)
    })

    // Better to over-supply the writer than to hand it a cast of nobody — an
    // empty result means the assignment data is wrong, not the story.
    it('when filtering would empty a non-empty list', async () => {
      assignments = [{ volumeId: 'v2', entityType: 'location', entityId: 'l1' }]
      const result = await run()
      expect(result.locations).toHaveLength(1) // kept whole rather than emptied
    })

    it('when the volumes table throws', async () => {
      volumes = null // .map will throw inside getProjectVolumeIds
      const result = await run()
      expect(result.characters).toHaveLength(4)
      expect(result.scoped).toBe(false)
    })
  })

  it('scopes locations and plot threads by the same rules', async () => {
    const v2 = await run({ volumeId: 'v2' })
    // l1 and t1 belong to v1 only, and v2 has assignments of its own, so both
    // are withheld — but neither list is emptied to nothing without cause.
    expect(v2.locations.map((l) => l.name)).toEqual(['Ashfall Keep']) // safety valve
    expect(v2.plotThreads.map((t) => t.title)).toEqual(['The Betrayal']) // safety valve
  })
})
