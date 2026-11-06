import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/ollamaService', () => ({
  simpleEncrypt: vi.fn((s) => btoa(s)),
  simpleDecrypt: vi.fn((s) => {
    try {
      return atob(s)
    } catch {
      return s
    }
  }),
  encrypt: vi.fn(async (s) => s),
  decrypt: vi.fn(async (s) => s)
}))

vi.mock('@/config/ai', () => ({
  PROVIDERS: { OLLAMA: 'ollama', OPENAI: 'openai' },
  PROVIDER_DEFAULT: 'ollama',
  FEATURE_DEFAULTS: {},
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 }
}))

vi.mock('@/services/aiService', () => ({ aiTestConnection: vi.fn() }))
vi.mock('@/config/ollama', () => ({
  setOllamaEndpoint: vi.fn(),
  DEFAULT_MODEL: 'qwen3:8b'
}))
vi.mock('@/config/storageKeys', () => ({
  STORAGE_KEYS: { FEATURE_MODELS: 'FEATURE_MODELS' },
  getApiKeyStorageKey: vi.fn((p) => `versatile_api_key_${p}`)
}))

let useSettingsStore
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  const mod = await import('@/stores/settingsStore')
  useSettingsStore = mod.useSettingsStore
})

describe('settingsStore', () => {
  it('initializes with default values', () => {
    const store = useSettingsStore()
    expect(store.ollamaEndpoint).toBeDefined()
    expect(store.ollamaModel).toBeDefined()
    expect(store.aiProvider).toBe('ollama')
    expect(store.autoSaveInterval).toBe(5)
  })

  it('sets ollama endpoint', () => {
    const store = useSettingsStore()
    store.setOllamaEndpoint('http://localhost:11434')
    expect(store.ollamaEndpoint).toBe('http://localhost:11434')
  })

  it('sets ollama model', () => {
    const store = useSettingsStore()
    store.setOllamaModel('llama3')
    expect(store.ollamaModel).toBe('llama3')
  })

  it('sets AI provider', () => {
    const store = useSettingsStore()
    store.setAIProvider('openai')
    expect(store.aiProvider).toBe('openai')
  })

  it('sets auto save interval', () => {
    const store = useSettingsStore()
    store.setAutoSaveInterval(10)
    expect(store.autoSaveInterval).toBe(10)
  })

  it('sets embedding provider', () => {
    const store = useSettingsStore()
    store.setEmbeddingProvider('openai')
    expect(store.embeddingProvider).toBe('openai')
  })

  it('sets embedding model', () => {
    const store = useSettingsStore()
    store.setEmbeddingModel('text-embedding-ada-002')
    expect(store.embeddingModel).toBe('text-embedding-ada-002')
  })

  it('sets embedding threshold', () => {
    const store = useSettingsStore()
    store.setEmbeddingThreshold(0.5)
    expect(store.embeddingThreshold).toBe(0.5)
  })

  it('sets feature model', () => {
    const store = useSettingsStore()
    store.setFeatureModel('content', 'ollama', 'llama3')
    expect(store.featureModels.content).toEqual({ provider: 'ollama', model: 'llama3' })
  })

  it('keeps cloud audit consent out of browser settings', () => {
    const store = useSettingsStore()
    // Consent is a project-row field (`projectStore.cloudAuditOptIn`). A
    // browser-wide opt-in would let a new book inherit an old one's decision.
    expect(store.cloudAuditOptIn).toBeUndefined()
  })

  it('persists the analysis tier through save and load', () => {
    const store = useSettingsStore()
    store.setAnalysisTier('cloud-audit')
    expect(store.analysisTier).toBe('cloud-audit')

    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    reloaded.loadSettings()
    expect(reloaded.analysisTier).toBe('cloud-audit')
  })

  it('resets to defaults', () => {
    const store = useSettingsStore()
    store.setOllamaEndpoint('http://custom')
    store.setAutoSaveInterval(99)
    store.resetToDefaults()
    expect(store.ollamaEndpoint).not.toBe('http://custom')
  })
})
