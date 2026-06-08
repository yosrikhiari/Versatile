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
  PROVIDERS: { OLLAMA: 'ollama', OPENAI: 'openai', ANTHROPIC: 'anthropic', GEMINI: 'gemini', GROQ: 'groq' },
  FEATURES: { CONTENT: 'content', STORY_GENERATION: 'story_generation', WORLDBUILDING: 'worldbuilding' },
  PROVIDER_MODELS: { openai: ['gpt-4'], anthropic: ['claude-3-opus'] }
}))

vi.mock('@/config/storageKeys', () => ({ getApiKeyStorageKey: vi.fn(() => 'key_storage') }))
vi.mock('@/services/ollamaService', () => ({ simpleDecrypt: vi.fn((s) => s) }))
vi.mock('@/services/providers/ollama', () => ({ generate: vi.fn(), stream: vi.fn(), testConnection: vi.fn(), listModels: vi.fn() }))
vi.mock('@/services/providers/openai', () => ({ generate: vi.fn(), stream: vi.fn(), testConnection: vi.fn() }))
vi.mock('@/services/providers/anthropic', () => ({ generate: vi.fn(), stream: vi.fn(), testConnection: vi.fn() }))
vi.mock('@/services/providers/gemini', () => ({ generate: vi.fn(), stream: vi.fn(), testConnection: vi.fn() }))
vi.mock('@/services/providers/groq', () => ({ generate: vi.fn(), stream: vi.fn(), testConnection: vi.fn() }))

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
    expect(aiService.getConfiguredModel('content')).toBe('llama3')
  })

  it('returns first model from PROVIDER_MODELS when provider is non-Ollama', () => {
    mockSettingsStore.aiProvider = 'openai'
    expect(aiService.getConfiguredModel('content')).toBe('gpt-4')
  })

  it('returns null when provider is unknown', () => {
    mockSettingsStore.aiProvider = 'unknown'
    expect(aiService.getConfiguredModel('content')).toBeNull()
  })
})

describe('getConfiguredProvider', () => {
  it('returns the configured provider from settings', () => {
    mockSettingsStore.aiProvider = 'anthropic'
    expect(aiService.getConfiguredProvider('content')).toBe('anthropic')
  })

  it('returns feature override provider when set', () => {
    mockSettingsStore.featureModels = { story_generation: { provider: 'openai', model: 'gpt-4' } }
    expect(aiService.getConfiguredProvider('story_generation')).toBe('openai')
  })
})

describe('aiGenerate', () => {
  it('throws for unknown provider', async () => {
    mockSettingsStore.aiProvider = 'nonexistent'
    await expect(aiService.aiGenerate('prompt', 'system')).rejects.toThrow('Unknown provider')
  })
})

describe('aiTestConnection', () => {
  it('throws for unknown provider', async () => {
    await expect(aiService.aiTestConnection('unknown', 'key')).rejects.toThrow('Unknown provider')
  })
})
