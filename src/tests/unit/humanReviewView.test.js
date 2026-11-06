import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

const { state } = vi.hoisted(() => ({ state: {} }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('@/stores/humanReviewStore', () => ({
  useHumanReviewStore: () => state.store
}))

import HumanReviewView from '@/views/HumanReviewView.vue'

function makeStore(overrides = {}) {
  return reactive({
    studies: [],
    sessions: [],
    sessionProgress: {},
    activeStudy: null,
    activeSession: null,
    responses: [],
    sceneOrder: [],
    loading: false,
    error: '',
    currentSceneIndex: -1,
    currentScene: null,
    progress: 0,
    isComplete: false,
    inProgressSessions: [],
    completedSessions: [],
    load: vi.fn(() => Promise.resolve()),
    importStudy: vi.fn(),
    startSession: vi.fn(),
    resumeSession: vi.fn(),
    leaveSession: vi.fn(),
    saveDraft: vi.fn(),
    exportSession: vi.fn(),
    removeSession: vi.fn(),
    ...overrides
  })
}

const stubs = {
  BaseIcon: true,
  BaseSpinner: true
}

describe('HumanReviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the local-only, blinded import state', () => {
    state.store = makeStore()
    const w = mount(HumanReviewView, { global: { stubs } })
    expect(w.text()).toContain('Review study')
    expect(w.text()).toContain('Local-only pilot')
    expect(w.text()).toContain('no critic or gate output')
    expect(w.text()).toContain('Import study pack')
  })

  it('renders only the scene and rubric during a session', () => {
    state.store = makeStore({
      activeStudy: { id: 1, title: 'Pilot', scenes: Array.from({ length: 12 }, () => ({})) },
      activeSession: { id: 1, raterId: 'Rater A', passLabel: 'Pass 1', status: 'in-progress' },
      sceneOrder: Array.from({ length: 12 }, (_, i) => ({ sceneId: `s${i + 1}` })),
      currentSceneIndex: 0,
      currentScene: {
        sceneId: 's1',
        sceneTitle: 'A quiet road',
        brief: 'A traveler waits.',
        facts: ['The bridge is out.'],
        text: 'The road was empty and the bridge was gone.'
      }
    })
    const w = mount(HumanReviewView, { global: { stubs } })
    const text = w.text()
    expect(text).toContain('A quiet road')
    expect(text).toContain('The road was empty')
    expect(text).toContain('Overall decision')
    expect(text).toContain('Problem')
    expect(text).toContain('Fine')
    expect(text).toContain('Unsure')
    expect(text).not.toContain('Needs Revision')
    expect(text).not.toContain('Gate Summary')
    expect(text).not.toContain('critique')
  })
})
