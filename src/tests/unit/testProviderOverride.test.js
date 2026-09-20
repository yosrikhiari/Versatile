import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/ollamaService', () => ({
  encrypt: vi.fn(async (s) => `enc:${s}`),
  decrypt: vi.fn(async (s) => String(s).replace(/^enc:/, ''))
}))

vi.mock('@/config/ai', () => ({
  PROVIDERS: { OLLAMA: 'ollama', OPENAI: 'openai', CLOUDFLARE: 'cloudflare' },
  PROVIDER_DEFAULT: 'ollama',
  FEATURE_DEFAULTS: {},
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 }
}))

vi.mock('@/services/aiService', () => ({ aiTestConnection: vi.fn(async () => true) }))
vi.mock('@/config/ollama', () => ({
  setOllamaEndpoint: vi.fn(),
  DEFAULT_MODEL: 'qwen3:8b'
}))
vi.mock('@/config/storageKeys', () => ({
  STORAGE_KEYS: { SETTINGS: 'versatile_settings', FEATURE_MODELS: 'FEATURE_MODELS' },
  getApiKeyStorageKey: (p) => `versatile_api_key_${p}`
}))
vi.mock('@/services/api', () => ({ getAuthHeaders: () => ({}) }))

const { aiTestConnection } = await import('@/services/aiService')
const { useSettingsStore } = await import('@/stores/settingsStore')

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('testProviderConnection key override', () => {
  it('tests the passed key instead of requiring a saved one', async () => {
    const store = useSettingsStore()
    const result = await store.testProviderConnection('openai', 'sk-pasted')

    expect(aiTestConnection).toHaveBeenCalledWith('openai', 'sk-pasted', undefined)
    expect(result).toEqual({ success: true, message: 'Connection successful' })
  })

  it('falls back to the stored key when the input is empty', async () => {
    localStorage.setItem('versatile_api_key_openai', 'enc:sk-stored')
    const store = useSettingsStore()
    const result = await store.testProviderConnection('openai', '')

    expect(aiTestConnection).toHaveBeenCalledWith('openai', 'sk-stored', undefined)
    expect(result.success).toBe(true)
  })

  it('still reports missing when neither input nor stored key exists', async () => {
    const store = useSettingsStore()
    const result = await store.testProviderConnection('openai', '')

    expect(aiTestConnection).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, message: 'No API key configured' })
  })

  it('passes the typed Cloudflare account id through', async () => {
    const store = useSettingsStore()
    await store.testProviderConnection('cloudflare', 'cf-token', 'acct-typed')

    expect(aiTestConnection).toHaveBeenCalledWith('cloudflare', 'cf-token', 'acct-typed')
  })
})
