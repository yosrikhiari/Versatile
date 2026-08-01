import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockAiStream = vi.fn()
const mockAiGenerateJson = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative',
  getActivePrompts: vi.fn(() => ({
    writer: 'You are a creative writer. Write vivid prose.'
  })),
  promptOverrides: { writer: '', critic: '', revisor: '', director: '' }
}

// The writer talks to the composable wrapper, not the raw service. Mocking it
// here lets us assert the two-call contract directly: aiGenerate/aiStream for
// prose, aiGenerateJson (schema) for the metadata extraction pass.
vi.mock('@/composables/useAiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args),
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDERS: { OLLAMA: 'ollama' },
  PROVIDER_DEFAULT: 'ollama',
  FEATURE_DEFAULTS: {},
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 }
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: {
    creative: {
      writer: 'You are a creative writer. Write vivid prose.'
    },
    academic: {
      writer: 'You are an academic writer.'
    }
  }
}))

let useStoryWriter
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useStoryWriter')
  useStoryWriter = mod.useStoryWriter
})

const baseSceneBrief = {
  sceneNumber: 1,
  title: 'The Beginning',
  emotionalGoal: 'Hope',
  whatChanges: 'Hero starts journey',
  charactersPresent: ['John'],
  characterWants: { John: 'Find purpose' },
  setup: 'Establishes world',
  payoff: 'none',
  sensoryAnchor: 'Dawn light',
  tension: 'medium',
  pacing: 'slow',
  estimatedWords: 500
}

const defaultArc = {
  premise: 'Test story',
  genre: 'Fantasy',
  tone: 'Dark',
  centralConflict: 'Good vs Evil'
}

describe('writeScene', () => {
  it('returns generated prose from aiGenerate', async () => {
    mockAiGenerate.mockResolvedValue('Once upon a time...')
    const { writeScene } = useStoryWriter()
    const result = await writeScene({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    expect(result).toBe('Once upon a time...')
  })

  it('uses streaming when onChunk provided', async () => {
    mockAiStream.mockImplementationOnce(async (user, system, onChunk, _opts) => {
      onChunk('Hello ', 'Hello ')
      onChunk('world', 'Hello world')
    })
    const { writeScene } = useStoryWriter()
    const onChunk = vi.fn()
    const result = await writeScene({ sceneBrief: baseSceneBrief, storyArc: defaultArc, onChunk })
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(result).toBe('Hello world')
  })

  it('sets isWriting ref correctly', async () => {
    mockAiGenerate.mockResolvedValue('text')
    const { writeScene, isWriting } = useStoryWriter()
    const promise = writeScene({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    expect(isWriting.value).toBe(true)
    await promise
    expect(isWriting.value).toBe(false)
  })

  it('throws and sets writeError on failure', async () => {
    mockAiGenerate.mockRejectedValue(new Error('API down'))
    const { writeScene, writeError } = useStoryWriter()
    await expect(writeScene({ sceneBrief: baseSceneBrief, storyArc: defaultArc })).rejects.toThrow(
      'API down'
    )
    expect(writeError.value).toBe('API down')
  })

  it('includes anti-patterns when extraRejected provided', async () => {
    mockAiGenerate.mockResolvedValue('text')
    const { writeScene } = useStoryWriter()
    await writeScene({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      rejectedPatterns: [{ context: 'too much description' }]
    })
    const systemPrompt = mockAiGenerate.mock.calls[0][1]
    expect(systemPrompt).toContain('AVOID')
    expect(systemPrompt).toContain('too much description')
  })

  it('includes story contract when provided', async () => {
    mockAiGenerate.mockResolvedValue('text')
    const { writeScene } = useStoryWriter()
    await writeScene({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      storyContract: 'Magic has a cost'
    })
    const userPrompt = mockAiGenerate.mock.calls[0][0]
    expect(userPrompt).toContain('Magic has a cost')
  })

  it('uses alternative brief format when emotionalGoal is undefined', async () => {
    const altBrief = {
      goal: 'Defeat the dragon',
      obstacle: 'Dragon is immune',
      characters: ['Hero'],
      location: 'Cave',
      change: 'Dragon defeated',
      toneNote: 'Epic'
    }
    mockAiGenerate.mockResolvedValue('text')
    const { writeScene } = useStoryWriter()
    await writeScene({ sceneBrief: altBrief, storyArc: defaultArc })
    const userPrompt = mockAiGenerate.mock.calls[0][0]
    expect(userPrompt).toContain('Defeat the dragon')
    expect(userPrompt).toContain('Dragon is immune')
    expect(userPrompt).toContain('Cave')
  })

  it('includes embedding context when provided', async () => {
    mockAiGenerate.mockResolvedValue('text')
    const { writeScene } = useStoryWriter()
    await writeScene({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      embeddingContext: 'Previously: John found the sword.'
    })
    const userPrompt = mockAiGenerate.mock.calls[0][0]
    expect(userPrompt).toContain('Previously: John found the sword.')
  })

  it('falls back to first scene message for empty chapter log', async () => {
    mockAiGenerate.mockResolvedValue('text')
    const { writeScene } = useStoryWriter()
    await writeScene({ sceneBrief: baseSceneBrief, storyArc: defaultArc, chapterLog: [] })
    const userPrompt = mockAiGenerate.mock.calls[0][0]
    expect(userPrompt).toContain('first scene')
  })

  it('passes complexity to aiGenerate options', async () => {
    mockAiGenerate.mockResolvedValue('prose')
    const { writeScene } = useStoryWriter()
    await writeScene({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc
    })
    const opts = mockAiGenerate.mock.calls[0][2]
    expect(opts).toHaveProperty('complexity')
  })

  it('passes complexity to aiStream options', async () => {
    mockAiStream.mockImplementationOnce(async (user, system, onChunk, opts) => {
      onChunk('prose', 'prose')
    })
    const { writeScene } = useStoryWriter()
    const onChunk = vi.fn()
    await writeScene({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      onChunk
    })
    const opts = mockAiStream.mock.calls[0][3]
    expect(opts).toHaveProperty('complexity')
  })
})

// Comfortably past baseSceneBrief's 500-word target, so the length-continuation
// pass stays out of the way of tests that are about something else.
const longEnoughProse = Array.from({ length: 520 }, (_, i) => `word${i}`).join(' ')

describe('writeSceneStructured (prose-first, two calls)', () => {
  // The metadata a healthy second-pass extraction returns.
  const metadata = {
    summary: 'John reaches the forest.',
    usedEntities: { characterNames: ['John'], locationNames: ['Forest'], plotThreadTitles: [] },
    newEntities: { characters: [], locations: [], plotThreads: [] },
    networkEvents: [],
    keyFacts: []
  }

  beforeEach(() => {
    // Default happy path: prose from call 1, metadata from call 2.
    mockAiGenerate.mockResolvedValue('Once upon a time, John walked into the forest.')
    mockAiGenerateJson.mockResolvedValue({ ...metadata })
  })

  it('returns the prose from call 1 and metadata from call 2', async () => {
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })

    expect(result.prose).toBe('Once upon a time, John walked into the forest.')
    expect(result.structured.summary).toBe('John reaches the forest.')
    // The prose is echoed into structured for callers that read it there.
    expect(result.structured.prose).toBe(result.prose)
  })

  it('asks for prose as prose, not wrapped in a JSON envelope', async () => {
    // The reason this whole path exists: a JSON envelope suppresses prose length
    // ~44x on a small local model.
    const { writeSceneStructured } = useStoryWriter()
    await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })

    const prosePrompt = mockAiGenerate.mock.calls[0][0]
    expect(prosePrompt).toContain('as prose')
    expect(prosePrompt).not.toContain('"usedEntities"')
  })

  it('makes exactly two model calls for a scene that meets its target', async () => {
    // Net-neutral vs the old summary call. A scene that comes back short costs
    // extra calls to top up — see the length-target block below — but that is
    // the exception, not the per-scene baseline.
    mockAiGenerate.mockResolvedValue(longEnoughProse)
    const { writeSceneStructured } = useStoryWriter()
    await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })

    expect(mockAiGenerate).toHaveBeenCalledTimes(1) // prose
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(1) // metadata
  })

  it('gives the extraction pass the known entities, not the whole prompt', async () => {
    const { writeSceneStructured } = useStoryWriter()
    await writeSceneStructured({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      existingEntitiesJson: 'John: Hero'
    })
    const extractionPrompt = mockAiGenerateJson.mock.calls[0][0]
    expect(extractionPrompt).toContain('John: Hero')
    // The extraction pass reads the finished prose, not the generation prompt.
    expect(extractionPrompt).toContain('walked into the forest')
  })

  it('keeps the prose even when metadata extraction fails', async () => {
    // Metadata is enrichment; a scene must never be lost because the second pass
    // choked. extractSceneMetadata swallows its own error and returns empties.
    mockAiGenerateJson.mockRejectedValue(new Error('schema rejected'))
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })

    expect(result.prose).toBe('Once upon a time, John walked into the forest.')
    expect(result.structured.summary).toBe('')
    expect(result.structured.keyFacts).toEqual([])
  })

  it('unwraps a stray JSON envelope the model added despite instructions', async () => {
    mockAiGenerate.mockResolvedValue('{"prose": "The real scene text."}')
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    expect(result.prose).toBe('The real scene text.')
  })

  it('unwraps a markdown code fence', async () => {
    mockAiGenerate.mockResolvedValue('```\nThe real scene text.\n```')
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    expect(result.prose).toBe('The real scene text.')
  })

  describe('word-count target', () => {
    // A scene that comes back at 1095 words against a 1200-word target used to
    // be persisted as-is: the prompt's "MUST be at least N words" was the only
    // lever, and nothing downstream checked it. These cover the top-up pass.

    it('leaves a scene that meets its target alone', async () => {
      mockAiGenerate.mockResolvedValue(longEnoughProse)
      const { writeSceneStructured } = useStoryWriter()
      const result = await writeSceneStructured({
        sceneBrief: baseSceneBrief,
        storyArc: defaultArc
      })

      expect(mockAiGenerate).toHaveBeenCalledTimes(1)
      expect(result.prose).toBe(longEnoughProse)
    })

    it('leaves a scene inside the 85% tolerance alone', async () => {
      // Forcing an exact hit produces padding, which is worse than being short.
      const nearlyThere = Array.from({ length: 450 }, (_, i) => `word${i}`).join(' ')
      mockAiGenerate.mockResolvedValue(nearlyThere)
      const { writeSceneStructured } = useStoryWriter()
      const result = await writeSceneStructured({
        sceneBrief: baseSceneBrief,
        storyArc: defaultArc
      })

      expect(mockAiGenerate).toHaveBeenCalledTimes(1)
      expect(result.prose).toBe(nearlyThere)
    })

    it('continues a short scene up to its target', async () => {
      const opening = Array.from({ length: 100 }, (_, i) => `alpha${i}`).join(' ')
      const rest = Array.from({ length: 420 }, (_, i) => `beta${i}`).join(' ')
      mockAiGenerate.mockResolvedValueOnce(opening).mockResolvedValueOnce(rest)

      const { writeSceneStructured } = useStoryWriter()
      const result = await writeSceneStructured({
        sceneBrief: baseSceneBrief,
        storyArc: defaultArc
      })

      expect(mockAiGenerate).toHaveBeenCalledTimes(2)
      expect(result.prose).toContain(opening)
      expect(result.prose).toContain(rest)
    })

    it('asks the continuation to carry on rather than restart', async () => {
      const opening = Array.from({ length: 100 }, (_, i) => `alpha${i}`).join(' ')
      mockAiGenerate
        .mockResolvedValueOnce(opening)
        .mockResolvedValue(Array.from({ length: 420 }, (_, i) => `beta${i}`).join(' '))

      const { writeSceneStructured } = useStoryWriter()
      await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })

      const continuationPrompt = mockAiGenerate.mock.calls[1][0]
      expect(continuationPrompt).toContain('CONTINUATION PASS')
      expect(continuationPrompt).toContain('Do not restart the scene')
      // It needs the tail to know where to pick up.
      expect(continuationPrompt).toContain('THE SCENE SO FAR ENDS WITH')
      expect(continuationPrompt).toContain('alpha99')
    })

    it('discards a continuation that just repeats the scene', async () => {
      // "Continue" is an instruction a model can satisfy by restarting. Hitting
      // the target with a duplicate is worse than staying short.
      const opening = Array.from({ length: 100 }, (_, i) => `alpha${i}`).join(' ')
      mockAiGenerate.mockResolvedValue(opening)

      const { writeSceneStructured } = useStoryWriter()
      const result = await writeSceneStructured({
        sceneBrief: baseSceneBrief,
        storyArc: defaultArc
      })

      expect(result.prose).toBe(opening)
    })

    it('stops after two continuation passes', async () => {
      // A model that has not reached the target after two asks has said what it
      // has to say; a third buys repetition, not length.
      mockAiGenerate
        .mockResolvedValueOnce(Array.from({ length: 40 }, (_, i) => `a${i}`).join(' '))
        .mockResolvedValueOnce(Array.from({ length: 40 }, (_, i) => `b${i}`).join(' '))
        .mockResolvedValueOnce(Array.from({ length: 40 }, (_, i) => `c${i}`).join(' '))
        .mockResolvedValue(Array.from({ length: 40 }, (_, i) => `d${i}`).join(' '))

      const { writeSceneStructured } = useStoryWriter()
      await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })

      expect(mockAiGenerate).toHaveBeenCalledTimes(3) // prose + 2 passes
    })

    it('keeps the short scene when the continuation call fails', async () => {
      // The scene itself succeeded; a failed top-up must not turn a short scene
      // into no scene.
      const opening = Array.from({ length: 100 }, (_, i) => `alpha${i}`).join(' ')
      mockAiGenerate.mockResolvedValueOnce(opening).mockRejectedValue(new Error('ollama fell over'))

      const { writeSceneStructured } = useStoryWriter()
      const result = await writeSceneStructured({
        sceneBrief: baseSceneBrief,
        storyArc: defaultArc
      })

      expect(result.prose).toBe(opening)
    })

    it('falls back to the 800-word default when the brief sets no target', async () => {
      // `estimatedWords || 800` is the writer's existing default and already
      // drives the prompt and the token cap; the length pass reads the same
      // number rather than inventing a second notion of "long enough".
      const justUnder = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ')
      const topUp = Array.from({ length: 300 }, (_, i) => `extra${i}`).join(' ')
      mockAiGenerate.mockResolvedValueOnce(justUnder).mockResolvedValueOnce(topUp)

      const { writeSceneStructured } = useStoryWriter()
      const result = await writeSceneStructured({
        sceneBrief: { ...baseSceneBrief, estimatedWords: 0 },
        storyArc: defaultArc
      })

      // 600 is under 680 (85% of 800), so one pass runs.
      expect(mockAiGenerate).toHaveBeenCalledTimes(2)
      expect(mockAiGenerate.mock.calls[1][0]).toContain('800-word target')
      expect(result.prose).toContain(topUp)
    })
  })

  it('forwards the cancellation signal to both calls', async () => {
    const controller = new AbortController()
    const { writeSceneStructured } = useStoryWriter()
    await writeSceneStructured({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      signal: controller.signal
    })

    expect(mockAiGenerate.mock.calls[0][2].signal).toBe(controller.signal)
    expect(mockAiGenerateJson.mock.calls[0][2].signal).toBe(controller.signal)
  })

  it('works without a signal — cancellation is opt-in', async () => {
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    expect(result.prose).toContain('John')
    expect(mockAiGenerate.mock.calls[0][2].signal).toBeUndefined()
  })

  it('re-throws when the prose call fails and nothing was produced', async () => {
    mockAiGenerate.mockRejectedValue(new Error('API error'))
    const { writeSceneStructured, writeError } = useStoryWriter()
    await expect(
      writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    ).rejects.toThrow('API error')
    expect(writeError.value).toBe('API error')
  })

  it('streams prose chunks straight through — no JSON extraction machine', async () => {
    mockAiStream.mockImplementationOnce(async (user, system, onChunk) => {
      onChunk('Once upon ', 'Once upon ')
      onChunk('a time.', 'a time.')
    })
    const { writeSceneStructured } = useStoryWriter()
    const onChunk = vi.fn()
    const result = await writeSceneStructured({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      onChunk
    })
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(result.prose).toBe('Once upon a time.')
    expect(mockAiStream.mock.calls[0][3].feature).toBeDefined()
  })
})
