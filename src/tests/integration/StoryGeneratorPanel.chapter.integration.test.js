import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '../../stores/projectStore'

/**
 * Panel → real `useChapterStoryGenerator` → real `chapterGate` → panel.
 *
 * Only the underlying volume pipeline is faked, at the seam where it would
 * otherwise reach a model: everything the chapter split actually added — run
 * sizing, the plan-preview gate, the confirm loop, the chapter acceptance gate,
 * and the panel wiring that surfaces it — is the real code under test.
 */

const pipeline = {
  phase: ref('idle'),
  scenePlan: ref([]),
  writtenScenes: ref([]),
  consistencyReport: ref(null),
  lastStartArgs: null,
  /**
   * Words each written scene gets. The panel's default request is 3,500 words
   * across 3 scenes, so ~1,200 a scene is an on-target chapter; lower it to
   * make the chapter come in short.
   */
  wordsPerScene: 1200
}

function makeProse(sceneNumber, words) {
  const sentences = []
  for (let i = 0; i < words; i += 9) {
    sentences.push(`Scene ${sceneNumber} beat ${i} advanced the chapter with fresh detail.`)
  }
  return sentences.join(' ')
}

const volumePipeline = {
  phase: pipeline.phase,
  progress: { current: 0, total: 0, statusText: '' },
  error: ref(null),
  volumeId: ref('v1'),
  scenePlan: pipeline.scenePlan,
  writtenScenes: pipeline.writtenScenes,
  consistencyReport: pipeline.consistencyReport,
  syncPreview: ref([]),
  currentSceneResult: ref(null),
  isContinuing: ref(false),
  continuationReport: ref(null),
  isCancelling: ref(false),
  isPaused: ref(false),
  pauseRequested: ref(false),
  canPause: ref(false),
  canContinue: ref(false),
  sceneReviewMode: ref(false),
  autoMode: ref(false),
  inlineEvalEnabled: ref(false),
  runHealth: {
    record: vi.fn(),
    countByKind: vi.fn(() => 0),
    degradedScenes: vi.fn(() => 0)
  },
  memory: { currentTaskId: ref('task-1') },
  startGeneration: vi.fn(async (args) => {
    pipeline.lastStartArgs = args
    const n = args.structure.scenesPerChapter
    pipeline.scenePlan.value = Array.from({ length: n }, (_, i) => ({
      sceneNumber: i + 1,
      title: `Scene ${i + 1}`,
      estimatedWords: Math.ceil(args.wordTarget / n)
    }))
    pipeline.phase.value = 'plan-preview'
    return { scenes: pipeline.scenePlan.value, storyArc: { arc: true }, storyContract: 'contract' }
  }),
  confirmPlan: vi.fn(async ({ editedPlan }) => {
    pipeline.writtenScenes.value = editedPlan.map((s, i) => ({
      title: s.title,
      sceneNumber: s.sceneNumber,
      subsectionId: `sub-${i + 1}`,
      characters: [],
      prose: makeProse(s.sceneNumber, pipeline.wordsPerScene)
    }))
    pipeline.phase.value = 'complete'
  }),
  confirmSync: vi.fn(async () => {}),
  approveScene: vi.fn(async () => {}),
  rejectScene: vi.fn(async () => {}),
  rerequestScene: vi.fn(async () => {}),
  regenerateScene: vi.fn(async () => {}),
  expandScene: vi.fn(async () => ({ expanded: true })),
  continueGeneration: vi.fn(async () => {}),
  pause: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(async () => {
    pipeline.phase.value = 'idle'
    pipeline.scenePlan.value = []
    pipeline.writtenScenes.value = []
    pipeline.consistencyReport.value = null
  }),
  resumeGeneration: vi.fn(async () => {}),
  surveyContinuation: vi.fn(async () => null),
  continueDrafting: vi.fn(async () => {}),
  extendStory: vi.fn(async () => {}),
  describeContinuation: () => ''
}

vi.mock('../../composables/useVolumeStoryGenerator', () => ({
  useVolumeStoryGenerator: () => volumePipeline
}))
vi.mock('../../services/db-generation', () => ({ clearGenRun: vi.fn(async () => {}) }))
vi.mock('../../composables/generation/checkpoint', () => ({
  getResumableRun: vi.fn(async () => null)
}))
vi.mock('../../services/langfuseService', () => ({
  langfuseService: {
    createTrace: vi.fn(),
    span: vi.fn(),
    endSpan: vi.fn(),
    score: vi.fn(),
    createGeneration: vi.fn(),
    endGeneration: vi.fn(),
    flush: vi.fn()
  }
}))
vi.mock('../../composables/useGenerationHistory', () => ({
  useGenerationHistory: () => ({
    previousGenerations: ref([]),
    resumableRun: ref(null),
    loadPreviousGenerations: vi.fn(),
    checkResumable: vi.fn(),
    handleDiscardResumable: vi.fn()
  })
}))
vi.mock('../../composables/useResearchScope', () => ({
  useResearchScope: () => ({
    researchDocs: ref([]),
    useResearch: ref(false),
    selectedResearchDocIds: ref(new Set()),
    hasResearchDocs: ref(false),
    selectedResearchCount: ref(0),
    loadResearchSources: vi.fn(async () => {}),
    toggleResearchDoc: vi.fn(),
    selectAllResearch: vi.fn(),
    selectNoResearch: vi.fn(),
    buildResearchScope: () => null
  })
}))
vi.mock('../../composables/useStoryBlurb', () => ({
  useStoryBlurb: () => ({
    generating: ref(false),
    error: ref(null),
    generateBlurb: vi.fn(),
    getBlurbHistory: vi.fn(async () => []),
    deleteBlurb: vi.fn()
  })
}))
vi.mock('../../composables/useStoryDocuments', () => ({
  useStoryDocuments: () => ({ getStoryDocumentContext: vi.fn(async () => '') })
}))
vi.mock('../../composables/useOllama', () => ({
  useCompactConversation: () => ({ getTurns: vi.fn(async () => []) })
}))
vi.mock('../../composables/useStoryExport', () => ({
  useStoryExport: () => ({ exportAsText: vi.fn(), exportAsMarkdown: vi.fn() })
}))
vi.mock('../../composables/useSceneEval', () => ({
  useSceneEval: () => ({
    evaluate: vi.fn(),
    revise: vi.fn(),
    critiqueResult: ref(null),
    revisionResult: ref(null),
    isEvaluating: ref(false),
    isRevising: ref(false)
  })
}))
vi.mock('../../composables/useDriftTriggeredEval', () => ({
  useDriftTriggeredEval: () => ({
    check: vi.fn(),
    isChecking: ref(false),
    lastCheckResult: ref(null),
    hasRecentTriggers: ref(false),
    triggeredActions: ref([]),
    clearTriggers: vi.fn()
  })
}))
vi.mock('../../composables/useActivityLog', () => ({
  useActivityLog: () => ({
    appendThought: vi.fn(),
    addTask: vi.fn(() => 't1'),
    addPhase: vi.fn(() => 'p1'),
    updatePhase: vi.fn(),
    failTask: vi.fn()
  })
}))

const { default: StoryGeneratorPanel } =
  await import('../../components/story/StoryGeneratorPanel.vue')

const stubs = {
  SparkPanel: true,
  BaseIcon: true,
  GenerationSyncPreview: true,
  GenerationLoadingScreen: true,
  GenerationStages: true,
  PreviousGenerationsList: true,
  VolumeReadModal: true,
  StoryContextModal: true,
  ConsistencyReportModal: true,
  ContinueStoryCard: true,
  VolumeCompletePanel: true,
  VolumeSceneReview: true
}

/**
 * Drain the whole handler chain: panel handler → composable → pipeline → gate
 * → expansion round → re-measure. Microtask ticks alone stop halfway through it.
 */
async function flush(wrapper) {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  await wrapper.vm.$nextTick()
}

async function openChapterTab() {
  const wrapper = mount(StoryGeneratorPanel, { global: { stubs } })
  await flush(wrapper)
  const button = wrapper.findAll('button').find((b) => b.text().trim() === 'Chapter')
  await button.trigger('click')
  await flush(wrapper)
  return wrapper
}

describe('StoryGeneratorPanel — chapter flow end to end', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const projectStore = useProjectStore()
    projectStore.currentProjectId = 'p1'
    projectStore.currentCategory = 'Fiction'
    projectStore.currentDescription = 'A hero walks into a storm and does not walk out the same.'
    vi.clearAllMocks()
    pipeline.phase.value = 'idle'
    pipeline.scenePlan.value = []
    pipeline.writtenScenes.value = []
    pipeline.consistencyReport.value = null
    pipeline.wordsPerScene = 1200
    pipeline.lastStartArgs = null
  })

  it('generate → plan preview → confirm → complete, with the gate passing', async () => {
    const wrapper = await openChapterTab()

    await wrapper.find('[data-test="generate-chapter-btn"]').trigger('click')
    await flush(wrapper)

    // The run was sized as one chapter of N scenes, not the one-scene
    // `singleChapter` shape the arc path uses.
    expect(pipeline.lastStartArgs.singleChapter).toBeUndefined()
    expect(pipeline.lastStartArgs.structure.chaptersPerVolume).toBe(1)
    expect(pipeline.lastStartArgs.structure.volumes).toBe(1)
    expect(pipeline.phase.value).toBe('plan-preview')

    const preview = wrapper.findComponent({ name: 'VolumePlanPreview' })
    expect(preview.exists()).toBe(true)
    expect(preview.props('planLabel')).toBe('Chapter')
    expect(preview.props('sceneCount')).toBe(pipeline.scenePlan.value.length)

    preview.vm.$emit('confirm')
    await flush(wrapper)

    expect(volumePipeline.confirmPlan).toHaveBeenCalledTimes(1)
    expect(pipeline.phase.value).toBe('complete')
    expect(pipeline.writtenScenes.value).toHaveLength(pipeline.scenePlan.value.length)

    const report = wrapper.find('[data-test="chapter-gate-report"]')
    expect(report.exists()).toBe(true)
    expect(report.text()).toContain('Chapter gate passed')
  })

  it('an unresolved continuity issue blocks the gate but keeps the prose', async () => {
    const wrapper = await openChapterTab()
    await wrapper.find('[data-test="generate-chapter-btn"]').trigger('click')
    await flush(wrapper)

    pipeline.consistencyReport.value = { issueCount: 2 }
    wrapper.findComponent({ name: 'VolumePlanPreview' }).vm.$emit('confirm')
    await flush(wrapper)

    const report = wrapper.find('[data-test="chapter-gate-report"]')
    expect(report.text()).toContain('Chapter gate found blocking issues')
    expect(report.text()).toContain('continuity issue')
    // Reports, does not delete.
    expect(pipeline.writtenScenes.value.length).toBeGreaterThan(0)
    expect(wrapper.findComponent({ name: 'VolumeCompletePanel' }).exists()).toBe(true)
    expect(volumePipeline.runHealth.record).toHaveBeenCalledWith(
      'gate_failed',
      expect.objectContaining({ stage: 'chapterGate' })
    )
  })

  it('a short chapter takes one bounded expansion round and still completes', async () => {
    pipeline.wordsPerScene = 20
    const wrapper = await openChapterTab()
    await wrapper.find('[data-test="generate-chapter-btn"]').trigger('click')
    await flush(wrapper)

    wrapper.findComponent({ name: 'VolumePlanPreview' }).vm.$emit('confirm')
    await flush(wrapper)

    expect(volumePipeline.expandScene).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="chapter-gate-report"]').text()).toContain('unique words')
    expect(pipeline.phase.value).toBe('complete')
  })

  it('cancelling the plan preview resets only the chapter run', async () => {
    const wrapper = await openChapterTab()
    await wrapper.find('[data-test="generate-chapter-btn"]').trigger('click')
    await flush(wrapper)

    wrapper.findComponent({ name: 'VolumePlanPreview' }).vm.$emit('cancel')
    await flush(wrapper)

    expect(volumePipeline.reset).toHaveBeenCalled()
    expect(pipeline.phase.value).toBe('idle')
    expect(wrapper.find('[data-test="generate-chapter-btn"]').exists()).toBe(true)
  })
})
