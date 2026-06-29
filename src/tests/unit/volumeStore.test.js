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

  it('deletes a volume and removes chapters', async () => {
    const store = useVolumeStore()
    store.volumes = [{ id: 'v1', name: 'Vol', sectionIds: ['ch1', 'ch2'] }]
    await store.deleteVolumeData('v1', 'p1')
    expect(store.volumes).toHaveLength(0)
    expect(mockDb.removeSectionFromVolume).toHaveBeenCalledTimes(2)
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
    expect(store.getNextColor()).toBe('#6366f1')
  })
})
