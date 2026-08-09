import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useChapterStoryGenerator } from '../../composables/generation/useChapterStoryGenerator'

// A stand-in for the pipeline the chapter composable owns. One fresh object per
// call, which is the property under test: `useVolumeStoryGenerator()` builds its
// own `useDelegatorGeneration()`, which builds its own `AgentMemory`, so two
// generators can never share a phase.
const instances = []

function makeVolumeGenerator() {
  const phase = ref('idle')
  const scenePlan = ref([])
  const writtenScenes = ref([])
  const consistencyReport = ref(null)
  const health = {
    records: [],
    record: vi.fn((kind, meta) => health.records.push({ kind, ...meta })),
    countByKind: vi.fn(() => 0),
    degradedScenes: vi.fn(() => 0)
  }

  const api = {
    phase,
    scenePlan,
    writtenScenes,
    consistencyReport,
    progress: { current: 0, total: 0, statusText: '' },
    error: ref(null),
    volumeId: ref(null),
    syncPreview: ref([]),
    runHealth: health,
    memory: { currentTaskId: ref('task-1') },
    startGeneration: vi.fn(async (args) => {
      api.lastStartArgs = args
      const n = args.structure?.scenesPerChapter ?? 1
      scenePlan.value = Array.from({ length: n }, (_, i) => ({
        sceneNumber: i + 1,
        title: `Scene ${i + 1}`,
        estimatedWords: Math.ceil(args.wordTarget / n)
      }))
      phase.value = 'plan-preview'
      return { scenes: scenePlan.value, storyArc: { arc: true }, storyContract: 'contract' }
    }),
    confirmPlan: vi.fn(async ({ editedPlan }) => {
      writtenScenes.value = editedPlan.map((s, i) => ({
        title: s.title,
        sceneNumber: s.sceneNumber ?? i + 1,
        subsectionId: `sub-${i + 1}`,
        characters: [],
        prose: api.proseFor(s, i)
      }))
      phase.value = 'complete'
    }),
    // Overridable so a test can make the chapter come in short. Distinct
    // sentences per scene, or the gate correctly flags the fixture as a loop.
    proseFor: (scene, index) => {
      const target = scene.estimatedWords || 200
      const sentences = []
      for (let w = 0; w < target; w += 8) {
        sentences.push(
          `Scene ${index} sentence ${w} carried the moment forward without repeating itself.`
        )
      }
      return sentences.join(' ')
    },
    resumeGeneration: vi.fn(async () => ({ resumed: true })),
    approveScene: vi.fn(async () => {}),
    rejectScene: vi.fn(async () => {}),
    rerequestScene: vi.fn(async () => {}),
    expandScene: vi.fn(async () => ({ expanded: true })),
    pause: vi.fn(() => {}),
    continueGeneration: vi.fn(async () => {}),
    stop: vi.fn(() => {}),
    reset: vi.fn(async () => {
      phase.value = 'idle'
      scenePlan.value = []
      writtenScenes.value = []
    })
  }
  instances.push(api)
  return api
}

vi.mock('../../composables/useVolumeStoryGenerator', () => ({
  useVolumeStoryGenerator: vi.fn(() => makeVolumeGenerator())
}))

const evalResults = ref([])
vi.mock('../../stores/evalStore', () => ({
  useEvalStore: () => ({ results: evalResults.value })
}))
vi.mock('../../composables/useActivityLog', () => ({
  useActivityLog: () => ({ appendThought: vi.fn(), addTask: vi.fn(), addPhase: vi.fn() })
}))
vi.mock('../../services/langfuseService', () => ({
  langfuseService: {
    createTrace: vi.fn(),
    span: vi.fn(),
    endSpan: vi.fn(),
    score: vi.fn()
  }
}))

const clearGenRun = vi.fn(async () => {})
vi.mock('../../services/db-generation', () => ({
  clearGenRun: (...args) => clearGenRun(...args)
}))

const resumableRun = { value: null }
vi.mock('../../composables/generation/checkpoint', () => ({
  getResumableRun: vi.fn(async (projectId) =>
    resumableRun.value ? { ...resumableRun.value, projectId } : null
  )
}))

const baseSettings = {
  projectId: 'p1',
  synopsis: 'Syn',
  genre: 'Fantasy',
  tone: 'Dark',
  wordTarget: 600,
  scenesPerChapter: 3
}

describe('useChapterStoryGenerator', () => {
  let gen
  let inner

  beforeEach(() => {
    vi.clearAllMocks()
    instances.length = 0
    evalResults.value = []
    resumableRun.value = null
    gen = useChapterStoryGenerator()
    inner = instances[0]
  })

  it('starts with a one-chapter run size and no scenes', () => {
    expect(gen).toBeDefined()
    expect(gen.runSize.value).toEqual({ chapters: 1, scenes: 0 })
    expect(gen.singleChapter.value).toBe(true)
  })

  it('splits the word target evenly across scenes', () => {
    expect(gen.getSceneBudget(600, 3)).toBe(200)
    expect(gen.getSceneBudget(601, 3)).toBe(201)
    expect(gen.getSceneBudget(100, 0)).toBe(100)
  })

  it('getSceneBudget clamps to a minimum of one scene', () => {
    expect(gen.getSceneBudget(500, 0)).toBe(500)
    expect(gen.getSceneBudget(500, -1)).toBe(500)
  })

  it('exposes the full chapter duck-type', () => {
    const expected = [
      'startGeneration',
      'confirmPlan',
      'approveScene',
      'rejectScene',
      'reRequestScene',
      'continueGeneration',
      'pause',
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
    instances[0].phase.value = 'writing'
    expect(gen.phase.value).toBe('writing')
    expect(gen2.phase.value).toBe('idle')
  })

  it('transitions idle -> plan-preview on startGeneration', async () => {
    await gen.startGeneration(baseSettings)
    expect(gen.phase.value).toBe('plan-preview')
    expect(gen.runSize.value).toEqual({ chapters: 1, scenes: 3 })
  })

  // The whole point of the split: `singleChapter` sizes the session budget for
  // ONE scene and truncates the plan to one scene. A chapter is N scenes.
  it('sizes the run as {chapters: 1, scenes: N} and never passes singleChapter', async () => {
    await gen.startGeneration(baseSettings)
    expect(inner.lastStartArgs.singleChapter).toBeUndefined()
    expect(inner.lastStartArgs.structure).toEqual({
      volumes: 1,
      chaptersPerVolume: 1,
      scenesPerChapter: 3,
      wordsPerChapter: 600
    })
    expect(inner.scenePlan.value).toHaveLength(3)
  })

  it('clamps a zero or negative scene count to one', async () => {
    await gen.startGeneration({ ...baseSettings, scenesPerChapter: 0 })
    expect(gen.runSize.value).toEqual({ chapters: 1, scenes: 1 })
  })

  it('a full single-chapter run reaches complete with N scenes written', async () => {
    await gen.startGeneration({ ...baseSettings, scenesPerChapter: 1, wordTarget: 300 })
    await gen.confirmPlan('')
    expect(gen.phase.value).toBe('complete')
    expect(gen.writtenScenes.value).toHaveLength(1)
    expect(gen.writtenScenes.value[0]).toMatchObject({ title: 'Scene 1', sceneNumber: 1 })
  })

  it('runs the chapter gate after the run completes and passes a clean chapter', async () => {
    await gen.startGeneration(baseSettings)
    await gen.confirmPlan('')
    expect(gen.chapterGateReport.value).not.toBeNull()
    expect(gen.chapterGateReport.value.passed).toBe(true)
    expect(gen.chapterGateReport.value.metrics.sceneCount).toBe(3)
  })

  it('the gate blocks on unresolved continuity but keeps the prose', async () => {
    await gen.startGeneration(baseSettings)
    inner.consistencyReport.value = { issueCount: 2 }
    await gen.confirmPlan('')
    const report = gen.chapterGateReport.value
    expect(report.passed).toBe(false)
    expect(report.findings.map((f) => f.code)).toContain('continuity_unresolved')
    // Reports, does not delete.
    expect(gen.phase.value).toBe('complete')
    expect(gen.writtenScenes.value).toHaveLength(3)
    expect(inner.runHealth.record).toHaveBeenCalledWith(
      'gate_failed',
      expect.objectContaining({ stage: 'chapterGate' })
    )
  })

  it('a short chapter warns and takes one bounded expansion round — never errors', async () => {
    inner.proseFor = () => 'Far too short to count.'
    await gen.startGeneration(baseSettings)
    await gen.confirmPlan('')
    const report = gen.chapterGateReport.value
    expect(report.findings.map((f) => f.code)).toContain('chapter_short')
    expect(report.findings.find((f) => f.code === 'chapter_short').severity).toBe('warn')
    // Two shortest scenes, one round, then re-measured once.
    expect(inner.expandScene).toHaveBeenCalledTimes(2)
    expect(gen.phase.value).toBe('complete')
  })

  it('pause and continue delegate to the run without aborting it', async () => {
    await gen.startGeneration(baseSettings)
    gen.pause()
    expect(inner.pause).toHaveBeenCalled()
    expect(inner.stop).not.toHaveBeenCalled()
    await gen.continueGeneration()
    expect(inner.continueGeneration).toHaveBeenCalled()
  })

  it('resume replays the run and gates it when it finishes', async () => {
    await gen.startGeneration(baseSettings)
    inner.resumeGeneration.mockImplementation(async () => {
      inner.writtenScenes.value = inner.scenePlan.value.map((s, i) => ({
        title: s.title,
        sceneNumber: s.sceneNumber,
        subsectionId: `sub-${i + 1}`,
        characters: [],
        prose: inner.proseFor(s, i)
      }))
      inner.phase.value = 'complete'
    })
    await gen.resumeGeneration({ projectId: 'p1' })
    expect(inner.resumeGeneration).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(gen.chapterGateReport.value).not.toBeNull()
  })

  it('reset returns to idle and clears the persisted run', async () => {
    await gen.startGeneration(baseSettings)
    await gen.reset()
    expect(gen.phase.value).toBe('idle')
    expect(gen.runSize.value).toEqual({ chapters: 1, scenes: 0 })
    expect(gen.chapterGateReport.value).toBeNull()
    expect(clearGenRun).toHaveBeenCalledWith('p1')
    expect(await gen.getResumableRun('p1')).toBeNull()
  })

  it('getResumableRun surfaces the checkpoint written by the run', async () => {
    resumableRun.value = { written: 1, total: 2, updatedAt: 1 }
    expect(await gen.getResumableRun('p1')).toMatchObject({
      written: 1,
      total: 2,
      projectId: 'p1'
    })
  })

  it('reRequestScene ignores empty notes and forwards real ones', async () => {
    await gen.reRequestScene('   ')
    expect(inner.rerequestScene).not.toHaveBeenCalled()
    await gen.reRequestScene('more tension')
    expect(inner.rerequestScene).toHaveBeenCalledWith('more tension')
  })

  it('destroy stops the run so an unmount cannot leave a writer behind', () => {
    gen.destroy()
    expect(inner.stop).toHaveBeenCalled()
  })
})
