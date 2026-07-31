import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockSettingsStore = {
  aiProvider: 'ollama',
  ollamaModel: 'llama3',
  featureModels: {},
  aiProviderFallback: 'none',
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
vi.mock('@/services/ollamaService', () => ({ decrypt: vi.fn((s) => Promise.resolve(s)) }))

const mockProviders = vi.hoisted(() => ({
  ollama: {
    generate: vi.fn(),
    stream: vi.fn(),
    generateStructured: vi.fn(),
    testConnection: vi.fn(),
    listModels: vi.fn()
  }
}))

vi.mock('@/services/providers/ollama', () => ({
  generate: mockProviders.ollama.generate,
  stream: mockProviders.ollama.stream,
  generateStructured: mockProviders.ollama.generateStructured,
  testConnection: mockProviders.ollama.testConnection,
  listModels: mockProviders.ollama.listModels
}))

vi.mock('@/services/providers/openai', () => ({
  generate: vi.fn(),
  stream: vi.fn(),
  generateStructured: vi.fn(),
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

vi.mock('@/services/aiProviderBudget', () => ({
  providerBudget: { check: vi.fn(() => ({ allowed: true })), record: vi.fn() },
  BudgetExceededError: class BudgetExceededError extends Error {
    constructor(provider, reason) {
      super(reason)
      this.provider = provider
    }
  }
}))

vi.mock('@/services/ai/contextBudget', () => ({
  estimateTokens: vi.fn(() => 99999),
  preloadTokenizer: vi.fn(() => Promise.resolve()),
  trimToTokens: vi.fn((t) => t),
  fitToBudget: vi.fn((b) => ({
    blocks: b,
    text: '',
    usedTokens: 0,
    budgetTokens: 0,
    dropped: [],
    degraded: [],
    fits: true
  })),
  fitSceneContext: vi.fn(() => ({
    storyContract: '',
    existingEntitiesJson: '',
    storyContextBlock: '',
    spineContext: '',
    logSummary: '',
    sceneContext: '',
    note: '',
    fits: true
  })),
  describeBudget: vi.fn(() => '')
}))

import { TokenLimitError, InputBudgetExceededError } from '@/services/ai/tokenLimitError'

let aiService

beforeEach(async () => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockSettingsStore.aiProvider = 'ollama'
  mockSettingsStore.ollamaModel = 'llama3'
  mockSettingsStore.featureModels = {}
  mockSettingsStore.aiProviderFallback = 'none'
  mockSettingsStore.aiFallbackChain = []
  localStorage.setItem('key_storage', 'fake-key')
  localStorage.removeItem('versatile-cost-logs')
  aiService = await import('@/services/aiService')
})

describe('isRetryable with TokenLimitError', () => {
  it('returns true for TokenLimitError', () => {
    const { isRetryable } = aiService
    const err = new TokenLimitError('token budget exceeded', 'ollama', 'llama3')
    expect(isRetryable(err)).toBe(true)
  })
})

describe('checkPromptSanityCap', () => {
  it('throws InputBudgetExceededError when prompt exceeds 2x context window', async () => {
    await expect(aiService.aiGenerate('huge-prompt', 'system')).rejects.toThrow(
      InputBudgetExceededError
    )
  })

  it('lets prompts within the sanity cap through to the provider', async () => {
    const contextBudget = await import('@/services/ai/contextBudget')
    contextBudget.estimateTokens.mockReturnValue(100)

    mockProviders.ollama.generate.mockResolvedValue({ text: 'ok', usage: null })

    const result = await aiService.aiGenerate('small-prompt', 'system')
    expect(result).toBe('ok')
  })
})

describe('TokenLimitError retry in aiGenerate', () => {
  it('halves maxTokens and retries on TokenLimitError', async () => {
    const generateMock = vi
      .fn()
      .mockRejectedValueOnce(new TokenLimitError('overflow', 'ollama', 'llama3', 4096))
      .mockResolvedValueOnce({ text: 'retried-text', usage: null })

    mockProviders.ollama.generate.mockImplementation(generateMock)

    const contextBudget = await import('@/services/ai/contextBudget')
    contextBudget.estimateTokens.mockReturnValue(100)

    const result = await aiService.aiGenerate('prompt', 'system', { retryDelay: 1 })

    expect(result).toBe('retried-text')
    expect(generateMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry TokenLimitError when maxTokens is already at MIN_OUTPUT_TOKENS', async () => {
    const generateMock = vi
      .fn()
      .mockRejectedValue(new TokenLimitError('overflow', 'ollama', 'llama3', 1024))
    mockProviders.ollama.generate.mockImplementation(generateMock)

    const contextBudget = await import('@/services/ai/contextBudget')
    contextBudget.estimateTokens.mockReturnValue(100)

    await expect(
      aiService.aiGenerate('prompt', 'system', { maxTokens: 1024, retryDelay: 1 })
    ).rejects.toThrow(TokenLimitError)

    expect(generateMock).toHaveBeenCalledTimes(1)
  })
})

describe('TokenLimitError retry in aiStream', () => {
  it('halves maxTokens and retries on TokenLimitError before any chunk emitted', async () => {
    const streamMock = vi
      .fn()
      .mockRejectedValueOnce(new TokenLimitError('overflow', 'ollama', 'llama3', 4096))
      .mockResolvedValueOnce('stream-retried-text')

    mockProviders.ollama.stream.mockImplementation(streamMock)

    const contextBudget = await import('@/services/ai/contextBudget')
    contextBudget.estimateTokens.mockReturnValue(100)

    const result = await aiService.aiStream('prompt', 'system', undefined, { retryDelay: 1 })

    expect(result).toBe('stream-retried-text')
    expect(streamMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry TokenLimitError after a chunk has been emitted', async () => {
    const streamMock = vi.fn()

    streamMock.mockImplementationOnce((_p, _s, _m, onChunk) => {
      onChunk?.('partial', 'partial text')
      return Promise.reject(new TokenLimitError('overflow', 'ollama', 'llama3', 4096))
    })

    mockProviders.ollama.stream.mockImplementation(streamMock)

    const contextBudget = await import('@/services/ai/contextBudget')
    contextBudget.estimateTokens.mockReturnValue(100)

    const onChunk = vi.fn()
    await expect(
      aiService.aiStream('prompt', 'system', onChunk, { retryDelay: 1 })
    ).rejects.toThrow(TokenLimitError)

    expect(streamMock).toHaveBeenCalledTimes(1)
    expect(onChunk).toHaveBeenCalledWith('partial', 'partial text')
  })
})

describe('TokenLimitError retry in aiGenerateStructured', () => {
  it('halves maxTokens and retries on TokenLimitError', async () => {
    const structuredMock = vi
      .fn()
      .mockRejectedValueOnce(new TokenLimitError('overflow', 'ollama', 'llama3', 4096))
      .mockResolvedValueOnce({ data: { result: 'hello' }, usage: null })

    mockProviders.ollama.generateStructured.mockImplementation(structuredMock)

    const contextBudget = await import('@/services/ai/contextBudget')
    contextBudget.estimateTokens.mockReturnValue(100)

    const result = await aiService.aiGenerateStructured('generate JSON', 'system', {
      schema: { type: 'object' },
      retryDelay: 1
    })

    expect(result).toEqual({ result: 'hello' })
    expect(structuredMock).toHaveBeenCalledTimes(2)
  })
})
