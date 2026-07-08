import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStoryBibleStore } from '@/stores/storyBibleStore'

const mockDbService = {
  getCharacters: vi.fn(() => []),
  addCharacter: vi.fn(() => 1),
  updateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  getLocations: vi.fn(() => []),
  addLocation: vi.fn(() => 2),
  updateLocation: vi.fn(),
  deleteLocation: vi.fn(),
  getPlotThreads: vi.fn(() => []),
  addPlotThread: vi.fn(() => 3),
  updatePlotThread: vi.fn(),
  deletePlotThread: vi.fn(),
  deleteCharacterRelationshipsByCharacter: vi.fn()
}

const mockDbGraph = {
  deleteGraphEdgesByEntity: vi.fn(),
  removeEntityFromNodeInstances: vi.fn(),
  removeEntityFromNodePositions: vi.fn(),
  removeEntityFromNodeParents: vi.fn()
}

const mockDbEntities = {
  saveVoiceProfile: vi.fn(),
  loadVoiceProfile: vi.fn(() => null)
}

const mockProjectStore = {
  currentProjectId: 'proj1'
}

const mockStoryDocuments = {
  regenerateAllDocuments: vi.fn(() => Promise.resolve()),
  regenerateDocument: vi.fn(() => Promise.resolve())
}

vi.mock('@/services/dbService', () => ({
  getCharacters: (...args) => mockDbService.getCharacters(...args),
  addCharacter: (...args) => mockDbService.addCharacter(...args),
  updateCharacter: (...args) => mockDbService.updateCharacter(...args),
  deleteCharacter: (...args) => mockDbService.deleteCharacter(...args),
  getLocations: (...args) => mockDbService.getLocations(...args),
  addLocation: (...args) => mockDbService.addLocation(...args),
  updateLocation: (...args) => mockDbService.updateLocation(...args),
  deleteLocation: (...args) => mockDbService.deleteLocation(...args),
  getPlotThreads: (...args) => mockDbService.getPlotThreads(...args),
  addPlotThread: (...args) => mockDbService.addPlotThread(...args),
  updatePlotThread: (...args) => mockDbService.updatePlotThread(...args),
  deletePlotThread: (...args) => mockDbService.deletePlotThread(...args),
  deleteCharacterRelationshipsByCharacter: (...args) => mockDbService.deleteCharacterRelationshipsByCharacter(...args)
}))

vi.mock('@/services/db-graph', () => ({
  deleteGraphEdgesByEntity: (...args) => mockDbGraph.deleteGraphEdgesByEntity(...args),
  removeEntityFromNodeInstances: (...args) => mockDbGraph.removeEntityFromNodeInstances(...args),
  removeEntityFromNodePositions: (...args) => mockDbGraph.removeEntityFromNodePositions(...args),
  removeEntityFromNodeParents: (...args) => mockDbGraph.removeEntityFromNodeParents(...args)
}))

vi.mock('@/services/db-entities', () => ({
  saveVoiceProfile: (...args) => mockDbEntities.saveVoiceProfile(...args),
  loadVoiceProfile: (...args) => mockDbEntities.loadVoiceProfile(...args)
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

vi.mock('@/composables/useStoryDocuments', () => ({
  useStoryDocuments: () => mockStoryDocuments
}))

vi.mock('@/services/debugSnapshot', () => ({
  debugSnapshot: vi.fn()
}))

describe('storyBibleStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useStoryBibleStore()
  })

  it('initializes with default values', () => {
    expect(store.characters).toEqual([])
    expect(store.locations).toEqual([])
    expect(store.plotThreads).toEqual([])
    expect(store.isLoading).toBe(false)
    expect(store.loadError).toBeNull()
    expect(store.storyBibleReady).toBe(false)
    expect(store.voiceProfile.isExtracted).toBe(false)
    expect(store.voiceProfile.profile).toBeNull()
  })

  describe('loadAll', () => {
    it('loads all entity types and regenerates documents', async () => {
      mockDbService.getCharacters.mockResolvedValue([{ id: 1, name: 'Alice' }])
      mockDbService.getLocations.mockResolvedValue([{ id: 2, name: 'Forest' }])
      mockDbService.getPlotThreads.mockResolvedValue([{ id: 3, title: 'Main' }])

      await store.loadAll('proj1')

      expect(mockDbService.getCharacters).toHaveBeenCalledWith('proj1')
      expect(mockDbService.getLocations).toHaveBeenCalledWith('proj1')
      expect(mockDbService.getPlotThreads).toHaveBeenCalledWith('proj1')
      expect(mockStoryDocuments.regenerateAllDocuments).toHaveBeenCalledWith('proj1')
      expect(store.characters).toEqual([{ id: 1, name: 'Alice' }])
      expect(store.locations).toEqual([{ id: 2, name: 'Forest' }])
      expect(store.plotThreads).toEqual([{ id: 3, title: 'Main' }])
      expect(store.isLoading).toBe(false)
      expect(store.storyBibleReady).toBe(true)
    })
  })

  describe('characters', () => {
    it('addCharacterData adds character and queues regen', async () => {
      await store.addCharacterData('proj1', { name: 'Alice' })
      expect(mockDbService.addCharacter).toHaveBeenCalledWith('proj1', { name: 'Alice', source: 'manual', chapterId: null })
      expect(store.characters.length).toBe(1)
      expect(store.characters[0].name).toBe('Alice')
    })

    it('updateCharacterData updates character', async () => {
      mockDbService.getCharacters.mockResolvedValue([{ id: 1, name: 'Alice' }])
      await store.loadAll('proj1')
      await store.updateCharacterData(1, { name: 'Alice Updated' }, 'proj1')
      expect(mockDbService.updateCharacter).toHaveBeenCalledWith(1, { name: 'Alice Updated', lastEditedAt: expect.any(Number) })
      expect(store.characters[0].name).toBe('Alice Updated')
    })

    it('deleteCharacterData removes character with cleanup', async () => {
      mockDbService.getCharacters.mockResolvedValue([{ id: 1, name: 'Alice' }])
      await store.loadAll('proj1')
      await store.deleteCharacterData(1, 'proj1')
      expect(mockDbService.deleteCharacterRelationshipsByCharacter).toHaveBeenCalledWith(1)
      expect(mockDbGraph.deleteGraphEdgesByEntity).toHaveBeenCalledWith('proj1', 'character', 1)
      expect(mockDbService.deleteCharacter).toHaveBeenCalledWith(1)
      expect(store.characters).toEqual([])
    })
  })

  describe('locations', () => {
    it('addLocationData adds location', async () => {
      await store.addLocationData('proj1', { name: 'Forest' })
      expect(mockDbService.addLocation).toHaveBeenCalledWith('proj1', { name: 'Forest', source: 'manual', chapterId: null })
    })

    it('deleteLocationData removes location', async () => {
      mockDbService.getLocations.mockResolvedValue([{ id: 2, name: 'Forest' }])
      await store.loadAll('proj1')
      await store.deleteLocationData(2, 'proj1')
      expect(mockDbService.deleteLocation).toHaveBeenCalledWith(2)
      expect(store.locations).toEqual([])
    })
  })

  describe('plotThreads', () => {
    it('addPlotThreadData adds thread with timeline order', async () => {
      await store.addPlotThreadData('proj1', { title: 'Main' })
      expect(mockDbService.addPlotThread).toHaveBeenCalledWith('proj1', { title: 'Main', source: 'manual', chapterId: null, timelineOrder: 1 })
    })

    it('updateThreadStatus updates thread status', async () => {
      mockDbService.getPlotThreads.mockResolvedValue([{ id: 3, title: 'Main', status: 'active' }])
      await store.loadAll('proj1')
      await store.updateThreadStatus(3, 'completed', 'proj1')
      expect(mockDbService.updatePlotThread).toHaveBeenCalledWith(3, { status: 'completed' })
    })

    it('reorderPlotThreads updates order', async () => {
      mockDbService.getPlotThreads.mockResolvedValue([{ id: 3, title: 'Main' }, { id: 4, title: 'Sub' }])
      await store.loadAll('proj1')
      await store.reorderPlotThreads([4, 3])
      expect(mockDbService.updatePlotThread).toHaveBeenCalledWith(4, { timelineOrder: 0 })
      expect(mockDbService.updatePlotThread).toHaveBeenCalledWith(3, { timelineOrder: 1 })
    })
  })

  describe('getCharacterNames', () => {
    it('returns list of character names', () => {
      mockDbService.getCharacters.mockResolvedValue([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])
      store.characters = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
      expect(store.getCharacterNames()).toEqual(['Alice', 'Bob'])
    })
  })

  describe('voiceProfile', () => {
    it('setVoiceProfile updates state and persists', async () => {
      const profile = { manuscriptSizeAtExtraction: 1000, supplementaryMergeCount: 2 }
      await store.setVoiceProfile(profile)
      expect(store.voiceProfile.isExtracted).toBe(true)
      expect(store.voiceProfile.profile).toStrictEqual(profile)
      expect(mockDbEntities.saveVoiceProfile).toHaveBeenCalledWith('proj1', expect.objectContaining({
        isExtracted: true
      }))
    })

    it('lockVoiceProfile toggles lock', () => {
      expect(store.voiceProfile.locked).toBe(false)
      store.lockVoiceProfile()
      expect(store.voiceProfile.locked).toBe(true)
      store.lockVoiceProfile()
      expect(store.voiceProfile.locked).toBe(false)
    })

    it('loadVoiceProfileForProject loads saved profile', async () => {
      const saved = { isExtracted: true, profile: { voice: 'narrator' }, locked: true }
      mockDbEntities.loadVoiceProfile.mockResolvedValue(saved)
      await store.loadVoiceProfileForProject('proj1')
      expect(mockDbEntities.loadVoiceProfile).toHaveBeenCalledWith('proj1')
      expect(store.voiceProfile.isExtracted).toBe(true)
      expect(store.voiceProfile.locked).toBe(true)
    })
  })
})
