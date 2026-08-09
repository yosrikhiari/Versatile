import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useChapterStoryGenerator } from '../../composables/generation/useChapterStoryGenerator'

vi.mock('../../composables/generation/delegator/useDelegatorGeneration', () => ({
  useDelegatorGeneration: vi.fn(() => ({
    memory: {
      phase: ref('idle'),
      stores: { sessionBudget: ref(0), currentChapterId: ref(null), sceneByNumber: new Map() }
    },
    initializeToolInstances: vi.fn(async () => {}),
    emit: vi.fn(async () => {}),
    isModelGenerating: ref(false)
  }))
}))

const mocks = {
  projectStore: { currentProjectId: ref('p1'), projects: ref({ p1: { title: 'Test Book' } }) },
  settingsStore: {
    wordsPerChapter: ref(1000),
    chaptersPerVolume: ref(1),
    scenesPerChapter: ref(3),
    volumes: ref(1)
  },
  evalStore: {
    clearEvalSeeds: vi.fn(),
    getEvaluationsForScope: vi.fn(() => []),
    saveEvaluation: vi.fn()
  },
  storyBibleStore: { entities: ref([]), getEntitiesByProject: vi.fn(() => []) },
  volumeStore: {
    volumes: ref([{ id: 'v1', projectId: 'p1', title: 'Vol 1' }]),
    chapters: ref([{ id: 'c1', projectId: 'p1', volumeId: 'v1', title: 'Ch 1' }]),
    createChapter: vi.fn(),
    updateChapter: vi.fn(),
    createVolume: vi.fn()
  },
  manuscriptStore: { createSubsection: vi.fn(), updateSubsection: vi.fn() },
  storyGraphStore: { edges: ref([]), nodes: ref([]), setRelationships: vi.fn() },
  branchStore: { setActiveBranch: vi.fn(), branches: ref([]) }
}
vi.mock('../../stores/projectStore', () => ({ useProjectStore: () => mocks.projectStore }))
vi.mock('../../stores/settingsStore', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('../../stores/evalStore', () => ({ useEvalStore: () => mocks.evalStore }))
vi.mock('../../stores/storyBibleStore', () => ({ useStoryBibleStore: () => mocks.storyBibleStore }))
vi.mock('../../stores/volumeStore', () => ({ useVolumeStore: () => mocks.volumeStore }))
vi.mock('../../stores/manuscriptStore', () => ({ useManuscriptStore: () => mocks.manuscriptStore }))
vi.mock('../../stores/storyGraphStore', () => ({ useStoryGraphStore: () => mocks.storyGraphStore }))
vi.mock('../../stores/branchStore', () => ({ useBranchStore: () => mocks.branchStore }))

describe('useChapterStoryGenerator', () => {
  let gen
  beforeEach(() => {
    vi.clearAllMocks()
    gen = useChapterStoryGenerator()
  })

  it('creates its own memory (delegator is a new instance per call)', () => {
    expect(gen).toBeDefined()
    expect(gen.runSize.value).toEqual({ chapters: 1, scenes: 0 })
  })

  it('splits the word target evenly across scenes', () => {
    expect(gen.getSceneBudget(600, 3)).toBe(200)
    expect(gen.getSceneBudget(601, 3)).toBe(201)
    expect(gen.getSceneBudget(100, 0)).toBe(100)
  })

  it('exposes the full chapter duck-type', () => {
    const expected = [
      'startGeneration',
      'confirmPlan',
      'rejectScene',
      'reRequestScene',
      'continueGeneration',
      'stop',
      'reset',
      'resumeGeneration',
      'getResumableRun',
      'destroy'
    ]
    for (const fn of expected) expect(typeof gen[fn]).toBe('function')
    expect(typeof gen.phase.value).toBe('string')
  })

  it('memory isolation: two instances have independent phase refs', () => {
    const gen2 = useChapterStoryGenerator()
    gen.phase.value = 'writing'
    expect(gen2.phase.value).toBe('idle')
  })

  it('getSceneBudget clamps to minimum 1 scene', () => {
    expect(gen.getSceneBudget(500, 0)).toBe(500)
    expect(gen.getSceneBudget(500, -1)).toBe(500)
  })
})
