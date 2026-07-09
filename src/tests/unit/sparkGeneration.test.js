import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../aiService', () => ({ aiGenerate: vi.fn(), aiStream: vi.fn() }))
vi.mock('../../config/ai', () => ({
  FEATURES: {},
  PROVIDER_DEFAULT: 'ollama',
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 },
  PROVIDERS: {
    OLLAMA: 'ollama',
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GEMINI: 'gemini',
    GROQ: 'groq'
  }
}))
vi.mock('../../stores/projectStore', () => ({ useProjectStore: vi.fn() }))
vi.mock('../../composables/useAuthorModel', () => ({ useAuthorModel: vi.fn() }))
vi.mock('../ai/aiHelpers', () => ({
  retryWithBackoff: vi.fn(),
  sanitizeJsonResponse: vi.fn(),
  getProjectContext: vi.fn()
}))

let getDefaultBlueprint
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/services/generation/sparkGeneration')
  getDefaultBlueprint = mod.getDefaultBlueprint
})

describe('getDefaultBlueprint', () => {
  it('returns blueprint with idea as title', () => {
    const result = getDefaultBlueprint('A dragon story', 'dark')
    expect(result.title).toBe('A dragon story')
    expect(result.openingBeat).toBeTruthy()
    expect(result.turningPoint).toBeTruthy()
  })

  it('truncates long titles', () => {
    const longIdea = 'x'.repeat(50)
    const result = getDefaultBlueprint(longIdea, 'light')
    expect(result.title.length).toBeLessThanOrEqual(33)
    expect(result.title).toContain('...')
  })

  it('always returns complete blueprint structure', () => {
    const result = getDefaultBlueprint('test', 'moody')
    const keys = [
      'title',
      'openingBeat',
      'turningPoint',
      'confrontationBeat',
      'closingBeat',
      'sensoryAnchor',
      'dialogueHook',
      'writingNotes'
    ]
    for (const key of keys) {
      expect(result).toHaveProperty(key)
    }
  })
})
