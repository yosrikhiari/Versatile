import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAiGenerate = vi.fn()
const mockRetryWithBackoff = vi.fn()

vi.mock('../../services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args)
}))

vi.mock('../../composables/useAiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: vi.fn(),
  useAiService: vi.fn()
}))

vi.mock('../../services/ai/aiHelpers', () => ({
  retryWithBackoff: (...args) => mockRetryWithBackoff(...args),
  sanitizeJsonResponse: vi.fn(),
  getProjectContext: vi.fn(),
  getExistingEntitiesContext: vi.fn(),
  FIELD_LENGTH_CONSTRAINTS: {}
}))

vi.mock('../../config/ai', () => ({
  FEATURES: { WORLDBUILDING: 'worldbuilding' },
  PROVIDERS: { OLLAMA: 'ollama' },
  PROVIDER_DEFAULT: 'ollama',
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 }
}))

vi.mock('../../stores/projectStore', () => ({ useProjectStore: vi.fn() }))
vi.mock('../../stores/storyBibleStore', () => ({ useStoryBibleStore: vi.fn() }))
vi.mock('../../composables/useGraphContext', () => ({ useGraphContext: vi.fn() }))
vi.mock('../../composables/useNetworkSuggestions', () => ({ useNetworkSuggestions: vi.fn() }))
vi.mock('../../composables/useContextCompactor', () => ({ useContextCompactor: vi.fn() }))
vi.mock('../../composables/generation', () => ({ generateEntity: vi.fn() }))
vi.mock('../ollamaService', () => ({ getEmbedding: vi.fn(), cosineSimilarity: vi.fn() }))
vi.mock('../../config/storageKeys', () => ({ getEmbeddingStorageKey: vi.fn() }))

let extractBracketContent
let generateTraitSuggestions
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/services/generation/entityGeneration')
  extractBracketContent = mod.extractBracketContent
  generateTraitSuggestions = mod.generateTraitSuggestions
})

describe('extractBracketContent', () => {
  it('extracts content after colon within brackets', () => {
    const text = '[Characters: John and Jane]'
    const startIdx = text.indexOf('[Characters:')
    expect(extractBracketContent(text, startIdx)).toBe('John and Jane')
  })

  it('returns null when no closing bracket found', () => {
    expect(extractBracketContent('[Characters: no close', 0)).toBeNull()
  })

  it('returns null when no colon found before bracket', () => {
    expect(extractBracketContent('[NoColonContent]', 0)).toBeNull()
  })

  it('returns null when colon is after the closing bracket', () => {
    expect(extractBracketContent('[text] :', 0)).toBeNull()
  })

  it('trims whitespace around extracted content', () => {
    const text = '[Locations:   Forest Lake   ]'
    const startIdx = text.indexOf('[Locations:')
    expect(extractBracketContent(text, startIdx)).toBe('Forest Lake')
  })

  it('handles multiple bracket patterns in text', () => {
    const text = '[Characters: Alice] and [Locations: Wonderland]'
    const charsIdx = text.indexOf('[Characters:')
    const locsIdx = text.indexOf('[Locations:')
    expect(extractBracketContent(text, charsIdx)).toBe('Alice')
    expect(extractBracketContent(text, locsIdx)).toBe('Wonderland')
  })
})

describe('generateTraitSuggestions', () => {
  const characterData = { name: 'John', role: 'Hero', goal: 'Save the kingdom' }

  beforeEach(() => {
    mockRetryWithBackoff.mockImplementation(async (fn) => fn())
  })

  it('returns traits for a character when AI responds', async () => {
    mockAiGenerate.mockResolvedValue(
      JSON.stringify({
        traits: ['hates the rain', 'trusts no one', 'counts steps', 'desperate to prove worth']
      })
    )
    const traits = await generateTraitSuggestions('character', characterData)
    expect(traits).toHaveLength(4)
    expect(traits[0]).toBe('hates the rain')
  })

  it('filters out already-added traits', async () => {
    mockAiGenerate.mockResolvedValue(
      JSON.stringify({
        traits: ['hates the rain', 'trusts no one', 'counts steps', 'desperate to prove worth']
      })
    )
    const traits = await generateTraitSuggestions('character', characterData, [
      'hates the rain',
      'counts steps'
    ])
    expect(traits).toEqual(['trusts no one', 'desperate to prove worth'])
  })

  it('handles location entity type', async () => {
    mockAiGenerate.mockResolvedValue(
      JSON.stringify({
        traits: [
          'smells of wet stone',
          'eerie silence at noon',
          'crumbling walls',
          'forgotten by time'
        ]
      })
    )
    const traits = await generateTraitSuggestions('location', { name: 'Dark Forest' })
    expect(traits).toHaveLength(4)
  })

  it('handles plotThread entity type', async () => {
    mockAiGenerate.mockResolvedValue(
      JSON.stringify({
        traits: ['hidden betrayal', 'race against time', 'unreliable ally', 'fatal discovery']
      })
    )
    const traits = await generateTraitSuggestions('plotThread', { title: 'The Conspiracy' })
    expect(traits).toHaveLength(4)
  })

  it('includes manuscript context when provided', async () => {
    mockAiGenerate.mockResolvedValue(JSON.stringify({ traits: ['brave'] }))
    await generateTraitSuggestions('character', characterData, [], {
      contextText: 'The hero enters the cave'
    })
    expect(mockAiGenerate).toHaveBeenCalled()
    const prompt = mockAiGenerate.mock.calls[0][0]
    expect(prompt).toContain('The hero enters the cave')
  })

  it('strips markdown code fences from AI response', async () => {
    mockAiGenerate.mockResolvedValue('```json\n{"traits": ["brave", "wise"]}\n```')
    const traits = await generateTraitSuggestions('character', characterData)
    expect(traits).toHaveLength(2)
  })

  it('returns empty array when no JSON found in response', async () => {
    mockAiGenerate.mockResolvedValue('No JSON here at all')
    const traits = await generateTraitSuggestions('character', characterData)
    expect(traits).toEqual([])
  })

  it('returns empty array when traits field is missing', async () => {
    mockAiGenerate.mockResolvedValue(JSON.stringify({ notTraits: [] }))
    const traits = await generateTraitSuggestions('character', characterData)
    expect(traits).toEqual([])
  })

  it('returns empty array when AI service throws', async () => {
    mockRetryWithBackoff.mockRejectedValue(new Error('API error'))
    const traits = await generateTraitSuggestions('character', characterData)
    expect(traits).toEqual([])
  })

  it('limits results to 8 traits', async () => {
    const manyTraits = Array.from({ length: 20 }, (_, i) => `trait ${i + 1}`)
    mockAiGenerate.mockResolvedValue(JSON.stringify({ traits: manyTraits }))
    const traits = await generateTraitSuggestions('character', characterData)
    expect(traits.length).toBeLessThanOrEqual(8)
  })

  it('handles unknown entity type with generic label', async () => {
    mockAiGenerate.mockResolvedValue(JSON.stringify({ traits: ['interesting'] }))
    const traits = await generateTraitSuggestions('unknown_type', { name: 'Thing' })
    expect(traits).toHaveLength(1)
  })

  it('uses title as fallback when name is missing', async () => {
    mockAiGenerate.mockResolvedValue(JSON.stringify({ traits: ['trait1'] }))
    const traits = await generateTraitSuggestions('plotThread', { title: 'Mystery Plot' })
    expect(traits).toHaveLength(1)
  })

  it('passes WORLDBUILDING feature to aiGenerate', async () => {
    mockAiGenerate.mockResolvedValue(JSON.stringify({ traits: ['trait'] }))
    await generateTraitSuggestions('character', characterData)
    expect(mockAiGenerate.mock.calls[0][2]).toEqual({ feature: 'worldbuilding' })
  })
})
