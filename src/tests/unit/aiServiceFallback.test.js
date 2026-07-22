import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockSettingsStore = {
  aiProvider: 'ollama',
  ollamaModel: 'llama3',
  featureModels: {},
  aiProviderFallback: '',
  aiFallbackChain: []
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
  PROVIDER_MODELS: { openai: ['gpt-4'], anthropic: ['claude-3-opus'] }
}))

vi.mock('@/config/storageKeys', () => ({ getApiKeyStorageKey: vi.fn(() => 'key_storage') }))

vi.mock('@/services/ollamaService', () => ({
  simpleDecrypt: vi.fn((s) => s),
  decrypt: vi.fn((s) => Promise.resolve(s))
}))

const mockProviders = vi.hoisted(() => ({
  ollama: { generate: vi.fn(), stream: vi.fn() },
  openai: { generate: vi.fn(), stream: vi.fn() },
  anthropic: { generate: vi.fn(), stream: vi.fn() }
}))

vi.mock('@/services/providers/ollama', () => ({
  generate: mockProviders.ollama.generate,
  stream: mockProviders.ollama.stream,
  testConnection: vi.fn(),
  listModels: vi.fn()
}))

vi.mock('@/services/providers/openai', () => ({
  generate: mockProviders.openai.generate,
  stream: mockProviders.openai.stream,
  testConnection: vi.fn()
}))

vi.mock('@/services/providers/anthropic', () => ({
  generate: mockProviders.anthropic.generate,
  stream: mockProviders.anthropic.stream,
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

vi.mock('@/services/aiProviderBudget', () => ({
  providerBudget: { check: vi.fn(() => ({ allowed: true })), record: vi.fn() },
  BudgetExceededError: class BudgetExceededError extends Error {
    constructor(provider, reason) { super(reason); this.provider = provider }
  }
}))

const { ollama, openai, anthropic } = mockProviders

let aiService

beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  mockSettingsStore.aiProvider = 'ollama'
  mockSettingsStore.ollamaModel = 'llama3'
  mockSettingsStore.featureModels = {}
  mockSettingsStore.aiProviderFallback = ''
  mockSettingsStore.aiFallbackChain = []
  localStorage.setItem('key_storage', 'fake-key')
  localStorage.removeItem('versatile-cost-logs')
  aiService = await import('@/services/aiService')
})

describe('aiGenerate fallback chain', () => {
  const FAILURE = new Error('Provider unavailable')
  const RESULT_TEXT = 'generated text'
  const RESULT = { text: 'generated text', usage: null }

  it('falls back to next provider when primary fails', async () => {
    mockSettingsStore.aiFallbackChain = ['openai']
    ollama.generate.mockRejectedValue(FAILURE)
    openai.generate.mockResolvedValue(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe(RESULT_TEXT)
    expect(ollama.generate).toHaveBeenCalledOnce()
    expect(openai.generate).toHaveBeenCalledOnce()
  })

  it('throws last error when all providers fail', async () => {
    mockSettingsStore.aiFallbackChain = ['openai']
    ollama.generate.mockRejectedValue(FAILURE)
    openai.generate.mockRejectedValue(new Error('OpenAI down'))

    await expect(
      aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })
    ).rejects.toThrow('OpenAI down')
  })

  it('deduplicates duplicate entries in fallback chain', async () => {
    mockSettingsStore.aiFallbackChain = ['openai', 'openai']
    ollama.generate.mockRejectedValue(FAILURE)
    openai.generate.mockResolvedValue(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe(RESULT_TEXT)
    expect(openai.generate).toHaveBeenCalledTimes(1)
  })

  it('filters out none and empty entries from fallback chain', async () => {
    mockSettingsStore.aiFallbackChain = ['none', 'openai', '']
    ollama.generate.mockRejectedValue(FAILURE)
    openai.generate.mockResolvedValue(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe(RESULT_TEXT)
    expect(openai.generate).toHaveBeenCalledOnce()
  })

  it('multi-hop: primary fails, first fallback fails, second fallback succeeds', async () => {
    mockSettingsStore.aiFallbackChain = ['openai', 'anthropic']
    ollama.generate.mockRejectedValue(FAILURE)
    openai.generate.mockRejectedValue(new Error('OpenAI down'))
    anthropic.generate.mockResolvedValue(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe(RESULT_TEXT)
    expect(ollama.generate).toHaveBeenCalledOnce()
    expect(openai.generate).toHaveBeenCalledOnce()
    expect(anthropic.generate).toHaveBeenCalledOnce()
  })

  it('no fallback attempted when chain is empty', async () => {
    ollama.generate.mockRejectedValue(FAILURE)

    await expect(
      aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })
    ).rejects.toThrow('Provider unavailable')
    expect(openai.generate).not.toHaveBeenCalled()
  })

  it('fallback with feature override provider as primary', async () => {
    mockSettingsStore.featureModels = {
      story_generation: { provider: 'openai', model: 'gpt-4' }
    }
    mockSettingsStore.aiFallbackChain = ['anthropic']
    openai.generate.mockRejectedValue(FAILURE)
    anthropic.generate.mockResolvedValue(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', {
      feature: 'story_generation',
      retryDelay: 1
    })

    expect(result).toBe(RESULT_TEXT)
    expect(openai.generate).toHaveBeenCalledOnce()
    expect(anthropic.generate).toHaveBeenCalledOnce()
  })
})

describe('aiStream fallback chain', () => {
  const FAILURE = new Error('Stream failed')

  it('falls back when primary stream fails before emitting any chunk', async () => {
    mockSettingsStore.aiFallbackChain = ['openai']
    ollama.stream.mockRejectedValue(FAILURE)
    openai.stream.mockImplementation((_p, _s, _m, onChunk) => {
      onChunk('delta', 'complete text')
      return Promise.resolve('complete text')
    })

    const onChunk = vi.fn()
    const result = await aiService.aiStream('prompt', 'system', onChunk, { retryDelay: 1 })

    expect(result).toBe('complete text')
    expect(onChunk).toHaveBeenCalledWith('delta', 'complete text')
    expect(ollama.stream).toHaveBeenCalledOnce()
    expect(openai.stream).toHaveBeenCalledOnce()
  })

  it('does not fall back when primary stream fails after emitting a chunk', async () => {
    mockSettingsStore.aiFallbackChain = ['openai']
    ollama.stream.mockImplementation((_p, _s, _m, onChunk) => {
      onChunk('partial', 'partial text')
      return Promise.reject(new Error('Stream failed after emission'))
    })

    const onChunk = vi.fn()
    await expect(
      aiService.aiStream('prompt', 'system', onChunk, { retryDelay: 1 })
    ).rejects.toThrow('Stream failed after emission')

    expect(onChunk).toHaveBeenCalledWith('partial', 'partial text')
    expect(openai.stream).not.toHaveBeenCalled()
  })
})
