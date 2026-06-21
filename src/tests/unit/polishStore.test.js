import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockDb = {
  getAnnotations: vi.fn(() => Promise.resolve([])),
  addAnnotation: vi.fn(() => Promise.resolve(1)),
  updateAnnotation: vi.fn(() => Promise.resolve()),
  deleteAnnotation: vi.fn(),
  clearAnnotations: vi.fn(() => Promise.resolve()),
  getSnippets: vi.fn(() => Promise.resolve([])),
  addSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(() => Promise.resolve()),
  incrementSnippetWord: vi.fn(() => Promise.resolve())
}

const mockAnalyzePolish = vi.fn()

vi.mock('@/services/dbService', () => ({
  getAnnotations: (...args) => mockDb.getAnnotations(...args),
  addAnnotation: (...args) => mockDb.addAnnotation(...args),
  updateAnnotation: (...args) => mockDb.updateAnnotation(...args),
  deleteAnnotation: (...args) => mockDb.deleteAnnotation(...args),
  clearAnnotations: (...args) => mockDb.clearAnnotations(...args),
  getSnippets: (...args) => mockDb.getSnippets(...args),
  addSnippet: (...args) => mockDb.addSnippet(...args),
  updateSnippet: (...args) => mockDb.updateSnippet(...args),
  deleteSnippet: (...args) => mockDb.deleteSnippet(...args),
  incrementSnippetWord: (...args) => mockDb.incrementSnippetWord(...args)
}))

vi.mock('@/composables/useOllama', () => ({
  analyzePolish: (...args) => mockAnalyzePolish(...args)
}))

vi.mock('@/config/statuses', () => ({
  LENS_MAP: {
    weakVerbs: 'weak_verbs',
    repetition: 'repetition',
    pacing: 'pacing',
    clarity: 'clarity'
  }
}))

vi.mock('@/config/storageKeys', () => ({
  STORAGE_KEYS: { ACTIVE_LENSES: 'active_lenses' }
}))

let usePolishStore
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.clearAllMocks()
  localStorage.clear()

  mockAnalyzePolish.mockResolvedValue({ issues: [], overallNote: '' })

  vi.resetModules()
  const mod = await import('@/stores/polishStore')
  usePolishStore = mod.usePolishStore
})

afterEach(() => {
  vi.useRealTimers()
})

describe('polishStore', () => {
  describe('loadAnnotations and loadSnippets', () => {
    it('loadAnnotations fetches and sets annotations', async () => {
      mockDb.getAnnotations.mockResolvedValue([{ id: 1, text: 'test' }])
      const store = usePolishStore()
      await store.loadAnnotations('proj1')
      expect(store.annotations).toEqual([{ id: 1, text: 'test' }])
      expect(mockDb.getAnnotations).toHaveBeenCalledWith('proj1')
    })

    it('loadSnippets fetches and sets snippets', async () => {
      mockDb.getSnippets.mockResolvedValue([{ word: 'test', count: 5 }])
      const store = usePolishStore()
      await store.loadSnippets('proj1')
      expect(store.snippets).toEqual([{ word: 'test', count: 5 }])
    })
  })

  describe('selectParagraph and debounce', () => {
    it('sets pending state and triggers debounced analysis', () => {
      const store = usePolishStore()
      store.setProjectStore({ currentProjectId: 'proj1' })
      vi.spyOn(store, 'setProjectStore' in store ? 'setProjectStore' : 'selectParagraph')
      // selectParagraph sets internal pending state, then schedules analysis
      store.selectParagraph('Some text', 0)
      expect(mockAnalyzePolish).not.toHaveBeenCalled()
      vi.advanceTimersByTime(800)
      expect(mockAnalyzePolish).toHaveBeenCalled()
    })

    it('debounce resets on new selection', () => {
      const store = usePolishStore()
      store.setProjectStore({ currentProjectId: 'proj1' })
      store.selectParagraph('First', 0)
      vi.advanceTimersByTime(400)
      store.selectParagraph('Second', 1)
      vi.advanceTimersByTime(400)
      expect(mockAnalyzePolish).not.toHaveBeenCalled()
      vi.advanceTimersByTime(400)
      expect(mockAnalyzePolish).toHaveBeenCalledTimes(1)
    })
  })

  describe('doAnalyze', () => {
    it('calls analyzePolish with mapped lenses', async () => {
      mockAnalyzePolish.mockResolvedValue({ issues: [], overallNote: '' })
      const store = usePolishStore()
      await store.analyzeNow('Some text', 0, 'proj1')
      expect(mockAnalyzePolish).toHaveBeenCalledWith('Some text', {
        weak_verbs: true,
        repetition: true,
        pacing: true,
        clarity: true
      })
    })

    it('sets isAnalyzing ref correctly', async () => {
      mockAnalyzePolish.mockResolvedValue({ issues: [], overallNote: '' })
      const store = usePolishStore()
      const promise = store.analyzeNow('text', 0, 'proj1')
      expect(store.isAnalyzing).toBe(true)
      await promise
      expect(store.isAnalyzing).toBe(false)
    })

    it('saves issues as annotations', async () => {
      mockAnalyzePolish.mockResolvedValue({
        issues: [
          { type: 'weak_verb', original: 'ran', suggestion: 'sprinted', reason: 'Stronger' },
          { type: 'clarity', original: 'it', suggestion: 'the sword', reason: 'Vague' }
        ],
        overallNote: 'Good writing'
      })
      mockDb.getAnnotations.mockResolvedValue([])
      mockDb.getSnippets.mockResolvedValue([])
      const store = usePolishStore()
      await store.analyzeNow('text', 0, 'proj1')
      expect(mockDb.addAnnotation).toHaveBeenCalledTimes(2)
      expect(mockDb.getAnnotations).toHaveBeenCalled()
      expect(mockDb.getSnippets).toHaveBeenCalled()
    })

    it('increments snippet words for repetition issues', async () => {
      mockAnalyzePolish.mockResolvedValue({
        issues: [
          { type: 'repetition', original: 'very very good', suggestion: 'excellent', reason: 'Redundant' }
        ],
        overallNote: ''
      })
      mockDb.getAnnotations.mockResolvedValue([])
      mockDb.getSnippets.mockResolvedValue([])
      const store = usePolishStore()
      await store.analyzeNow('text', 0, 'proj1')
      expect(mockDb.incrementSnippetWord).toHaveBeenCalledWith('proj1', 'very')
      expect(mockDb.incrementSnippetWord).toHaveBeenCalledWith('proj1', 'good')
    })

    it('sets error on analysis error', async () => {
      mockAnalyzePolish.mockResolvedValue({ error: true, overallNote: 'Analysis limit reached' })
      const store = usePolishStore()
      await store.analyzeNow('text', 0, 'proj1')
      expect(store.error).toBe('Analysis limit reached')
    })

    it('throws on exception', async () => {
      mockAnalyzePolish.mockRejectedValue(new Error('Service unavailable'))
      const store = usePolishStore()
      await expect(store.analyzeNow('text', 0, 'proj1')).rejects.toThrow('Service unavailable')
      expect(store.error).toBe('Service unavailable')
    })
  })

  describe('annotation actions', () => {
    it('acceptAnnotation updates content and status', async () => {
      const store = usePolishStore()
      store.annotations = [{ id: 1, original: 'old text', suggestion: 'new text' }]
      const projectStore = {
        documentContent: 'Some old text here',
        updateContent: vi.fn()
      }
      await store.acceptAnnotation(1, 'proj1', projectStore)
      expect(projectStore.updateContent).toHaveBeenCalledWith('Some new text here')
      expect(mockDb.updateAnnotation).toHaveBeenCalledWith(1, { status: 'accepted' })
    })

    it('rejectAnnotation sets status rejected', async () => {
      const store = usePolishStore()
      store.annotations = [{ id: 2 }]
      await store.rejectAnnotation(2, 'proj1')
      expect(mockDb.updateAnnotation).toHaveBeenCalledWith(2, { status: 'rejected' })
    })

    it('flagForLater sets status flagged', async () => {
      const store = usePolishStore()
      store.annotations = [{ id: 3 }]
      await store.flagForLater(3, 'proj1')
      expect(mockDb.updateAnnotation).toHaveBeenCalledWith(3, { status: 'flagged' })
    })

    it('clearAnnotationsData clears all annotations', async () => {
      const store = usePolishStore()
      store.annotations = [{ id: 1 }]
      await store.clearAnnotationsData('proj1')
      expect(mockDb.clearAnnotations).toHaveBeenCalledWith('proj1')
      expect(store.annotations).toEqual([])
    })

    it('removeSnippet deletes and reloads', async () => {
      mockDb.getSnippets.mockResolvedValue([])
      const store = usePolishStore()
      await store.removeSnippet(5, 'proj1')
      expect(mockDb.deleteSnippet).toHaveBeenCalledWith(5)
      expect(mockDb.getSnippets).toHaveBeenCalledWith('proj1')
    })
  })

  describe('setActiveLenses', () => {
    it('updates active lenses', () => {
      const store = usePolishStore()
      store.setActiveLenses({ weakVerbs: false, repetition: true, pacing: false, clarity: true })
      expect(store.activeLenses).toEqual({ weakVerbs: false, repetition: true, pacing: false, clarity: true })
    })
  })
})
