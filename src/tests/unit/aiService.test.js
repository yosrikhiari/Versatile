import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockSettingsStore = {
  aiProvider: 'ollama',
  ollamaModel: 'llama3',
  featureModels: {},
  aiProviderFallback: 'none'
}

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => mockSettingsStore
}))

vi.mock('@/config/ai', () => ({
  PROVIDERS: {
    OLLAMA: 'ollama',
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GEMINI: 'gemini',
    GROQ: 'groq'
  },
  FEATURES: {
    CONTENT: 'content',
    STORY_GENERATION: 'story_generation',
    WORLDBUILDING: 'worldbuilding'
  },
  PROVIDER_MODELS: { openai: ['gpt-4'], anthropic: ['claude-3-opus'] },
  FEATURE_DEFAULTS: {},
  PROVIDER_DEFAULT: 'ollama'
}))

vi.mock('@/config/storageKeys', () => ({ getApiKeyStorageKey: vi.fn(() => 'key_storage') }))
vi.mock('@/services/ollamaService', () => ({ simpleDecrypt: vi.fn((s) => s) }))
vi.mock('@/services/providers/ollama', () => ({
  generate: vi.fn(),
  stream: vi.fn(),
  testConnection: vi.fn(),
  listModels: vi.fn()
}))
vi.mock('@/services/providers/openai', () => ({
  generate: vi.fn(),
  stream: vi.fn(),
  testConnection: vi.fn()
}))
vi.mock('@/services/providers/anthropic', () => ({
  generate: vi.fn(),
  stream: vi.fn(),
  testConnection: vi.fn()
}))
vi.mock('@/services/providers/gemini', () => ({
  generate: vi.fn(),
  stream: vi.fn(),
  testConnection: vi.fn()
}))
vi.mock('@/services/providers/groq', () => ({
  generate: vi.fn(),
  stream: vi.fn(),
  testConnection: vi.fn()
}))

let aiService
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  mockSettingsStore.aiProvider = 'ollama'
  mockSettingsStore.ollamaModel = 'llama3'
  mockSettingsStore.featureModels = {}
  mockSettingsStore.aiProviderFallback = 'none'
  aiService = await import('@/services/aiService')
})

describe('getConfiguredModel', () => {
  it('returns ollamaModel when provider is Ollama', () => {
    expect(
      aiService.getConfiguredModel('content', { defaultProvider: 'ollama', defaultModel: 'llama3' })
    ).toBe('llama3')
  })

  it('returns first model from PROVIDER_MODELS when provider is non-Ollama', () => {
    expect(aiService.getConfiguredModel('content', { defaultProvider: 'openai' })).toBe('gpt-4')
  })

  it('returns null when provider is unknown', () => {
    expect(aiService.getConfiguredModel('content', { defaultProvider: 'unknown' })).toBeNull()
  })
})

describe('resolveFeatureConfig', () => {
  it('returns the configured provider from options', () => {
    expect(
      aiService.resolveFeatureConfig('content', { defaultProvider: 'anthropic' }).provider
    ).toBe('anthropic')
  })

  it('returns feature override provider when set', () => {
    expect(
      aiService.resolveFeatureConfig('story_generation', {
        featureModels: { story_generation: { provider: 'openai', model: 'gpt-4' } }
      }).provider
    ).toBe('openai')
  })
})

describe('aiGenerate', () => {
  it('throws for unknown provider', async () => {
    await expect(
      aiService.aiGenerate('prompt', 'system', { defaultProvider: 'nonexistent' })
    ).rejects.toThrow('Unknown provider')
  })
})

describe('aiTestConnection', () => {
  it('throws for unknown provider', async () => {
    await expect(aiService.aiTestConnection('unknown', 'key')).rejects.toThrow('Unknown provider')
  })
})
