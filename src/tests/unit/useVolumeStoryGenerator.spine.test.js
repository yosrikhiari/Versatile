import { describe, it, expect, vi, beforeEach } from 'vitest'

// Control the AI layer directly so we can drive spine generation deterministically
// (success, failure, and mixed) without a real provider or Pinia.
const mockAiGenerateJson = vi.fn()
vi.mock('@/composables/useAiService', () => ({
  aiGenerate: vi.fn(),
  aiGenerateJson: (...args) => mockAiGenerateJson(...args),
  resolveFeatureConfig: () => ({ provider: 'ollama' }) // → PARALLEL_CHAPTER_LIMIT = 1 (deterministic order)
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

let generateSpine, fallbackSpineEntry
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useVolumeStoryGenerator')
  generateSpine = mod.generateSpine
  fallbackSpineEntry = mod.fallbackSpineEntry
})

function makeChapters(n) {
  return Array.from({ length: n }, (_, i) => ({
    chapterNumber: i + 1,
    title: `Chapter ${i + 1}`,
    goal: `goal ${i + 1}`,
    emotionalTarget: `emotion ${i + 1}`,
    hookEnding: `hook ${i + 1}`,
    estimatedWords: 2000
  }))
}

function validEntry(i) {
  return {
    emotionalStateAtEnd: `state-${i}`,
    readerKnowledgeAtEnd: `knows-${i}`,
    transitionToNext: `transition-${i}`,
    keyFacts: [`fact-${i}`],
    wordCount: 150
  }
}

describe('fallbackSpineEntry', () => {
  it('synthesizes a usable entry from the chapter plan', () => {
    const entry = fallbackSpineEntry({
      chapterNumber: 4,
      title: 'The Reckoning',
      goal: 'confront the enemy',
      emotionalTarget: 'dread',
      hookEnding: 'the door opens',
      estimatedWords: 3000
    })
    expect(entry.chapterNumber).toBe(4)
    expect(entry.chapterTitle).toBe('The Reckoning')
    expect(entry.emotionalStateAtEnd).toBe('dread')
    expect(entry.transitionToNext).toBe('the door opens')
    expect(entry.keyFacts).toEqual([])
    expect(entry.wordCount).toBe(3000)
  })

  it('falls back to safe defaults when plan fields are missing', () => {
    const entry = fallbackSpineEntry({ chapterNumber: 1, title: 'Untitled' })
    expect(entry.emotionalStateAtEnd).toBeTruthy()
    expect(entry.readerKnowledgeAtEnd).toContain('Untitled')
    expect(entry.wordCount).toBe(100)
  })
})

describe('generateSpine', () => {
  it('builds one entry per chapter, in order, from model output', async () => {
    const chapters = makeChapters(5)
    let call = 0
    mockAiGenerateJson.mockImplementation(() => Promise.resolve(validEntry(++call)))

    const spine = await generateSpine(chapters, { genre: 'Fantasy', tone: 'Dark' })
    expect(spine).toHaveLength(5)
    expect(spine.map((s) => s.chapterNumber)).toEqual([1, 2, 3, 4, 5])
    expect(spine.every((s) => typeof s.emotionalStateAtEnd === 'string')).toBe(true)
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(5)
  })

  it('reports progress via onEntryDone', async () => {
    const chapters = makeChapters(3)
    mockAiGenerateJson.mockResolvedValue(validEntry(1))
    const progress = []
    await generateSpine(chapters, {}, (done, total) => progress.push([done, total]))
    expect(progress).toHaveLength(3)
    expect(progress[progress.length - 1]).toEqual([3, 3])
  })

  it('uses a plan-derived fallback for a failed chapter and never throws', async () => {
    const chapters = makeChapters(4)
    // Chapter 3 fails (rejects); the rest succeed.
    mockAiGenerateJson.mockImplementation((prompt) => {
      if (/Chapter 3:/.test(prompt)) return Promise.reject(new Error('model timeout'))
      return Promise.resolve(validEntry(0))
    })

    const spine = await generateSpine(chapters, {})
    expect(spine).toHaveLength(4)
    // Failed chapter (index 2) fell back to its plan's emotional target.
    expect(spine[2].emotionalStateAtEnd).toBe('emotion 3')
    expect(spine[2].transitionToNext).toBe('hook 3')
    // Neighbors still used the model output.
    expect(spine[0].emotionalStateAtEnd).toBe('state-0')
  })

  it('falls back when the model returns unusable JSON (no emotionalStateAtEnd)', async () => {
    const chapters = makeChapters(2)
    mockAiGenerateJson.mockResolvedValue({ readerKnowledgeAtEnd: 'partial only' })
    const spine = await generateSpine(chapters, {})
    expect(spine).toHaveLength(2)
    expect(spine[0].emotionalStateAtEnd).toBe('emotion 1')
    expect(spine[1].emotionalStateAtEnd).toBe('emotion 2')
  })

  it('survives a large chapter count with intermittent failures', async () => {
    const chapters = makeChapters(40)
    let n = 0
    mockAiGenerateJson.mockImplementation(() => {
      n++
      // Every 5th chapter fails.
      if (n % 5 === 0) return Promise.resolve(null)
      return Promise.resolve(validEntry(n))
    })
    const spine = await generateSpine(chapters, {})
    expect(spine).toHaveLength(40)
    expect(spine.every((e) => e && typeof e.emotionalStateAtEnd === 'string')).toBe(true)
    // No holes in the array.
    expect(spine.filter(Boolean)).toHaveLength(40)
  })
})

describe('spineContextFromProse (§35)', () => {
  let spineContextFromProse
  beforeEach(async () => {
    ;({ spineContextFromProse } = await import('@/composables/generation/context/spine'))
  })

  const spine = [1, 2, 3, 4].map((n) => ({
    chapterNumber: n,
    chapterTitle: `C${n}`,
    emotionalStateAtEnd: `planned emotion ${n}`,
    readerKnowledgeAtEnd: `planned knowledge ${n}`,
    transitionToNext: `planned transition ${n}`,
    keyFacts: [`planned fact ${n}`]
  }))
  const written = [
    {
      chapterId: 1,
      sceneNumber: 1,
      summary: 'Ada leaves the mill.',
      keyFacts: ['Ada owns a knife']
    },
    {
      chapterId: 1,
      sceneNumber: 3,
      summary: 'Ada burns the ledger.',
      keyFacts: ['The ledger is ash']
    },
    { chapterId: 2, sceneNumber: 5, summary: null, keyFacts: [] },
    // An anchor of a later chapter, drafted early by the anchor-first writer.
    { chapterId: 4, sceneNumber: 10, summary: 'Ada is arrested.', keyFacts: ['Ada is in jail'] }
  ]

  it('shows earlier chapters as written: the closing scene summary and the prose facts', () => {
    const text = spineContextFromProse(spine, written, 3)
    expect(text).toMatch(/Chapter 1 \(C1\), as written: Ada burns the ledger\./)
    expect(text).toMatch(/Established: Ada owns a knife; The ledger is ash/)
    expect(text).not.toMatch(/planned emotion 1/)
  })

  it('keeps a chapter without a written summary, the current one and later ones as planned', () => {
    const text = spineContextFromProse(spine, written, 3)
    expect(text).toMatch(/PLANNED FROM HERE/)
    expect(text).toMatch(/planned emotion 2/)
    expect(text).toMatch(/planned emotion 3/)
    // A later chapter's early-drafted anchor does not leak backwards.
    expect(text).not.toMatch(/Ada is arrested|Ada is in jail/)
    expect(text).toMatch(/planned emotion 4/)
  })

  it('is the planned spine when nothing before the chapter is written, or no chapter is given', async () => {
    const { compressSpine } = await import('@/composables/generation/context/spine')
    expect(spineContextFromProse(spine, written, 1)).toBe(compressSpine(spine))
    expect(spineContextFromProse(spine, written, null)).toBe(compressSpine(spine))
    expect(spineContextFromProse([], written, 3)).toBe('')
  })

  it('drops the oldest written chapters first when over the token cap', () => {
    const long = Array.from({ length: 8 }, (_, i) => ({
      chapterId: i + 1,
      sceneNumber: i + 1,
      summary: `Summary of chapter ${i + 1}. ${'Things happen at length. '.repeat(20)}`,
      keyFacts: []
    }))
    const big = Array.from({ length: 9 }, (_, i) => ({
      ...spine[0],
      chapterNumber: i + 1,
      chapterTitle: `C${i + 1}`
    }))
    const text = spineContextFromProse(big, long, 9, 300)
    expect(text).toMatch(/\[spine truncated\]$/)
    expect(text).toMatch(/Summary of chapter 8/)
    expect(text).not.toMatch(/Summary of chapter 1\./)
  })
})
