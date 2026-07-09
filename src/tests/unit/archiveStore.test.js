import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useArchiveStore } from '@/stores/archiveStore'

const mockDb = {
  saveSessionArchive: vi.fn(() => 1),
  getSessionArchive: vi.fn(() => [{ id: 1, type: 'test' }]),
  searchSessionArchive: vi.fn(() => [{ id: 2 }]),
  saveStateSnapshot: vi.fn(() => 'snap1'),
  getLatestStateSnapshot: vi.fn(() => ({
    id: 'snap1',
    projectId: 'p1',
    sessionId: 's1',
    state: {},
    timestamp: '2025-01-01'
  })),
  getStateSnapshotHistory: vi.fn(() => [{ id: 'snap1', projectId: 'p1' }]),
  saveAuthorProfile: vi.fn(() => undefined),
  getAuthorProfile: vi.fn(() => ({ name: 'Author' })),
  pruneSessionArchive: vi.fn(() => 5)
}

vi.mock('@/services/dbService', () => ({
  saveSessionArchive: (...args) => mockDb.saveSessionArchive(...args),
  getSessionArchive: (...args) => mockDb.getSessionArchive(...args),
  searchSessionArchive: (...args) => mockDb.searchSessionArchive(...args),
  saveStateSnapshot: (...args) => mockDb.saveStateSnapshot(...args),
  getLatestStateSnapshot: (...args) => mockDb.getLatestStateSnapshot(...args),
  getStateSnapshotHistory: (...args) => mockDb.getStateSnapshotHistory(...args),
  saveAuthorProfile: (...args) => mockDb.saveAuthorProfile(...args),
  getAuthorProfile: (...args) => mockDb.getAuthorProfile(...args),
  pruneSessionArchive: (...args) => mockDb.pruneSessionArchive(...args)
}))

describe('archiveStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useArchiveStore()
  })

  it('initializes with default values', () => {
    expect(store.archivedSessions).toEqual([])
    expect(store.stateSnapshots).toEqual([])
    expect(store.currentStateSnapshot).toBeNull()
    expect(store.archiveSearchResults).toEqual([])
    expect(store.isLoading).toBe(false)
  })

  describe('saveInteraction', () => {
    it('calls db and requires a signal', async () => {
      await store.saveInteraction('p1', 'edit', { data: 1 }, ['tag'], 1)
      expect(mockDb.saveSessionArchive).toHaveBeenCalledWith('p1', 'edit', { data: 1 }, ['tag'], 1)
    })

    it('throws if signal is null', async () => {
      await expect(store.saveInteraction('p1', 'edit', {})).rejects.toThrow('signal is required')
    })

    it('throws if signal is undefined', async () => {
      await expect(store.saveInteraction('p1', 'edit', {}, [], undefined)).rejects.toThrow(
        'signal is required'
      )
    })
  })

  describe('loadSessionHistory', () => {
    it('loads sessions and sets isLoading', async () => {
      await store.loadSessionHistory('p1')
      expect(mockDb.getSessionArchive).toHaveBeenCalledWith('p1', {})
      expect(store.archivedSessions).toEqual([{ id: 1, type: 'test' }])
      expect(store.isLoading).toBe(false)
    })

    it('resets isLoading on error', async () => {
      mockDb.getSessionArchive.mockRejectedValueOnce(new Error('fail'))
      await expect(store.loadSessionHistory('p1')).rejects.toThrow('fail')
      expect(store.isLoading).toBe(false)
    })
  })

  describe('searchArchive', () => {
    it('searches and populates results', async () => {
      await store.searchArchive('p1', 'query')
      expect(mockDb.searchSessionArchive).toHaveBeenCalledWith('p1', 'query')
      expect(store.archiveSearchResults).toEqual([{ id: 2 }])
    })

    it('resets isLoading on error', async () => {
      mockDb.searchSessionArchive.mockRejectedValueOnce(new Error('fail'))
      await expect(store.searchArchive('p1', 'q')).rejects.toThrow('fail')
      expect(store.isLoading).toBe(false)
    })
  })

  describe('saveEndOfSessionState', () => {
    it('saves state and reloads snapshots', async () => {
      mockDb.getStateSnapshotHistory.mockResolvedValue([{ id: 'snap1', projectId: 'p1' }])
      const id = await store.saveEndOfSessionState('p1', 's1', { text: 'hello' })
      expect(mockDb.saveStateSnapshot).toHaveBeenCalledWith('p1', 's1', { text: 'hello' })
      expect(mockDb.saveSessionArchive).toHaveBeenCalled()
      expect(id).toBe('snap1')
    })
  })

  describe('loadStateSnapshots', () => {
    it('loads snapshots and sets current', async () => {
      await store.loadStateSnapshots('p1')
      expect(mockDb.getStateSnapshotHistory).toHaveBeenCalledWith('p1')
      expect(mockDb.getLatestStateSnapshot).toHaveBeenCalledWith('p1')
      expect(store.currentStateSnapshot).toEqual({
        id: 'snap1',
        projectId: 'p1',
        sessionId: 's1',
        state: {},
        timestamp: '2025-01-01'
      })
    })
  })

  describe('author profile', () => {
    it('saves author profile', async () => {
      await store.saveAuthorProfileData('p1', { name: 'Author' })
      expect(mockDb.saveAuthorProfile).toHaveBeenCalledWith('p1', { name: 'Author' })
    })

    it('loads author profile', async () => {
      const result = await store.loadAuthorProfile('p1')
      expect(mockDb.getAuthorProfile).toHaveBeenCalledWith('p1')
      expect(result).toEqual({ name: 'Author' })
    })
  })

  describe('prune', () => {
    it('prunes old sessions and reloads', async () => {
      mockDb.pruneSessionArchive.mockResolvedValue(5)
      mockDb.getSessionArchive.mockResolvedValue([])
      const deleted = await store.prune('p1', 30)
      expect(mockDb.pruneSessionArchive).toHaveBeenCalledWith('p1', 30)
      expect(mockDb.getSessionArchive).toHaveBeenCalled()
      expect(deleted).toBe(5)
    })
  })
})
