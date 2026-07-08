import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSnapshotStore } from '@/stores/snapshotStore'

const mockDb = {
  addSnapshot: vi.fn(() => 1),
  getSnapshots: vi.fn(() => [{ id: 1, chapterId: 'ch1', timestamp: '2025-01-01', wordCount: 100 }]),
  getSnapshot: vi.fn(() => ({ id: 1, chapterId: 'ch1', content: 'text' })),
  deleteSnapshot: vi.fn(() => undefined),
  updateSubsection: vi.fn(() => undefined)
}

vi.mock('@/services/dbService', () => ({
  addSnapshot: (...args) => mockDb.addSnapshot(...args),
  getSnapshots: (...args) => mockDb.getSnapshots(...args),
  getSnapshot: (...args) => mockDb.getSnapshot(...args),
  deleteSnapshot: (...args) => mockDb.deleteSnapshot(...args),
  updateSubsection: (...args) => mockDb.updateSubsection(...args)
}))

describe('snapshotStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useSnapshotStore()
  })

  it('initializes with default values', () => {
    expect(store.snapshots).toEqual([])
    expect(store.isLoading).toBe(false)
    expect(store.autoSaveEnabled).toBe(true)
    expect(store.autoSaveInterval).toBe(5)
  })

  describe('loadSnapshots', () => {
    it('loads snapshots for a project and chapter', async () => {
      await store.loadSnapshots('proj1', 'ch1')
      expect(mockDb.getSnapshots).toHaveBeenCalledWith('proj1', 'ch1')
      expect(store.snapshots).toEqual([{ id: 1, chapterId: 'ch1', timestamp: '2025-01-01', wordCount: 100 }])
      expect(store.isLoading).toBe(false)
    })

    it('loads snapshots for a project without chapter', async () => {
      mockDb.getSnapshots.mockResolvedValue([])
      await store.loadSnapshots('proj1')
      expect(mockDb.getSnapshots).toHaveBeenCalledWith('proj1', null)
    })
  })

  describe('saveNewSnapshot', () => {
    it('creates snapshot and reloads for chapter', async () => {
      mockDb.getSnapshots.mockResolvedValue([{ id: 1, chapterId: 'ch1', wordCount: 100 }])
      const id = await store.saveNewSnapshot('proj1', 'ch1', 'content', 'manual')
      expect(mockDb.addSnapshot).toHaveBeenCalledWith('proj1', 'ch1', 'content', 'manual')
      expect(id).toBe(1)
    })

    it('returns null when projectId or chapterId missing', async () => {
      const id = await store.saveNewSnapshot(null, 'ch1', 'content')
      expect(id).toBeNull()
    })
  })

  describe('restoreSnapshot', () => {
    it('restores snapshot content to scene', async () => {
      const result = await store.restoreSnapshot(1, 'proj1')
      expect(mockDb.getSnapshot).toHaveBeenCalledWith(1)
      expect(mockDb.updateSubsection).toHaveBeenCalledWith('ch1', { content: 'text' })
      expect(result).toEqual({ id: 1, chapterId: 'ch1', content: 'text' })
    })

    it('returns null when snapshot not found', async () => {
      mockDb.getSnapshot.mockResolvedValue(null)
      const result = await store.restoreSnapshot(999, 'proj1')
      expect(result).toBeNull()
    })
  })

  describe('removeSnapshot', () => {
    it('deletes snapshot and reloads for chapter', async () => {
      mockDb.getSnapshots.mockResolvedValue([])
      await store.removeSnapshot(1, 'proj1')
      expect(mockDb.getSnapshot).toHaveBeenCalledWith(1)
      expect(mockDb.deleteSnapshot).toHaveBeenCalledWith(1)
    })
  })

  describe('autoSave controls', () => {
    it('setAutoSaveEnabled toggles auto save', () => {
      store.setAutoSaveEnabled(false)
      expect(store.autoSaveEnabled).toBe(false)
    })

    it('setAutoSaveInterval sets interval', () => {
      store.setAutoSaveInterval(10)
      expect(store.autoSaveInterval).toBe(10)
    })
  })
})
