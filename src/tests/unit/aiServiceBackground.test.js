import { describe, it, expect, vi, beforeEach } from 'vitest'

// WHATIF-AND-IMPORT-PLAN.md step 3: background callers (book analysis) take
// the provider slot without claiming foreground priority. Claiming it left a
// 30 s marker after every call, which the same loop then waited out.
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

import { isForegroundBusy, resetForegroundWork, resetSemaphores } from '@/services/providerGate'

let aiService

beforeEach(async () => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  resetForegroundWork()
  resetSemaphores()
  localStorage.setItem('key_storage', 'fake-key')
  mockProviders.ollama.generate.mockResolvedValue('ok')
  aiService = await import('@/services/aiService')
})

describe('background calls', () => {
  it('a foreground call leaves the foreground marker behind it', async () => {
    await aiService.aiGenerate('p', 's', { feature: 'content' })
    expect(isForegroundBusy('ollama')).toBe(true)
  })

  it('a background call takes the slot but leaves no marker', async () => {
    await aiService.aiGenerate('p', 's', { feature: 'content', background: true })
    expect(mockProviders.ollama.generate).toHaveBeenCalledTimes(1)
    expect(isForegroundBusy('ollama')).toBe(false)
  })
})
