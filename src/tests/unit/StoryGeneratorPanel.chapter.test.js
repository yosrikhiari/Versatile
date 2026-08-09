import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '../../stores/projectStore'

function makeGenerator(overrides = {}) {
  return {
    phase: ref('idle'),
    progress: { current: 0, total: 0, statusText: '' },
    error: ref(null),
    volumeId: ref(null),
    scenePlan: ref([]),
    writtenScenes: ref([]),
    consistencyReport: ref(null),
    syncPreview: ref([]),
    currentSceneResult: ref(null),
    chapterGateReport: ref(null),
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
    runSize: ref({ chapters: 1, scenes: 3 }),
    getSceneBudget: (total, scenes) => Math.ceil(total / Math.max(1, scenes)),
    startGeneration: vi.fn(async () => ({ storyArc: null, storyContract: '' })),
    confirmPlan: vi.fn(async () => {}),
    confirmSync: vi.fn(async () => {}),
    approveScene: vi.fn(async () => {}),
    rejectScene: vi.fn(async () => {}),
    rerequestScene: vi.fn(async () => {}),
    reRequestScene: vi.fn(async () => {}),
    regenerateScene: vi.fn(async () => {}),
    continueGeneration: vi.fn(async () => {}),
    pause: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(async () => {}),
    resumeGeneration: vi.fn(async () => {}),
    getResumableRun: vi.fn(async () => null),
    surveyContinuation: vi.fn(async () => null),
    continueDrafting: vi.fn(async () => {}),
    extendStory: vi.fn(async () => {}),
    describeContinuation: () => '',
    destroy: vi.fn(),
    ...overrides
  }
}

const volumeGen = makeGenerator()
const chapterGen = makeGenerator()

vi.mock('../../composables/useVolumeStoryGenerator', () => ({
  useVolumeStoryGenerator: () => volumeGen
}))
vi.mock('../../composables/generation/useChapterStoryGenerator', () => ({
  useChapterStoryGenerator: () => chapterGen
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
  GenerationSettingsForm: true,
  ContinueStoryCard: true,
  VolumeCompletePanel: true,
  VolumeSceneReview: true,
  VolumePlanPreview: true
}

/** Let every `onMounted` promise settle before asserting on what it rendered. */
async function flush(wrapper) {
  await Promise.resolve()
  await Promise.resolve()
  await wrapper.vm.$nextTick()
}

async function mountPanel() {
  const wrapper = mount(StoryGeneratorPanel, { global: { stubs } })
  await flush(wrapper)
  return wrapper
}

async function switchTo(wrapper, label) {
  const button = wrapper.findAll('button').find((b) => b.text().trim() === label)
  expect(button, `no "${label}" tab button`).toBeTruthy()
  await button.trigger('click')
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('StoryGeneratorPanel — chapter tab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // The Generate button is gated on a synopsis, which the panel derives from
    // the project's category and description.
    const projectStore = useProjectStore()
    projectStore.currentProjectId = 'p1'
    projectStore.currentCategory = 'Fiction'
    projectStore.currentDescription = 'A hero walks into a storm and does not walk out the same.'
    vi.clearAllMocks()
    volumeGen.phase.value = 'idle'
    chapterGen.phase.value = 'idle'
    chapterGen.chapterGateReport.value = null
    chapterGen.getResumableRun.mockResolvedValue(null)
  })

  it('renders the chapter pipeline block, and only it, when tab === chapter', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    expect(wrapper.find('[data-test="chapter-pipeline"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="volume-pipeline"]').exists()).toBe(false)
  })

  it('renders the volume pipeline on the Arc tab and no chapter block', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Arc')
    expect(wrapper.find('[data-test="volume-pipeline"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="chapter-pipeline"]').exists()).toBe(false)
  })

  it('never touches the volume generator on a chapter run', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    await wrapper.find('[data-test="generate-chapter-btn"]').trigger('click')
    expect(chapterGen.startGeneration).toHaveBeenCalled()
    expect(volumeGen.startGeneration).not.toHaveBeenCalled()
    expect(volumeGen.confirmPlan).not.toHaveBeenCalled()
    expect(volumeGen.reset).not.toHaveBeenCalled()
  })

  it('sends the scene count and word target the form is holding', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    await wrapper.find('[data-test="generate-chapter-btn"]').trigger('click')
    const args = chapterGen.startGeneration.mock.calls[0][0]
    expect(args).toMatchObject({ scenesPerChapter: expect.any(Number) })
    expect(args.wordTarget).toBeGreaterThan(0)
    expect(args.singleChapter).toBeUndefined()
  })

  it('switching tabs does not tear down or restart either run', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    await switchTo(wrapper, 'Arc')
    await switchTo(wrapper, 'Chapter')
    expect(chapterGen.reset).not.toHaveBeenCalled()
    expect(volumeGen.reset).not.toHaveBeenCalled()
    expect(chapterGen.destroy).not.toHaveBeenCalled()
    expect(volumeGen.phase.value).toBe('idle')
  })

  it('offers the resume card when a chapter checkpoint exists', async () => {
    chapterGen.getResumableRun.mockResolvedValue({ written: 1, total: 3, projectId: 'p1' })
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    const card = wrapper.find('[data-test="chapter-resume-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('1 of 3')
    await wrapper.find('[data-test="chapter-resume-btn"]').trigger('click')
    expect(chapterGen.resumeGeneration).toHaveBeenCalled()
    expect(volumeGen.resumeGeneration).not.toHaveBeenCalled()
  })

  it('shows the chapter gate report once the run completes', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    chapterGen.phase.value = 'complete'
    chapterGen.chapterGateReport.value = {
      passed: false,
      findings: [
        { code: 'continuity_unresolved', severity: 'block', message: '2 continuity issue(s).' },
        { code: 'chapter_short', severity: 'warn', message: 'Chapter is short.' }
      ],
      metrics: { sceneCount: 3, uniqueWords: 400, targetWords: 600, wordRatio: 0.66 }
    }
    await wrapper.vm.$nextTick()
    const report = wrapper.find('[data-test="chapter-gate-report"]')
    expect(report.exists()).toBe(true)
    expect(report.text()).toContain('Chapter gate found blocking issues')
    expect(report.text()).toContain('2 continuity issue(s).')
    expect(report.text()).toContain('Chapter is short.')
  })

  it('renders the paused controls and continues the chapter run', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    chapterGen.phase.value = 'paused'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="chapter-paused"]').exists()).toBe(true)
    await wrapper.find('[data-test="chapter-continue-btn"]').trigger('click')
    expect(chapterGen.continueGeneration).toHaveBeenCalled()
    expect(volumeGen.continueGeneration).not.toHaveBeenCalled()
  })

  it('surfaces a chapter error and resets only the chapter run', async () => {
    const wrapper = await mountPanel()
    await switchTo(wrapper, 'Chapter')
    chapterGen.phase.value = 'error'
    chapterGen.error.value = 'Provider unreachable'
    await wrapper.vm.$nextTick()
    const block = wrapper.find('[data-test="chapter-error"]')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('Provider unreachable')
    await block.find('button').trigger('click')
    expect(chapterGen.reset).toHaveBeenCalled()
    expect(volumeGen.reset).not.toHaveBeenCalled()
  })

  it('stops the chapter run when the panel unmounts', async () => {
    const wrapper = await mountPanel()
    wrapper.unmount()
    expect(chapterGen.destroy).toHaveBeenCalled()
  })
})
