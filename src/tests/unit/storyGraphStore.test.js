import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStoryGraphStore } from '@/stores/storyGraphStore'

const mockDb = {
  getGraphEdges: vi.fn(() => ({ data: [] })),
  addGraphEdge: vi.fn(() => 1),
  updateGraphEdge: vi.fn(),
  deleteGraphEdge: vi.fn(),
  clearAllGraphEdges: vi.fn(),
  getNodePositions: vi.fn(() => ({})),
  saveNodePositions: vi.fn(),
  getNodeInstances: vi.fn(() => ({})),
  dbSaveNodeInstances: vi.fn(),
  getCharacterRelationships: vi.fn(() => []),
  deleteCharacterRelationship: vi.fn(),
  getGraphGroups: vi.fn(() => []),
  saveGraphGroups: vi.fn(),
  dbGetNodeParents: vi.fn(() => []),
  dbSaveNodeParents: vi.fn(),
  getGroupEdges: vi.fn(() => []),
  addGroupEdge: vi.fn(() => 2),
  updateGroupEdge: vi.fn(),
  deleteGroupEdge: vi.fn()
}

const mockStoryBibleStore = {
  getCharacterNames: vi.fn(() => []),
  characters: [],
  locations: [],
  plotThreads: []
}

vi.mock('@/services/dbService', () => ({
  getGraphEdges: (...args) => mockDb.getGraphEdges(...args),
  addGraphEdge: (...args) => mockDb.addGraphEdge(...args),
  updateGraphEdge: (...args) => mockDb.updateGraphEdge(...args),
  deleteGraphEdge: (...args) => mockDb.deleteGraphEdge(...args),
  clearAllGraphEdges: (...args) => mockDb.clearAllGraphEdges(...args),
  getNodePositions: (...args) => mockDb.getNodePositions(...args),
  saveNodePositions: (...args) => mockDb.saveNodePositions(...args),
  getNodeInstances: (...args) => mockDb.getNodeInstances(...args),
  saveNodeInstances: (...args) => mockDb.dbSaveNodeInstances(...args),
  getCharacterRelationships: (...args) => mockDb.getCharacterRelationships(...args),
  deleteCharacterRelationship: (...args) => mockDb.deleteCharacterRelationship(...args),
  getGraphGroups: (...args) => mockDb.getGraphGroups(...args),
  saveGraphGroups: (...args) => mockDb.saveGraphGroups(...args),
  getNodeParents: (...args) => mockDb.dbGetNodeParents(...args),
  saveNodeParents: (...args) => mockDb.dbSaveNodeParents(...args),
  getGroupEdges: (...args) => mockDb.getGroupEdges(...args),
  addGroupEdge: (...args) => mockDb.addGroupEdge(...args),
  updateGroupEdge: (...args) => mockDb.updateGroupEdge(...args),
  deleteGroupEdge: (...args) => mockDb.deleteGroupEdge(...args)
}))

vi.mock('@/stores/storyBibleStore', () => ({
  useStoryBibleStore: () => mockStoryBibleStore
}))

describe('storyGraphStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useStoryGraphStore()
  })

  it('initializes with default values', () => {
    expect(store.edges).toEqual([])
    expect(store.groupEdges).toEqual([])
    expect(store.nodePositions).toEqual({})
    expect(store.nodeInstances).toEqual({})
    expect(store.selectedEdge).toBeNull()
    expect(store.selectedNode).toBeNull()
    expect(store.missingCharacterPositions).toEqual([])
    expect(store.selectedEdge).toBeNull()
    expect(store.selectedNode).toBeNull()
  })

  describe('loadEdges', () => {
    it('loads all edges for project', async () => {
      mockDb.getGraphEdges.mockResolvedValue([{ id: 1, source: 'A', target: 'B' }])

      await store.loadEdges('proj1')

      expect(mockDb.getGraphEdges).toHaveBeenCalledWith('proj1')
      expect(mockDb.getCharacterRelationships).toHaveBeenCalledWith('proj1')
      expect(store.edges.length).toBe(1)
    })
  })

  describe('addEdgeData', () => {
    it('adds edge to db and state', async () => {
      mockDb.addGraphEdge.mockResolvedValue(1)
      const data = { source: 'A', target: 'B', relationshipType: 'ally', projectId: 'proj1' }
      await store.addEdgeData('proj1', data)
      expect(mockDb.addGraphEdge).toHaveBeenCalledWith('proj1', data)
      expect(store.edges.length).toBe(1)
      expect(store.edges[0].id).toBe(1)
    })
  })

  describe('deleteEdgeData', () => {
    it('deletes edge from db and state', async () => {
      store.edges = [{ id: 1, source: 'A', target: 'B' }]
      await store.deleteEdgeData(1)
      expect(mockDb.deleteGraphEdge).toHaveBeenCalledWith(1)
      expect(store.edges).toEqual([])
    })
  })

  describe('nodePositions', () => {
    it('saveNodePosition saves position and reloads', async () => {
      await store.saveNodePosition('proj1', 'char1', { x: 100, y: 200 })
      expect(mockDb.saveNodePositions).toHaveBeenCalledWith('proj1', { char1: { x: 100, y: 200 } })
    })

    it('loadNodePositions loads and cleans positions', async () => {
      mockStoryBibleStore.characters = [{ id: 1 }]
      const positions = { 'char-1': { x: 100, y: 200 } }
      mockDb.getNodePositions.mockResolvedValue(positions)
      await store.loadNodePositions('proj1')
      expect(mockDb.getNodePositions).toHaveBeenCalledWith('proj1')
      expect(store.nodePositions).toEqual(positions)
    })
  })

  describe('loadGroups', () => {
    it('loads graph groups for project', async () => {
      mockDb.getGraphGroups.mockResolvedValue([{ id: 1, name: 'Group1' }])
      const result = await store.loadGroups('proj1')
      expect(mockDb.getGraphGroups).toHaveBeenCalledWith('proj1')
      expect(result).toEqual([{ id: 1, name: 'Group1' }])
    })
  })

  describe('clearEdges', () => {
    it('clears all edges for project', async () => {
      await store.clearAllEdges('proj1')
      expect(mockDb.clearAllGraphEdges).toHaveBeenCalledWith('proj1')
      expect(store.edges).toEqual([])
    })
  })
})
