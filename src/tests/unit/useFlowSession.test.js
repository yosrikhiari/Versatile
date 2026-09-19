import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowStore } from '@/stores/flowStore'
import { useFlowSession } from '@/composables/useFlowSession'

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

// The singleton used to snapshot the store's unwrapped values, so every
// consumer saw `*.value === undefined` and the Flow UI (timer, nudges,
// desaturation, end modal) never engaged even while a session ran.
describe('useFlowSession singleton reactivity', () => {
  let store
  let session

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.clearAllMocks()
    store = useFlowStore()
    session = useFlowSession()
  })

  afterEach(() => {
    store.destroy()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('exposes live refs that track the store through a session lifecycle', async () => {
    expect(typeof session.isRunning.value).toBe('boolean')
    expect(session.isRunning.value).toBe(false)

    session.startSession(20)
    expect(session.isRunning.value).toBe(true)
    expect(session.remaining.value).toBe(1200)

    await vi.advanceTimersByTimeAsync(5000)
    expect(session.remaining.value).toBe(1195)

    session.endSession()
    expect(session.isRunning.value).toBe(false)
    expect(session.showSessionEndModal.value).toBe(true)

    session.dismissModal()
    expect(session.showSessionEndModal.value).toBe(false)

    // Let endSession's lazy bookkeeping settle inside the test.
    await vi.advanceTimersByTimeAsync(0)
  })
})
