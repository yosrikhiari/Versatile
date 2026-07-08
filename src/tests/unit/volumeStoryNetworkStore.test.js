import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVolumeStoryNetworkStore } from '@/stores/volumeStoryNetworkStore'

const mockDb = {
  getVolumeEntities: vi.fn(() => []),
  getVolumeEntityCount: vi.fn(() => 0),
  getVolumeEdges: vi.fn(() => []),
  addEntityToVolume: vi.fn(() => 1),
  removeEntityFromVolume: vi.fn(),
  removeEntityFromAllVolumes: vi.fn(),
  addVolumeEdge: vi.fn(() => 2)
}

vi.mock('@/services/dbService', () => ({
  getVolumeEntities: (...args) => mockDb.getVolumeEntities(...args),
  getVolumeEntityCount: (...args) => mockDb.getVolumeEntityCount(...args),
  getVolumeEdges: (...args) => mockDb.getVolumeEdges(...args),
  addEntityToVolume: (...args) => mockDb.addEntityToVolume(...args),
  removeEntityFromVolume: (...args) => mockDb.removeEntityFromVolume(...args),
  removeEntityFromAllVolumes: (...args) => mockDb.removeEntityFromAllVolumes(...args),
  addVolumeEdge: (...args) => mockDb.addVolumeEdge(...args)
}))

describe('volumeStoryNetworkStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useVolumeStoryNetworkStore()
  })

  it('initializes with default values', () => {
    expect(store.volumeEntities).toEqual({})
    expect(store.volumeEdges).toEqual({})
    expect(store.loading).toBe(false)
  })

  describe('loadVolumeEntities', () => {
    it('loads entities for a volume', async () => {
      const entities = [{ id: 1, type: 'character', name: 'Alice' }]
      mockDb.getVolumeEntities.mockResolvedValue(entities)
      await store.loadVolumeEntities('vol1')
      expect(mockDb.getVolumeEntities).toHaveBeenCalledWith(null, 'vol1', null)
      expect(store.volumeEntities).toEqual({ vol1: { all: entities } })
      expect(store.loading).toBe(false)
    })

    it('loads entities filtered by type', async () => {
      const entities = [{ id: 1, type: 'location', name: 'Forest' }]
      mockDb.getVolumeEntities.mockResolvedValue(entities)
      await store.loadVolumeEntities('vol1', 'location')
      expect(mockDb.getVolumeEntities).toHaveBeenCalledWith(null, 'vol1', 'location')
    })
  })

  describe('loadVolumeEdges', () => {
    it('loads edges for a volume', async () => {
      const edges = [{ id: 1, sourceId: 1, targetId: 2 }]
      mockDb.getVolumeEdges.mockResolvedValue(edges)
      await store.loadVolumeEdges('vol1')
      expect(mockDb.getVolumeEdges).toHaveBeenCalledWith('vol1', true)
      expect(store.volumeEdges).toEqual({ vol1: edges })
      expect(store.loading).toBe(false)
    })
  })

  describe('loadVolumeSubgraph', () => {
    it('loads both entities and edges for a volume', async () => {
      mockDb.getVolumeEntities.mockResolvedValue([])
      mockDb.getVolumeEdges.mockResolvedValue([])
      await store.loadVolumeSubgraph('vol1')
      expect(mockDb.getVolumeEntities).toHaveBeenCalledTimes(3)
      expect(mockDb.getVolumeEntities).toHaveBeenCalledWith(null, 'vol1', 'character')
      expect(mockDb.getVolumeEntities).toHaveBeenCalledWith(null, 'vol1', 'location')
      expect(mockDb.getVolumeEntities).toHaveBeenCalledWith(null, 'vol1', 'plotThread')
      expect(mockDb.getVolumeEdges).toHaveBeenCalledWith('vol1', true)
    })
  })

  describe('assignEntityToVolume', () => {
    it('adds entity to volume and refreshes cache', async () => {
      mockDb.addEntityToVolume.mockResolvedValue(1)
      await store.assignEntityToVolume('character', 1, 'vol1')
      expect(mockDb.addEntityToVolume).toHaveBeenCalledWith(null, 'character', 1, 'vol1', false)
      expect(store.volumeEntities).toEqual({})
    })

    it('passes isPrimary when provided', async () => {
      mockDb.getVolumeEntities.mockResolvedValue([])
      await store.assignEntityToVolume('character', 1, 'vol1', true)
      expect(mockDb.addEntityToVolume).toHaveBeenCalledWith(null, 'character', 1, 'vol1', true)
    })
  })

  describe('removeEntityFromVolume', () => {
    it('removes entity and refreshes cache', async () => {
      mockDb.getVolumeEntities.mockResolvedValue([])
      await store.removeEntityFromVolume('character', 1, 'vol1')
      expect(mockDb.removeEntityFromVolume).toHaveBeenCalledWith('character', 1, 'vol1')
    })
  })

  describe('createVolumeEdge', () => {
    it('creates edge and refreshes edges cache', async () => {
      mockDb.getVolumeEdges.mockResolvedValue([])
      await store.createVolumeEdge('proj1', 'character', 1, 'location', 2, 'lives-in', 'vol1')
      expect(mockDb.addVolumeEdge).toHaveBeenCalledWith('proj1', 'character', 1, 'location', 2, 'lives-in', 'vol1')
    })

    it('creates edge without volumeId', async () => {
      mockDb.getVolumeEdges.mockResolvedValue([])
      await store.createVolumeEdge('proj1', 'character', 1, 'character', 2, 'knows')
      expect(mockDb.addVolumeEdge).toHaveBeenCalledWith('proj1', 'character', 1, 'character', 2, 'knows', null)
    })
  })

  describe('getCachedEntities and getCachedEdges', () => {
    it('returns cached entities for volume', () => {
      store.volumeEntities = { vol1: { all: [{ id: 1, name: 'Alice' }] } }
      expect(store.getCachedEntities('vol1')).toEqual([{ id: 1, name: 'Alice' }])
    })

    it('returns cached edges for volume', () => {
      store.volumeEdges = { vol1: [{ id: 1 }] }
      expect(store.getCachedEdges('vol1')).toEqual([{ id: 1 }])
    })
  })

  describe('getVolumeEntityCounts', () => {
    it('fetches entity counts for volume', async () => {
      mockDb.getVolumeEntityCount.mockResolvedValue(5)
      const result = await store.getVolumeEntityCounts('vol1')
      expect(mockDb.getVolumeEntityCount).toHaveBeenCalledTimes(3)
      expect(mockDb.getVolumeEntityCount).toHaveBeenCalledWith('vol1', 'character')
      expect(mockDb.getVolumeEntityCount).toHaveBeenCalledWith('vol1', 'location')
      expect(mockDb.getVolumeEntityCount).toHaveBeenCalledWith('vol1', 'plotThread')
      expect(result).toEqual({ character: 5, location: 5, plotThread: 5 })
    })
  })
})
