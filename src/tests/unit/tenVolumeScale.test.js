/**
 * Scale harness: 10 volumes, 6,000 words per chapter.
 *
 * The unit suite proves each piece in isolation at toy sizes (2-6 chapters).
 * This drives the REAL planner at the shape an author actually asks for from
 * the "Precise structure" form — 10 volumes x 10 chapters x 6,000 words — and
 * checks the invariants that only break at scale:
 *
 *   - every chapter lands in the right volume (confirmPlan creates volume
 *     records from `volumeIndex`, so a collapsed index silently produces a
 *     one-volume book),
 *   - the word target survives the plan -> scene -> writer handoff,
 *   - the call count and session budget are sized for the run, not for a chat
 *     turn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const VOLUMES = 10
const CHAPTERS_PER_VOLUME = 10
const WORDS_PER_CHAPTER = 6000
const SCENES_PER_CHAPTER = 3
const TOTAL_CHAPTERS = VOLUMES * CHAPTERS_PER_VOLUME
const TOTAL_SCENES = TOTAL_CHAPTERS * SCENES_PER_CHAPTER

const STRUCTURE = {
  volumes: VOLUMES,
  chaptersPerVolume: CHAPTERS_PER_VOLUME,
  chapters: TOTAL_CHAPTERS,
  scenesPerChapter: SCENES_PER_CHAPTER,
  wordsPerChapter: WORDS_PER_CHAPTER
}

// Records every provider call the planner makes, so the test can assert on
// batching and budget sizing as well as on the returned plan.
const calls = []

const mockAiGenerate = vi.fn(async (_user, _system, opts = {}) => {
  calls.push(opts)
  const schemaName = opts.schemaName

  if (schemaName === 'chapter_scenes') {
    const count = opts.schema?.properties?.scenes?.maxItems ?? SCENES_PER_CHAPTER
    return {
      scenes: Array.from({ length: count }, (_, j) => ({
        sceneNumber: j + 1,
        title: `Scene ${j + 1}`,
        emotionalGoal: 'goal',
        whatChanges: 'change',
        obstacle: 'obstacle',
        charactersPresent: ['Ines'],
        characterWants: { Ines: 'the truth' },
        location: 'The Docks',
        setup: 'setup',
        payoff: 'none',
        sensoryAnchor: 'salt air',
        arcPosition: 'setup',
        tension: 'medium',
        pacing: 'medium'
      }))
    }
  }

  // title_repair — the quota audit re-asks for offending titles. Answering with
  // an empty set is the "model declined to improve them" path, which leaves the
  // originals standing and keeps these tests focused on batching and padding.
  if (opts.schemaName === 'title_repair') return { titles: [] }

  // chapter_skeleton
  const count = opts.schema?.properties?.chapters?.maxItems ?? 12
  const first = calls.filter((c) => c.schemaName === 'chapter_skeleton').length === 1
  const offset = calls.filter((c) => c.schemaName === 'chapter_skeleton').length - 1
  return {
    ...(first
      ? {
          storyArc: {
            premise: 'p',
            genre: 'Thriller',
            tone: 'Bleak',
            centralConflict: 'c',
            emotionalJourney: 'e',
            resolution: 'r'
          }
        }
      : {}),
    chapters: Array.from({ length: count }, (_, k) => ({
      chapterNumber: offset * 12 + k + 1,
      title: `Chapter ${offset * 12 + k + 1}`,
      goal: 'goal',
      arcPosition: 'rising',
      emotionalTarget: 'dread',
      hookEnding: `hook ${offset * 12 + k + 1}`
    }))
  }
})

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: async (user, system, onChunk, opts) => {
    const res = await mockAiGenerate(user, system, opts)
    onChunk(typeof res === 'string' ? res : JSON.stringify(res))
    return res
  },
  aiGenerateStructured: (...args) => mockAiGenerate(...args),
  resolveFeatureConfig: () => ({ provider: 'ollama', model: 'qwen3:8b' })
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({
    activeWorkspaceType: 'creative',
    currentProjectId: 'p1',
    getActivePrompts: vi.fn(() => ({ director: 'You are a story architect.' })),
    promptOverrides: { director: '' }
  })
}))

vi.mock('@/services/researchDb', () => ({
  getAllChunksForProject: vi.fn(async () => []),
  getAllResearchDocuments: vi.fn(async () => [])
}))

vi.mock('@/guardrails/integration/composableGuardrails', () => ({
  guardPlan: vi.fn(async () => ({ ok: true }))
}))

let useStoryDirector, enforceStructure
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  calls.length = 0
  const mod = await import('@/composables/useStoryDirector')
  useStoryDirector = mod.useStoryDirector
  enforceStructure = mod.enforceStructure
})

async function planTenVolumes() {
  const { generateStoryPlan } = useStoryDirector()
  return generateStoryPlan({
    goal: {
      premise: 'A harbour inspector finds the same body twice.',
      genre: 'Thriller',
      tone: 'Bleak',
      wordTarget: TOTAL_CHAPTERS * WORDS_PER_CHAPTER,
      horizon: 'long_term',
      structure: STRUCTURE
    },
    evidence: '',
    research: null,
    onPartialData: () => {}
  })
}

describe('10-volume / 6,000-words-per-chapter scale', () => {
  it('plans exactly the requested chapter and scene count', async () => {
    const plan = await planTenVolumes()
    expect(plan.chapters).toHaveLength(TOTAL_CHAPTERS)
    expect(plan.scenes).toHaveLength(TOTAL_SCENES)
    expect(plan.chapters.every((c) => c.scenes.length === SCENES_PER_CHAPTER)).toBe(true)
  }, 60000)

  it('spreads chapters across all 10 volumes, 10 chapters each', async () => {
    const plan = await planTenVolumes()
    const perVolume = {}
    for (const c of plan.chapters) perVolume[c.volumeIndex] = (perVolume[c.volumeIndex] || 0) + 1

    expect(
      Object.keys(perVolume)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual(Array.from({ length: VOLUMES }, (_, i) => i + 1))
    expect(Object.values(perVolume).every((n) => n === CHAPTERS_PER_VOLUME)).toBe(true)
  }, 60000)

  it('carries the 6,000-word chapter target down to every scene brief', async () => {
    const plan = await planTenVolumes()
    for (const c of plan.chapters) {
      expect(c.estimatedWords).toBe(WORDS_PER_CHAPTER)
      const sum = c.scenes.reduce((t, s) => t + s.estimatedWords, 0)
      expect(sum).toBe(WORDS_PER_CHAPTER)
    }
    expect(plan.storyArc.totalEstimatedWords).toBe(TOTAL_CHAPTERS * WORDS_PER_CHAPTER)
  }, 60000)

  it('batches the skeleton instead of asking for 100 chapters in one call', async () => {
    await planTenVolumes()
    const skeleton = calls.filter((c) => c.schemaName === 'chapter_skeleton')
    const scenes = calls.filter((c) => c.schemaName === 'chapter_scenes')

    expect(skeleton).toHaveLength(Math.ceil(TOTAL_CHAPTERS / 12))
    expect(scenes).toHaveLength(TOTAL_CHAPTERS)
    // No single call may be asked for more than one batch of chapters.
    expect(Math.max(...skeleton.map((c) => c.schema.properties.chapters.maxItems))).toBe(12)
    // Every call must carry a bounded token cap; an unbounded one is what used
    // to run to num_predict and time the planning stage out.
    expect(calls.every((c) => Number.isFinite(c.maxTokens) && c.maxTokens > 0)).toBe(true)
  }, 60000)
})

describe('degraded provider at 10-volume scale', () => {
  it('pads a failed skeleton batch into 12 placeholder chapters', async () => {
    // Fail exactly one skeleton batch — the flaky-call case, not a dead provider.
    let skeletonSeen = 0
    mockAiGenerate.mockImplementation(async (_u, _s, opts = {}) => {
      calls.push(opts)
      if (opts.schemaName === 'chapter_skeleton') {
        skeletonSeen++
        if (skeletonSeen === 3) throw new Error('provider hiccup')
        const count = opts.schema.properties.chapters.maxItems
        return {
          ...(skeletonSeen === 1 ? { storyArc: { premise: 'p' } } : {}),
          chapters: Array.from({ length: count }, (_, k) => ({
            title: `Real chapter ${skeletonSeen}-${k + 1}`,
            goal: 'goal',
            hookEnding: 'hook',
            emotionalTarget: 'dread'
          }))
        }
      }
      if (opts.schemaName === 'title_repair') return { titles: [] }
      const count = opts.schema.properties.scenes.maxItems
      return {
        scenes: Array.from({ length: count }, (_, j) => ({
          sceneNumber: j + 1,
          title: `Scene ${j + 1}`,
          obstacle: 'o',
          arcPosition: 'setup'
        }))
      }
    })

    const plan = await planTenVolumes()

    // Full length is preserved...
    expect(plan.chapters).toHaveLength(TOTAL_CHAPTERS)
    // ...but a whole batch is content-free placeholder.
    const placeholders = plan.chapters.filter(
      (c) => /^Chapter \d+$/.test(c.title) && !c.goal && !c.hookEnding
    )
    expect(placeholders).toHaveLength(12)
  }, 60000)

  it('pads a failed scene plan into content-free scene briefs', async () => {
    // Every scene call fails; skeletons succeed. This is the "provider degraded
    // halfway through planning" case.
    mockAiGenerate.mockImplementation(async (_u, _s, opts = {}) => {
      calls.push(opts)
      if (opts.schemaName === 'chapter_scenes') throw new Error('scene plan failed')
      const count = opts.schema.properties.chapters.maxItems
      return {
        storyArc: { premise: 'p' },
        chapters: Array.from({ length: count }, (_, k) => ({
          title: `Real chapter ${k + 1}`,
          goal: 'goal',
          hookEnding: 'hook',
          emotionalTarget: 'dread'
        }))
      }
    })

    const plan = await planTenVolumes()

    // The plan is full length and correctly sized in words...
    expect(plan.scenes).toHaveLength(TOTAL_SCENES)
    expect(plan.scenes.every((s) => s.estimatedWords === 2000)).toBe(true)
    // ...and every scene brief is a placeholder: one "unknown"-filled fallback
    // per chapter plus two blank pads. The writer will be asked for 2,000 words
    // per scene against no goal and no change.
    const substantive = plan.scenes.filter((s) => s.whatChanges && s.whatChanges !== 'unknown')
    expect(substantive).toHaveLength(0)
    // Which the plan must now say out loud.
    expect(plan.degradation.chaptersWithoutScenePlan).toBe(TOTAL_CHAPTERS)
  }, 60000)

  it('reports planning degradation to the caller instead of only console.warn', async () => {
    // Regression guard for the scale defect: a plan that had to pad must say so,
    // so the structure stage can put it on the run-health ledger and the author
    // is not handed a full-length outline with a blank volume in it.
    let skeletonSeen = 0
    mockAiGenerate.mockImplementation(async (_u, _s, opts = {}) => {
      calls.push(opts)
      if (opts.schemaName === 'chapter_skeleton') {
        skeletonSeen++
        if (skeletonSeen === 3) throw new Error('provider hiccup')
        const count = opts.schema.properties.chapters.maxItems
        return {
          storyArc: { premise: 'p' },
          chapters: Array.from({ length: count }, (_, k) => ({
            title: `Real chapter ${skeletonSeen}-${k + 1}`,
            goal: 'g',
            hookEnding: 'h',
            emotionalTarget: 'd'
          }))
        }
      }
      const count = opts.schema.properties.scenes.maxItems
      return {
        scenes: Array.from({ length: count }, (_, j) => ({
          sceneNumber: j + 1,
          title: `Scene ${j + 1}`,
          emotionalGoal: 'g',
          whatChanges: 'c',
          obstacle: 'o',
          arcPosition: 'setup'
        }))
      }
    })

    const plan = await planTenVolumes()

    expect(plan.degradation).toBeTruthy()
    expect(plan.degradation.paddedChapters).toBe(12)
    expect(plan.degradation.chaptersWithoutScenePlan).toBe(0)
  }, 60000)
})

describe('run sizing for a 10-volume book', () => {
  it('sizes the session budget for the whole run, not one exchange', async () => {
    const { sessionConfigForRun, SessionBudget } = await import('@/services/aiProviderBudget')
    // The single-exchange default the budget is constructed with.
    const defaultConfig = new SessionBudget().config
    const cfg = sessionConfigForRun({
      chapters: TOTAL_CHAPTERS,
      scenes: TOTAL_SCENES,
      localProvider: true
    })

    expect(cfg.softCapCalls).toBeGreaterThan(defaultConfig.softCapCalls)
    // Planning alone is ~109 calls; the writer adds several per scene.
    expect(cfg.softCapCalls).toBeGreaterThan(TOTAL_SCENES)
    expect(cfg.hardCapCalls).toBeGreaterThan(cfg.softCapCalls)
    // Local inference has no spend to cap.
    expect(cfg.softCapCost).toBe(Infinity)
  })

  it('does not trip the budget over a full planning pass', async () => {
    const { SessionBudget } = await import('@/services/aiProviderBudget')
    const budget = new SessionBudget().configureForRun({
      chapters: TOTAL_CHAPTERS,
      scenes: TOTAL_SCENES,
      localProvider: true
    })
    // 9 skeleton + 100 scene calls, generously 1,500 tokens each.
    for (let i = 0; i < 109; i++) budget.record('ollama', 1500, 0)
    expect(budget.check().allowed).toBe(true)
    expect(budget.check().warn).toBeFalsy()
  })
})

describe('writer handling of a 6,000-word chapter', () => {
  it('splits a scene brief only when it exceeds the single-call threshold', async () => {
    const { shouldChunkScene, splitSceneIntoChunks } =
      await import('@/composables/generation/sceneChunker')
    const perScene = WORDS_PER_CHAPTER / SCENES_PER_CHAPTER // 2,000

    expect(shouldChunkScene({ estimatedWords: perScene })).toBe(false)

    // The same 6,000-word chapter written as a single scene must chunk, and the
    // chunks must still add up to the target.
    expect(shouldChunkScene({ estimatedWords: WORDS_PER_CHAPTER })).toBe(true)
    const chunks = splitSceneIntoChunks({ estimatedWords: WORDS_PER_CHAPTER })
    expect(chunks.reduce((t, c) => t + c.estimatedWords, 0)).toBe(WORDS_PER_CHAPTER)
  })

  it('gives a 2,000-word scene enough output tokens to reach its target', () => {
    const estimatedWords = WORDS_PER_CHAPTER / SCENES_PER_CHAPTER
    // Mirrors useStoryWriter's cap.
    const maxTokens = Math.max(2000, Math.min(4500, Math.ceil(estimatedWords * 1.8) + 800))
    // ~0.75 words per token is the conservative English ratio.
    expect(maxTokens * 0.75).toBeGreaterThanOrEqual(estimatedWords)
  })
})
