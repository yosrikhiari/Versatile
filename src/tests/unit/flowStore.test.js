import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowStore } from '@/stores/flowStore'

const mockProjectStore = {
  resetSessionCount: vi.fn(),
  sessionWordCount: 42,
  currentProjectId: 'proj1',
  currentCategory: 'fiction',
  lastSessionRecap: null,
  updateAuthorVoiceProfile: vi.fn()
}

const mockArchiveStore = {
  saveEndOfSessionState: vi.fn(() => Promise.resolve())
}

const mockSummarizer = {
  summarize: vi.fn(() => ({ scenes: 3, words: 500 })),
  snapshotToRecap: vi.fn(() => 'recap text')
}

const mockAuthorModel = {
  buildProfileFromSession: vi.fn(() => ({ profile: 'test' }))
}

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

vi.mock('@/stores/archiveStore', () => ({
  useArchiveStore: () => mockArchiveStore
}))

vi.mock('@/composables/useStateSummarizer', () => ({
  useStateSummarizer: () => mockSummarizer
}))

vi.mock('@/composables/useAuthorModel', () => ({
  useAuthorModel: () => mockAuthorModel
}))

describe('flowStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.clearAllMocks()
    store = useFlowStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    store.destroy()
  })

  describe('formatTime', () => {
    it('formats 0 seconds', () => {
      expect(store.formatTime(0)).toBe('00:00')
    })

    it('formats 60 seconds', () => {
      expect(store.formatTime(60)).toBe('01:00')
    })

    it('formats 3661 seconds', () => {
      expect(store.formatTime(3661)).toBe('61:01')
    })

    it('pads single digit minutes and seconds', () => {
      expect(store.formatTime(5)).toBe('00:05')
      expect(store.formatTime(65)).toBe('01:05')
    })
  })

  describe('startSession', () => {
    it('initializes with default 20 minutes', () => {
      store.startSession()
      expect(store.duration).toBe(1200)
      expect(store.remaining).toBe(1200)
      expect(store.isRunning).toBe(true)
      expect(store.isPaused).toBe(false)
      expect(mockProjectStore.resetSessionCount).toHaveBeenCalled()
    })

    it('initializes with custom minutes', () => {
      store.startSession(10)
      expect(store.duration).toBe(600)
      expect(store.remaining).toBe(600)
    })

    it('counts down remaining every second', () => {
      store.startSession(1)
      expect(store.remaining).toBe(60)
      vi.advanceTimersByTime(3000)
      expect(store.remaining).toBe(57)
    })

    it('does not count down when paused', () => {
      store.startSession(1)
      vi.advanceTimersByTime(2000)
      store.pauseSession()
      vi.advanceTimersByTime(3000)
      expect(store.remaining).toBe(58)
    })

    it('resumes countdown after pause', () => {
      store.startSession(1)
      vi.advanceTimersByTime(2000)
      store.pauseSession()
      store.resumeSession()
      vi.advanceTimersByTime(3000)
      expect(store.remaining).toBe(55)
    })

    it('ends session when remaining reaches 0', () => {
      store.startSession(1)
      vi.advanceTimersByTime(61000)
      expect(store.remaining).toBe(0)
      expect(store.isRunning).toBe(false)
      expect(store.showSessionEndModal).toBe(true)
    })
  })

  describe('endSession', () => {
    it('saves session data and shows modal', () => {
      store.startSession(5)
      store.endSession()
      expect(store.showSessionEndModal).toBe(true)
      expect(store.isRunning).toBe(false)
      expect(store.isPaused).toBe(false)
      expect(store.sessionWordCountEnd).toBe(42)
    })

    it('calls archive and author model services', () => {
      store.startSession(5)
      store.endSession()
      expect(mockArchiveStore.saveEndOfSessionState).toHaveBeenCalled()
      expect(mockAuthorModel.buildProfileFromSession).toHaveBeenCalledWith({
        wordCountDelta: 42,
        genre: 'fiction'
      })
    })

    it('sets recap on project store', async () => {
      store.startSession(5)
      store.endSession()
      await vi.runAllTimersAsync()
      expect(mockProjectStore.lastSessionRecap).toBe('recap text')
    })

    it('skips archive for projects without id', () => {
      mockProjectStore.currentProjectId = null
      store.startSession(5)
      store.endSession()
      expect(mockArchiveStore.saveEndOfSessionState).not.toHaveBeenCalled()
      mockProjectStore.currentProjectId = 'proj1'
    })
  })

  describe('player interactions', () => {
    it('dismissModal hides session modal', () => {
      store.startSession(1)
      store.endSession()
      expect(store.showSessionEndModal).toBe(true)
      store.dismissModal()
      expect(store.showSessionEndModal).toBe(false)
    })

    it('startNewSession dismisses and restarts', () => {
      store.startSession(5)
      store.endSession()
      store.startNewSession(10)
      expect(store.showSessionEndModal).toBe(false)
      expect(store.duration).toBe(600)
      expect(store.isRunning).toBe(true)
    })

    it('handleKeystroke resets idle state', () => {
      store.startSession(5)
      store.idleSeconds = 15
      store.isDesaturated = true
      store.isNudging = true
      store.handleKeystroke()
      expect(store.idleSeconds).toBe(0)
      expect(store.isDesaturated).toBe(false)
      expect(store.isNudging).toBe(false)
    })

    it('dismissNudge clears nudging', () => {
      store.isNudging = true
      store.dismissNudge()
      expect(store.isNudging).toBe(false)
    })

    it('dismissBackspaceToast clears backspace state', () => {
      store.showBackspaceToast = true
      store.dismissBackspaceToast()
      expect(store.showBackspaceToast).toBe(false)
    })
  })

  describe('idle detection', () => {
    it('desaturates after 12 idle seconds', () => {
      store.startSession(5)
      vi.advanceTimersByTime(12000)
      expect(store.isDesaturated).toBe(true)
    })

    it('sets nudging after 20 idle seconds', () => {
      store.startSession(5)
      vi.advanceTimersByTime(21000)
      expect(store.isNudging).toBe(true)
    })

    it('resets idle on keystroke', () => {
      store.startSession(5)
      vi.advanceTimersByTime(10000)
      store.handleKeystroke()
      expect(store.isDesaturated).toBe(false)
      expect(store.isNudging).toBe(false)
    })
  })

  describe('handleBackspace', () => {
    it('shows backspace toast after 800ms hold', () => {
      store.startSession(5)
      const event = { key: 'Backspace' }
      store.handleBackspace(event)
      vi.advanceTimersByTime(900)
      store.handleBackspace(event)
      expect(store.showBackspaceToast).toBe(true)
    })

    it('does nothing when not running', () => {
      const event = { key: 'Backspace' }
      store.handleBackspace(event)
      vi.advanceTimersByTime(900)
      store.handleBackspace(event)
      expect(store.showBackspaceToast).toBe(false)
    })

    it('resets backspace tracking on non-backspace key', () => {
      store.startSession(5)
      store.handleBackspace({ key: 'Backspace' })
      vi.advanceTimersByTime(500)
      store.handleBackspace({ key: 'a' })
      vi.advanceTimersByTime(500)
      store.handleBackspace({ key: 'Backspace' })
      expect(store.showBackspaceToast).toBe(false)
    })
  })
})
