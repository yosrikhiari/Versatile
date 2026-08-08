import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// `batchEndIndex` is a pure function, but it lives in a composable whose module
// graph reaches the whole AI layer. Same mock set the spine suite uses.
vi.mock('@/composables/useAiService', () => ({
  aiGenerate: vi.fn(),
  aiGenerateJson: vi.fn(),
  resolveFeatureConfig: () => ({ provider: 'ollama' })
}))
vi.mock('../stores/storyBibleStore', () => ({ useStoryBibleStore: vi.fn() }))
vi.mock('../stores/volumeStore', () => ({ useVolumeStore: vi.fn() }))
vi.mock('../stores/manuscriptStore', () => ({ useManuscriptStore: vi.fn() }))
vi.mock('../stores/storyGraphStore', () => ({ useStoryGraphStore: vi.fn() }))
vi.mock('./useStoryDirector', () => ({ useStoryDirector: vi.fn() }))
vi.mock('./useEntityBootstrapper', () => ({ useEntityBootstrapper: vi.fn() }))
vi.mock('./useStoryWriter', () => ({ useStoryWriter: vi.fn() }))
vi.mock('./useStoryCritic', () => ({ useStoryCritic: vi.fn() }))
vi.mock('./useChapterGenerationSync', () => ({ useChapterGenerationSync: vi.fn() }))
vi.mock('./useStoryDocuments', () => ({ useStoryDocuments: vi.fn() }))
vi.mock('./useActivityLog', () => ({ useActivityLog: vi.fn() }))
vi.mock('../services/aiService', () => ({ aiGenerate: vi.fn() }))
vi.mock('../config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDERS: { OLLAMA: 'ollama', OPENAI: 'openai' }
}))

let batchEndIndex
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useVolumeStoryGenerator')
  batchEndIndex = mod.batchEndIndex
})

/** A chapter plan of `chapters` chapters, each holding `scenesPer` scenes. */
function makePlan(chapters, scenesPer) {
  return Array.from({ length: chapters }, (_, i) => ({
    chapterNumber: i + 1,
    title: `Chapter ${i + 1}`,
    scenes: Array.from({ length: scenesPer }, (_, s) => ({ sceneNumber: i * scenesPer + s + 1 }))
  }))
}

/** Walk the whole plan the way `writeNextBatch` recurses, collecting boundaries. */
function walkBoundaries(chapters, totalScenes) {
  const stops = []
  let i = 0
  // Bounded so a non-advancing boundary fails loudly instead of hanging.
  for (let guard = 0; i < totalScenes && guard <= totalScenes; guard++) {
    const end = batchEndIndex(i, chapters, totalScenes)
    expect(end).toBeGreaterThan(i)
    stops.push(end)
    i = end
  }
  return stops
}

/** Cumulative scene index at the end of each chapter. */
function chapterEnds(chapters) {
  const ends = []
  let offset = 0
  for (const ch of chapters) {
    offset += ch.scenes.length
    ends.push(offset)
  }
  return ends
}

describe('batchEndIndex — chapter-aligned batching', () => {
  it('lands on every chapter end at the default 3 scenes per chapter', () => {
    const chapters = makePlan(4, 3)
    expect(walkBoundaries(chapters, 12)).toEqual([3, 6, 9, 12])
  })

  it('lands on every chapter end at 4 scenes per chapter', () => {
    // The regression this exists for. A fixed stride of 3 produced
    // 3, 6, 9, 12 — coinciding with chapter ends (4, 8, 12) only at 12, so the
    // incremental consistency audit fired for one chapter in four.
    const chapters = makePlan(4, 4)
    expect(walkBoundaries(chapters, 16)).toEqual([4, 8, 12, 16])
  })

  it.each([1, 2, 3, 4, 5, 6])(
    'stops on every chapter end at %i scenes per chapter',
    (scenesPer) => {
      const chapters = makePlan(5, scenesPer)
      const total = 5 * scenesPer
      const stops = new Set(walkBoundaries(chapters, total))
      for (const end of chapterEnds(chapters)) {
        expect(stops.has(end)).toBe(true)
      }
    }
  )

  it('handles chapters of differing lengths', () => {
    const chapters = [
      { scenes: [{}, {}] },
      { scenes: [{}, {}, {}, {}] },
      { scenes: [{}] },
      { scenes: [{}, {}, {}] }
    ]
    expect(walkBoundaries(chapters, 10)).toEqual([2, 6, 7, 10])
  })

  it('caps a long chapter rather than syncing the bible once at its end', () => {
    // A 9-scene chapter splits 6 + 3; both stops stay inside the chapter and the
    // second is its end, so alignment survives the cap.
    const chapters = [{ scenes: Array.from({ length: 9 }, () => ({})) }]
    expect(walkBoundaries(chapters, 9)).toEqual([6, 9])
  })

  it('never returns a boundary past the plan length', () => {
    // A chapter plan can outrun the scene plan mid-run: the plan is confirmed
    // before every scene exists on it.
    const chapters = makePlan(4, 4)
    expect(batchEndIndex(0, chapters, 2)).toBe(2)
    expect(batchEndIndex(12, chapters, 14)).toBe(14)
  })

  it('falls back to the fixed stride with no chapter plan', () => {
    expect(batchEndIndex(0, [], 12)).toBe(3)
    expect(batchEndIndex(0, null, 12)).toBe(3)
    expect(batchEndIndex(0, undefined, 12)).toBe(3)
    expect(batchEndIndex(10, [], 12)).toBe(12)
  })

  it('falls back to the fixed stride past the last planned chapter', () => {
    // `continueStory` appends scenes beyond the chapters planned for them.
    const chapters = makePlan(2, 3)
    expect(batchEndIndex(6, chapters, 12)).toBe(9)
  })

  it('tolerates chapters carrying no scenes', () => {
    const chapters = [{ scenes: [] }, { scenes: [{}, {}] }, {}, { scenes: [{}, {}] }]
    expect(batchEndIndex(0, chapters, 4)).toBe(2)
    expect(batchEndIndex(2, chapters, 4)).toBe(4)
  })

  it('advances from an unaligned start index', () => {
    // Scene-review mode resumes at an arbitrary index via `onWriteNextBatch`.
    const chapters = makePlan(4, 4)
    expect(batchEndIndex(1, chapters, 16)).toBe(4)
    expect(batchEndIndex(5, chapters, 16)).toBe(8)
  })
})

describe('incremental consistency audit at 4 scenes per chapter', () => {
  it('runs once per chapter on the boundaries batchEndIndex produces', async () => {
    const { ConsistencyService } =
      await import('@/composables/generation/consistency/ConsistencyService')

    const chapters = makePlan(4, 4)
    const totalScenes = 16
    const checkContradictions = vi.fn().mockResolvedValue({
      characterIssues: [],
      locationIssues: []
    })

    const svc = new ConsistencyService({
      writeParams: ref({}),
      scenePlan: ref(Array.from({ length: totalScenes }, (_, i) => ({ sceneNumber: i + 1 }))),
      chapterPlan: ref(chapters),
      spineArray: ref([]),
      autoMode: ref(false),
      writtenScenes: ref(
        Array.from({ length: totalScenes }, (_, i) => ({
          sceneNumber: i + 1,
          summary: `scene ${i + 1}`,
          prose: `prose ${i + 1}`
        }))
      ),
      consistencyReport: ref(null),
      phase: ref('writing'),
      progress: { statusText: '' },
      storyBibleStore: {
        characters: [{ name: 'Ana' }, { name: 'Bo' }],
        locations: [{ name: 'Keep' }, { name: 'Ford' }]
      },
      critic: { checkContradictions },
      writer: {},
      manuscriptStore: {},
      updateGenRunStage: vi.fn(),
      actLog: { addPhase: vi.fn(), updatePhase: vi.fn() }
    })

    for (const end of walkBoundaries(chapters, totalScenes)) {
      await svc.maybeRunIncrementalConsistency(end)
    }

    // Chapters 1-3. The final boundary is the end of the run, where the
    // terminal audit takes over — `maybeRunIncrementalConsistency` deliberately
    // skips it rather than auditing the same prose twice.
    expect(checkContradictions).toHaveBeenCalledTimes(3)
  })
})

describe('runBatchLoop — iteration, not recursion', () => {
  let runBatchLoop
  beforeEach(async () => {
    const mod = await import('@/composables/useVolumeStoryGenerator')
    runBatchLoop = mod.runBatchLoop
  })

  /**
   * Count how many batch calls are live at once.
   *
   * This — not stack depth — is the property that matters. An `await`ed
   * recursive call does not grow the synchronous JS stack (each continuation
   * resumes on a fresh one), so a stack measurement cannot tell the two apart.
   * What recursion does do is keep every caller's frame *suspended and
   * reachable*, and each of those frames pins that batch's chapter log, earlier
   * chapters and entity blob for the whole run.
   */
  function liveCallTracker() {
    let live = 0
    let peak = 0
    return {
      peak: () => peak,
      wrap:
        (fn) =>
        async (...args) => {
          live++
          peak = Math.max(peak, live)
          try {
            return await fn(...args)
          } finally {
            live--
          }
        }
    }
  }

  it('walks every batch to the end and stops on null', async () => {
    const chapters = makePlan(6, 3)
    const total = 18
    const visited = []

    await runBatchLoop(
      async (startIndex) => {
        visited.push(startIndex)
        const end = batchEndIndex(startIndex, chapters, total)
        return end < total ? { startIndex: end, focusInstructions: '' } : null
      },
      0,
      ''
    )

    expect(visited).toEqual([0, 3, 6, 9, 12, 15])
  })

  it('threads focus instructions from one batch into the next', async () => {
    // Eval feedback, drift regressions and the active-learning bridge all
    // accumulate here — losing it across the hop would silently drop the
    // steering the previous batch earned.
    const received = []

    await runBatchLoop(
      async (startIndex, focusInstructions) => {
        received.push(focusInstructions)
        if (startIndex >= 3) return null
        return { startIndex: startIndex + 1, focusInstructions: `after-${startIndex}` }
      },
      0,
      'seed'
    )

    expect(received).toEqual(['seed', 'after-0', 'after-1', 'after-2'])
  })

  it('stops immediately when the first batch returns null', async () => {
    const runBatch = vi.fn().mockResolvedValue(null)
    await runBatchLoop(runBatch, 7, 'x')
    expect(runBatch).toHaveBeenCalledTimes(1)
    expect(runBatch).toHaveBeenCalledWith(7, 'x')
  })

  it('holds one batch live at a time, where recursion held all of them', async () => {
    // The property the whole refactor exists for, measured against a recursive
    // reference in the same test — so a measurement too coarse to tell them
    // apart fails here rather than passing vacuously.
    const BATCHES = 40

    const loop = liveCallTracker()
    await runBatchLoop(
      loop.wrap(async (startIndex) =>
        startIndex + 1 < BATCHES ? { startIndex: startIndex + 1, focusInstructions: '' } : null
      ),
      0,
      ''
    )

    const recursion = liveCallTracker()
    const recursive = recursion.wrap(async (startIndex) => {
      if (startIndex + 1 < BATCHES) await recursive(startIndex + 1)
    })
    await recursive(0)

    // Every frame of the old shape stayed suspended until the run unwound —
    // forty batches meant forty live copies of the batch context.
    expect(recursion.peak()).toBe(BATCHES)
    // The loop releases each one before starting the next.
    expect(loop.peak()).toBe(1)
  })
})
