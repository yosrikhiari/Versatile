import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockDb = {
  savePreference: vi.fn(() => Promise.resolve(1)),
  getPreferencesByProject: vi.fn(() => Promise.resolve([])),
  deletePreferencesByProject: vi.fn(() => Promise.resolve())
}

vi.mock('@/services/db-preferences', () => ({
  savePreference: (...args) => mockDb.savePreference(...args),
  getPreferencesByProject: (...args) => mockDb.getPreferencesByProject(...args),
  deletePreferencesByProject: (...args) => mockDb.deletePreferencesByProject(...args)
}))

const pref1 = {
  id: 1,
  winnerId: 'draft-a',
  loserId: 'draft-b',
  sceneId: 'scene-1',
  projectId: 'proj1',
  timestamp: '2026-01-01T00:00:00Z',
  modelContext: {
    winnerProvider: 'openai',
    winnerModel: 'gpt-4o',
    loserProvider: 'anthropic',
    loserModel: 'claude-sonnet-4-5'
  }
}

const pref2 = {
  id: 2,
  winnerId: 'draft-b',
  loserId: 'draft-c',
  sceneId: 'scene-1',
  projectId: 'proj1',
  timestamp: '2026-01-01T00:01:00Z',
  modelContext: {
    winnerProvider: 'openai',
    winnerModel: 'gpt-4o',
    loserProvider: 'anthropic',
    loserModel: 'claude-haiku'
  }
}

let usePreferenceStore

beforeEach(async () => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.resetModules()
  const mod = await import('@/stores/preferenceStore')
  usePreferenceStore = mod.usePreferenceStore
})

describe('preferenceStore', () => {
  describe('loadPreferences', () => {
    it('loads and sets preferences from db', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1, pref2])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      expect(store.preferences).toHaveLength(2)
      expect(mockDb.getPreferencesByProject).toHaveBeenCalledWith('proj1')
    })

    it('starts with empty preferences', () => {
      const store = usePreferenceStore()
      expect(store.preferences).toEqual([])
      expect(store.totalCount).toBe(0)
    })
  })

  describe('addPreference', () => {
    it('calls savePreference and prepends to list', async () => {
      const store = usePreferenceStore()
      await store.addPreference(pref1)
      expect(mockDb.savePreference).toHaveBeenCalledWith(pref1)
      expect(store.preferences).toHaveLength(1)
      expect(store.preferences[0].winnerId).toBe('draft-a')
    })

    it('preferences prepend so newest first', async () => {
      const store = usePreferenceStore()
      await store.addPreference(pref1)
      await store.addPreference(pref2)
      expect(store.preferences).toHaveLength(2)
      expect(store.preferences[0].winnerId).toBe('draft-b')
      expect(store.preferences[1].winnerId).toBe('draft-a')
    })
  })

  describe('getPreferencesForScene', () => {
    it('returns preferences filtered by sceneId', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1, pref2])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      const scene = store.getPreferencesForScene('scene-1')
      expect(scene).toHaveLength(2)
    })

    it('returns empty array for nonexistent scene', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      const scene = store.getPreferencesForScene('scene-2')
      expect(scene).toEqual([])
    })
  })

  describe('sceneIds', () => {
    it('returns unique scene IDs', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([
        pref1,
        pref2,
        { ...pref1, id: 3, sceneId: 'scene-2' }
      ])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      const ids = store.sceneIds
      expect(ids).toContain('scene-1')
      expect(ids).toContain('scene-2')
      expect(ids).toHaveLength(2)
    })
  })

  describe('getWinCounts', () => {
    it('counts wins and losses per draft', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1, pref2])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      const { wins, losses } = store.getWinCounts()
      expect(wins['draft-a']).toBe(1)
      expect(wins['draft-b']).toBe(1)
      expect(losses['draft-b']).toBe(1)
      expect(losses['draft-c']).toBe(1)
    })
  })

  describe('getModelWinRates', () => {
    it('computes win rates per model', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1, pref2])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      const rates = store.getModelWinRates()
      expect(rates['openai/gpt-4o'].wins).toBe(2)
      expect(rates['openai/gpt-4o'].losses).toBe(0)
      expect(rates['openai/gpt-4o'].winRate).toBe(1)
      expect(rates['anthropic/claude-sonnet-4-5'].wins).toBe(0)
      expect(rates['anthropic/claude-sonnet-4-5'].losses).toBe(1)
      expect(rates['anthropic/claude-sonnet-4-5'].winRate).toBe(0)
    })
  })

  describe('getPreferenceWeight', () => {
    it('returns 1.0 when insufficient data', () => {
      const store = usePreferenceStore()
      expect(store.getPreferenceWeight('openai', 'gpt-4o')).toBe(1.0)
    })

    it('returns 1.0 for fewer than 2 total matches', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      expect(store.getPreferenceWeight('openai', 'gpt-4o')).toBe(1.0)
    })

    it('returns weight based on win rate', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1, pref2])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      const weight = store.getPreferenceWeight('openai', 'gpt-4o')
      expect(weight).toBeGreaterThan(1)
      expect(weight).toBeLessThanOrEqual(1.5)
    })

    it('clamps weight between 0.5 and 1.5', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([
        { ...pref1, id: 1 },
        {
          ...pref2,
          id: 2,
          modelContext: {
            winnerProvider: 'openai',
            winnerModel: 'gpt-4o',
            loserProvider: 'openai',
            loserModel: 'gpt-4o'
          }
        },
        {
          ...pref1,
          id: 3,
          modelContext: {
            winnerProvider: 'openai',
            winnerModel: 'gpt-4o-mini',
            loserProvider: 'openai',
            loserModel: 'gpt-4o'
          }
        },
        {
          ...pref1,
          id: 4,
          modelContext: {
            winnerProvider: 'openai',
            winnerModel: 'gpt-4o-mini',
            loserProvider: 'openai',
            loserModel: 'gpt-4o'
          }
        }
      ])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      const weight = store.getPreferenceWeight('openai', 'gpt-4o')
      expect(weight).toBeGreaterThanOrEqual(0.5)
      expect(weight).toBeLessThanOrEqual(1.5)
    })
  })

  describe('clearAll', () => {
    it('clears preferences from db and store', async () => {
      mockDb.getPreferencesByProject.mockResolvedValue([pref1, pref2])
      const store = usePreferenceStore()
      await store.loadPreferences('proj1')
      expect(store.preferences).toHaveLength(2)
      await store.clearAll('proj1')
      expect(mockDb.deletePreferencesByProject).toHaveBeenCalledWith('proj1')
      expect(store.preferences).toEqual([])
    })
  })
})
