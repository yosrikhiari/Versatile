import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockAiStream = vi.fn()
const mockFinalizeStream = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative'
}

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' }
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

vi.mock('@/services/jsonExtractor', () => ({
  finalizeStream: (...args) => mockFinalizeStream(...args)
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
    mockAiStream.mockImplementationOnce(async (user, system, onChunk, opts) => {
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
    await expect(writeScene({ sceneBrief: baseSceneBrief, storyArc: defaultArc })).rejects.toThrow('API down')
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
})

describe('writeSceneStructured', () => {
  const structuredOutput = {
    prose: 'Once upon a time...',
    usedEntities: { characterNames: ['John'], locationNames: ['Forest'], plotThreadTitles: [] },
    newEntities: { characters: [], locations: [], plotThreads: [] },
    networkEvents: []
  }

  it('returns prose and structured data', async () => {
    mockFinalizeStream.mockReturnValue(structuredOutput)
    mockAiGenerate.mockResolvedValue(JSON.stringify(structuredOutput))
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    expect(result.prose).toBe('Once upon a time...')
    expect(result.structured).toEqual(structuredOutput)
  })

  it('includes existingEntitiesJson in prompt when provided', async () => {
    mockFinalizeStream.mockReturnValue(structuredOutput)
    mockAiGenerate.mockResolvedValue(JSON.stringify(structuredOutput))
    const { writeSceneStructured } = useStoryWriter()
    await writeSceneStructured({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      existingEntitiesJson: 'John: Hero'
    })
    const userPrompt = mockAiGenerate.mock.calls[0][0]
    expect(userPrompt).toContain('John: Hero')
  })

  it('gracefully degrades on JSON parse failure', async () => {
    mockFinalizeStream.mockImplementation(() => {
      throw new Error('JSON parse error')
    })
    mockAiGenerate.mockResolvedValue('raw prose text')
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })
    expect(result.prose).toBe('raw prose text')
    expect(result.structured).toBeNull()
  })

  it('re-throws non-JSON errors', async () => {
    mockAiGenerate.mockRejectedValue(new Error('API error'))
    const { writeSceneStructured, writeError } = useStoryWriter()
    await expect(writeSceneStructured({ sceneBrief: baseSceneBrief, storyArc: defaultArc })).rejects.toThrow('API error')
    expect(writeError.value).toBe('API error')
  })

  it('uses streaming when onChunk provided', async () => {
    mockFinalizeStream.mockReturnValue(structuredOutput)
    mockAiStream.mockImplementationOnce(async (user, system, onChunk, opts) => {
      onChunk('{"prose": "chunk1', '{"prose": "chunk1')
      onChunk('chunk2', '{"prose": "chunk1chunk2')
    })
    const { writeSceneStructured } = useStoryWriter()
    const onChunk = vi.fn()
    const result = await writeSceneStructured({
      sceneBrief: baseSceneBrief,
      storyArc: defaultArc,
      onChunk
    })
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(result.prose).toBe('Once upon a time...')
  })
})
