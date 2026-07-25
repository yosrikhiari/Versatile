import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockSettingsStore = {
  aiProvider: 'ollama',
  ollamaModel: 'llama3',
  featureModels: {},
  aiProviderFallback: 'none',
  aiFallbackChain: []
}

const mockOllamaModule = {
  generate: vi.fn(),
  stream: vi.fn(),
  testConnection: vi.fn(),
  listModels: vi.fn()
}
const mockOpenaiModule = { generate: vi.fn(), stream: vi.fn(), testConnection: vi.fn() }

vi.mock('@/stores/settingsStore', () => ({ useSettingsStore: () => mockSettingsStore }))
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
vi.mock('@/services/providers/ollama', () => mockOllamaModule)
vi.mock('@/services/providers/openai', () => mockOpenaiModule)
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
vi.mock('@/services/aiProviderBudget', () => ({
  providerBudget: { check: vi.fn(() => ({ allowed: true })), record: vi.fn() },
  BudgetExceededError: class BudgetExceededError extends Error {
    constructor(provider, reason) {
      super(reason)
      this.provider = provider
    }
  }
}))

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
  aiService = await import('@/services/aiService')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('aiService — chaos engineering', () => {
  const RESULT = { text: 'generated text', usage: null }
  const ONCHUNK = vi.fn()

  it('retries and succeeds after transient network failure', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(2)
  })

  it('retries and succeeds after rate limit error', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(2)
  })

  it('retries and succeeds after 429 error', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(2)
  })

  it('retries and succeeds after 5xx server error', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(2)
  })

  it('retries and succeeds after timeout error', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(2)
  })

  it('retries and succeeds after service unavailable', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('service unavailable'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(2)
  })

  it('retries and succeeds after bad gateway', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('Bad Gateway'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on non-retryable error (400 Bad Request)', async () => {
    mockOllamaModule.generate.mockRejectedValue(new Error('400 Bad Request'))

    await expect(aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })).rejects.toThrow(
      '400 Bad Request'
    )

    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(1)
  })

  it('throws immediately on auth error (401)', async () => {
    mockOllamaModule.generate.mockRejectedValue(new Error('401 Unauthorized'))

    await expect(aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })).rejects.toThrow(
      '401 Unauthorized'
    )

    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting all retries', async () => {
    mockOllamaModule.generate.mockRejectedValue(new Error('timeout'))

    await expect(
      aiService.aiGenerate('prompt', 'system', { retryDelay: 1, maxRetries: 2 })
    ).rejects.toThrow('timeout')

    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(3)
  })

  it('recovers from latency spike via retry', async () => {
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1, maxRetries: 3 })

    expect(result).toBe('generated text')
    expect(mockOllamaModule.generate).toHaveBeenCalledTimes(3)
  })

  it('falls back to next provider when primary fails despite retries', async () => {
    mockSettingsStore.aiFallbackChain = ['openai']
    mockOllamaModule.generate.mockRejectedValue(new Error('timeout'))
    mockOpenaiModule.generate.mockResolvedValue(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1, maxRetries: 1 })

    expect(result).toBe('generated text')
    expect(mockOpenaiModule.generate).toHaveBeenCalledOnce()
  })

  it('does not fall back when a retry eventually succeeds', async () => {
    mockSettingsStore.aiFallbackChain = ['openai']
    mockOllamaModule.generate
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(RESULT)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('generated text')
    expect(mockOpenaiModule.generate).not.toHaveBeenCalled()
  })

  it('handles empty response from provider gracefully', async () => {
    mockOllamaModule.generate.mockResolvedValue({ text: '', usage: null })

    const result = await aiService.aiGenerate('prompt', 'system')

    expect(result).toBe('')
  })

  it('handles null usage from provider gracefully', async () => {
    mockOllamaModule.generate.mockResolvedValue({ text: 'response', usage: null })

    const result = await aiService.aiGenerate('prompt', 'system')

    expect(result).toBe('response')
  })

  it('stream recovers from transient failure before emitting', async () => {
    mockOllamaModule.stream
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementationOnce((_p, _s, _m, onChunk) => {
        onChunk('delta', 'complete text')
        return Promise.resolve('complete text')
      })

    const onChunk = vi.fn()
    const result = await aiService.aiStream('prompt', 'system', onChunk, { retryDelay: 1 })

    expect(result).toBe('complete text')
    expect(mockOllamaModule.stream).toHaveBeenCalledTimes(2)
  })

  it('stream falls back when primary fails despite retries', async () => {
    mockSettingsStore.aiFallbackChain = ['openai']
    mockOllamaModule.stream.mockRejectedValue(new Error('timeout'))
    mockOpenaiModule.stream.mockImplementation((_p, _s, _m, onChunk) => {
      onChunk('delta', 'complete text')
      return Promise.resolve('complete text')
    })

    const onChunk = vi.fn()
    const result = await aiService.aiStream('prompt', 'system', onChunk, { retryDelay: 1 })

    expect(result).toBe('complete text')
    expect(mockOpenaiModule.stream).toHaveBeenCalledOnce()
  })
})

describe('isRetryable — fault injection', () => {
  it('classifies timeout errors as retryable', () => {
    expect(aiService.isRetryable(new Error('timeout'))).toBe(true)
    expect(aiService.isRetryable(new Error('ETIMEDOUT'))).toBe(true)
    expect(aiService.isRetryable(new Error('Request timed out'))).toBe(true)
  })

  it('classifies rate limit errors as retryable', () => {
    expect(aiService.isRetryable(new Error('rate limit exceeded'))).toBe(true)
    expect(aiService.isRetryable(new Error('429 Too Many Requests'))).toBe(true)
    expect(aiService.isRetryable(new Error('Too many requests'))).toBe(true)
  })

  it('classifies 5xx errors as retryable', () => {
    expect(aiService.isRetryable(new Error('500 Internal Server Error'))).toBe(true)
    expect(aiService.isRetryable(new Error('502 Bad Gateway'))).toBe(true)
    expect(aiService.isRetryable(new Error('503 Service Unavailable'))).toBe(true)
  })

  it('classifies network errors as retryable', () => {
    expect(aiService.isRetryable(new Error('ECONNREFUSED'))).toBe(true)
    expect(aiService.isRetryable(new Error('ECONNRESET'))).toBe(true)
    expect(aiService.isRetryable(new Error('socket hang up'))).toBe(true)
    expect(aiService.isRetryable(new Error('network error'))).toBe(true)
  })

  it('classifies 4xx client errors as non-retryable', () => {
    expect(aiService.isRetryable(new Error('400 Bad Request'))).toBe(false)
    expect(aiService.isRetryable(new Error('401 Unauthorized'))).toBe(false)
    expect(aiService.isRetryable(new Error('403 Forbidden'))).toBe(false)
    expect(aiService.isRetryable(new Error('404 Not Found'))).toBe(false)
  })

  it('classifies non-error cases as non-retryable', () => {
    expect(aiService.isRetryable(new Error('something else'))).toBe(false)
    expect(aiService.isRetryable(null)).toBe(false)
  })
})
