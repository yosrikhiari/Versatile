import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAiGenerate = vi.fn()
const mockAiStream = vi.fn()
const mockAiGenerateJson = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative',
  getActivePrompts: vi.fn(() => ({
    writer: 'You are a creative writer.'
  })),
  promptOverrides: { writer: '', critic: '', revisor: '', director: '' }
}

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
    creative: { writer: 'You are a creative writer.' },
    academic: { writer: 'You are an academic writer.' }
  }
}))

let useStoryWriter
beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('@/composables/useStoryWriter')
  useStoryWriter = mod.useStoryWriter
})

const baseBrief = {
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
  premise: 'Test',
  genre: 'Fantasy',
  tone: 'Dark',
  centralConflict: 'Good vs Evil'
}

const mockMetadata = {
  summary: 'John begins his journey at dawn.',
  usedEntities: { characterNames: ['John'], locationNames: [], plotThreadTitles: [] },
  newEntities: { characters: [], locations: [], plotThreads: [] },
  networkEvents: [],
  keyFacts: ['John leaves home']
}

describe('writeSceneStructured — streaming contract', () => {
  it('delivers progressive chunks to onChunk when streaming', async () => {
    const emitted = []
    mockAiStream.mockImplementationOnce(async (_user, _sys, onChunk) => {
      onChunk('Once upon ')
      onChunk('a time ')
      onChunk('there was a story.')
    })
    mockAiGenerateJson.mockResolvedValue(mockMetadata)

    const writer = useStoryWriter()
    const result = await writer.writeSceneStructured({
      // Target sized to the fixture so the length top-up pass stays out of a
      // test about the streaming contract.
      sceneBrief: { ...baseBrief, estimatedWords: 5 },
      storyArc: defaultArc,
      onChunk: (chunk, full) => emitted.push({ chunk, full })
    })

    // Called aiStream, not aiGenerate
    expect(mockAiGenerate).not.toHaveBeenCalled()
    expect(mockAiStream).toHaveBeenCalledTimes(1)
    // onChunk received each progressive delta
    expect(emitted.map((e) => e.chunk)).toEqual(['Once upon ', 'a time ', 'there was a story.'])
    expect(result.prose).toBe('Once upon a time there was a story.')
  })

  it('delivers raw chunks to onRawChunk during streaming', async () => {
    const rawEmitted = []
    mockAiStream.mockImplementationOnce(async (_user, _sys, onChunk) => {
      onChunk('Hello ')
      onChunk('world.')
    })
    mockAiGenerateJson.mockResolvedValue(mockMetadata)

    const writer = useStoryWriter()
    await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc,
      onChunk: () => {},
      onRawChunk: (chunk) => rawEmitted.push(chunk)
    })

    expect(rawEmitted).toEqual(['Hello ', 'world.'])
  })

  it('returns full prose and metadata when no onChunk provided (aiGenerate path)', async () => {
    mockAiGenerate.mockResolvedValue('Full prose text.')
    mockAiGenerateJson.mockResolvedValue(mockMetadata)

    const writer = useStoryWriter()
    const result = await writer.writeSceneStructured({
      // As above: sized to the fixture, so this stays a test of the non-streaming
      // path rather than of the length top-up.
      sceneBrief: { ...baseBrief, estimatedWords: 3 },
      storyArc: defaultArc
    })

    expect(mockAiStream).not.toHaveBeenCalled()
    expect(mockAiGenerate).toHaveBeenCalledTimes(1)
    expect(result.prose).toBe('Full prose text.')
    expect(result.structured.summary).toBe('John begins his journey at dawn.')
  })

  it('preserves partial prose when metadata extraction fails after streaming', async () => {
    const emitted = []
    mockAiStream.mockImplementationOnce(async (_user, _sys, onChunk) => {
      onChunk('Prose was written ')
      onChunk('before the crash.')
    })
    // Second call (metadata) fails
    mockAiGenerateJson.mockRejectedValue(new Error('Metadata extraction failed'))

    const writer = useStoryWriter()
    const result = await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc,
      onChunk: (chunk, full) => emitted.push({ chunk, full })
    })

    // Prose is preserved despite metadata failure
    expect(result.prose).toBe('Prose was written before the crash.')
    expect(result.structured.summary).toBe('')
    // All chunks were still emitted
    expect(emitted.map((e) => e.chunk)).toEqual(['Prose was written ', 'before the crash.'])
  })

  it('onChunk receives (delta, delta) — same value for both params', async () => {
    const pairs = []
    mockAiStream.mockImplementationOnce(async (_user, _sys, onChunk) => {
      onChunk('chunk1 ')
      onChunk('chunk2')
    })
    mockAiGenerateJson.mockResolvedValue(mockMetadata)

    const writer = useStoryWriter()
    await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc,
      onChunk: (a, b) => pairs.push({ a, b })
    })

    for (const p of pairs) {
      expect(p.a).toBe(p.b)
    }
  })
})
