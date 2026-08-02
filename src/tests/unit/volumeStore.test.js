import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVolumeStore } from '@/stores/volumeStore'

vi.mock('@/services/dbService', () => ({
  getVolumes: vi.fn(),
  addVolume: vi.fn(),
  updateVolume: vi.fn(),
  deleteVolume: vi.fn(),
  assignSectionToVolume: vi.fn(),
  removeSectionFromVolume: vi.fn(),
  // Membership is derived from the sections rather than stored on the volume
  // row, so loading a volume now consults these.
  getSectionIdsByVolume: vi.fn().mockResolvedValue({}),
  unassignAllSectionsFromVolume: vi.fn().mockResolvedValue(0),
  getVolumeEntityCount: vi.fn().mockResolvedValue(0)
}))

const mockDb = await import('@/services/dbService')

describe('volumeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with empty volumes', () => {
    const store = useVolumeStore()
    expect(store.volumes).toEqual([])
    expect(store.isLoading).toBe(false)
  })

  it('loads volumes and entity counts', async () => {
    const mockVolumes = [{ id: 'v1', name: 'Vol 1', color: '#6366f1', sectionIds: [] }]
    mockDb.getVolumes.mockResolvedValue(mockVolumes)

    const store = useVolumeStore()
    await store.loadVolumes('p1')

    expect(store.volumes).toHaveLength(1)
    expect(store.volumes[0].name).toBe('Vol 1')
    expect(store.volumes[0].entityCounts).toBeDefined()
    expect(mockDb.getVolumes).toHaveBeenCalledWith('p1')
  })

  it('creates a volume', async () => {
    mockDb.addVolume.mockResolvedValue('new-id')
    const store = useVolumeStore()
    await store.createVolume('p1', { name: 'New Vol', color: '#22c55e' })
    expect(store.volumes).toHaveLength(1)
    expect(store.volumes[0].id).toBe('new-id')
    expect(store.volumes[0].name).toBe('New Vol')
  })

  it('updates volume data', async () => {
    const store = useVolumeStore()
    store.volumes = [{ id: 'v1', name: 'Old', color: '#000', sectionIds: [] }]
    await store.updateVolumeData('v1', { name: 'Updated' }, 'p1')
    expect(store.volumes[0].name).toBe('Updated')
    expect(mockDb.updateVolume).toHaveBeenCalledWith('v1', { name: 'Updated' })
  })

  it('deletes a volume and detaches its chapters by querying them', async () => {
    // Previously this walked the in-memory `sectionIds`. That list is only ever
    // populated in the session that made the assignment, so on a freshly loaded
    // project it was empty and the chapters were left holding a volumeId
    // pointing at a volume that no longer existed. Detaching by query does not
    // depend on what happens to be in memory — note this test seeds NO
    // sectionIds, which is what a reload actually looks like.
    const store = useVolumeStore()
    store.volumes = [{ id: 'v1', name: 'Vol', sectionIds: [] }]
    await store.deleteVolumeData('v1', 'p1')
    expect(store.volumes).toHaveLength(0)
    expect(mockDb.unassignAllSectionsFromVolume).toHaveBeenCalledWith('v1')
    expect(mockDb.deleteVolume).toHaveBeenCalledWith('v1')
  })

  it('assigns chapter to volume', async () => {
    const store = useVolumeStore()
    store.volumes = [
      { id: 'v1', sectionIds: [] },
      { id: 'v2', sectionIds: ['ch1'] }
    ]
    await store.assignSection('ch1', 'v1', 'p1')
    expect(mockDb.assignSectionToVolume).toHaveBeenCalledWith('ch1', 'v1')
    expect(store.volumes[0].sectionIds).toContain('ch1')
    expect(store.volumes[1].sectionIds).not.toContain('ch1')
  })

  it('removes chapter from all volumes', async () => {
    const store = useVolumeStore()
    store.volumes = [
      { id: 'v1', sectionIds: ['ch1', 'ch2'] },
      { id: 'v2', sectionIds: ['ch1'] }
    ]
    await store.removeSection('ch1', 'p1')
    expect(store.volumes[0].sectionIds).toEqual(['ch2'])
    expect(store.volumes[1].sectionIds).toEqual([])
  })

  it('finds volume containing a chapter', () => {
    const store = useVolumeStore()
    store.volumes = [
      { id: 'v1', sectionIds: ['ch1'] },
      { id: 'v2', sectionIds: ['ch2'] }
    ]
    expect(store.getVolumeForSection('ch2').id).toBe('v2')
    expect(store.getVolumeForSection('ch3')).toBeUndefined()
  })

  it('gets next available color', () => {
    const store = useVolumeStore()
    store.volumes = []
    expect(store.getNextColor()).toBe(store.VOLUME_COLORS[0])
  })

  it('skips colors already in use', () => {
    // The generator creates volumes in a loop and used to hardcode
    // VOLUME_COLORS[0] for every one of them, so a five-volume story produced
    // five identically-coloured volumes. It now calls getNextColor(), which
    // only helps if this property holds.
    //
    // Asserted against the palette rather than against literal hexes: the
    // property under test is "returns the first UNUSED entry", not "returns
    // #8b5cf6". Pinning the hex would turn any future palette change into a
    // failing test that says nothing about the behaviour.
    const store = useVolumeStore()
    store.volumes = [{ id: 'v1', color: store.VOLUME_COLORS[0] }]
    expect(store.getNextColor()).toBe(store.VOLUME_COLORS[1])

    store.volumes.push({ id: 'v2', color: store.VOLUME_COLORS[1] })
    expect(store.getNextColor()).toBe(store.VOLUME_COLORS[2])
  })

  it('assigns distinct colors across a sequence of volumes', () => {
    const store = useVolumeStore()
    store.volumes = []
    const assigned = []
    for (let i = 0; i < 5; i++) {
      const color = store.getNextColor()
      assigned.push(color)
      // Mirrors createVolume, which pushes to volumes.value before returning —
      // the property the generator's loop depends on.
      store.volumes.push({ id: `v${i}`, color })
    }
    expect(new Set(assigned).size).toBe(5)
  })

  it('cycles rather than returning undefined once the palette is exhausted', () => {
    const store = useVolumeStore()
    store.volumes = store.VOLUME_COLORS.map((color, i) => ({ id: `v${i}`, color }))
    expect(store.VOLUME_COLORS).toContain(store.getNextColor())
  })
})
