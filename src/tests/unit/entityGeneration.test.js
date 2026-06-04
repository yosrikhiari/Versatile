import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/aiService', () => ({ aiGenerate: vi.fn() }))
vi.mock('../../config/ai', () => ({
  FEATURES: {},
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
vi.mock('../ai/aiHelpers', () => ({
  retryWithBackoff: vi.fn(),
  sanitizeJsonResponse: vi.fn(),
  getProjectContext: vi.fn(),
  getExistingEntitiesContext: vi.fn(),
  FIELD_LENGTH_CONSTRAINTS: {}
}))
vi.mock('../../config/storageKeys', () => ({ getEmbeddingStorageKey: vi.fn() }))

let extractBracketContent
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/services/generation/entityGeneration')
  extractBracketContent = mod.extractBracketContent
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
