import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

let aiService, settingsStore, routing

beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  localStorage.clear()
  aiService = await import('@/services/aiService')
  routing = await import('@/config/modelRouting')
  const { useSettingsStore } = await import('@/stores/settingsStore')
  settingsStore = useSettingsStore()
  settingsStore.aiProvider = 'ollama'
  settingsStore.ollamaModel = 'qwen3:8b'
  // Most tests here are about how routing chooses BETWEEN providers, so they
  // need the local-only override off. Its own behaviour is covered below.
  settingsStore.localOnly = false
})

describe('utility model routing', () => {
  it('uses the main model when no utility model is configured', () => {
    const cfg = aiService.resolveOptimalConfig('story_generation', { role: 'utility' })
    expect(cfg.model).toBe('qwen3:8b')
  })

  it('routes utility work to the utility model once configured', () => {
    localStorage.setItem('versatile_ollama_utility_model', 'phi4-mini:3.8b')
    const cfg = aiService.resolveOptimalConfig('story_generation', { role: 'utility' })
    expect(cfg.model).toBe('phi4-mini:3.8b')
  })

  it('leaves prose on the main model', () => {
    localStorage.setItem('versatile_ollama_utility_model', 'phi4-mini:3.8b')
    const cfg = aiService.resolveOptimalConfig('story_generation', {})
    expect(cfg.model).toBe('qwen3:8b')
  })

  it('does not redirect utility work away from a hosted provider', () => {
    // The user's own provider choice already expresses this trade-off; silently
    // swapping their cloud model for a local one would be overreach.
    localStorage.setItem('versatile_ollama_utility_model', 'phi4-mini:3.8b')
    // A user who chose OpenAI has an OpenAI key. Without one the call cannot be
    // made at all, which is a different scenario (covered below).
    localStorage.setItem('versatile_api_key_openai', 'encrypted-blob')
    settingsStore.aiProvider = 'openai'
    const cfg = aiService.resolveOptimalConfig('story_generation', { role: 'utility' })
    expect(cfg.provider).toBe('openai')
    expect(cfg.model).not.toBe('phi4-mini:3.8b')
  })
})

describe('routing around providers the user cannot reach', () => {
  // The failure that emptied a ten-volume novel: the matrix routes
  // STORY_GENERATION to Anthropic at standard/critical complexity, the writer
  // passes a complexity on every call, and a local-only user has no Anthropic
  // key — so all 300 scenes failed with "anthropic API key not configured".
  it('does not send a local-only user to a keyless cloud provider', () => {
    settingsStore.aiProvider = 'ollama'
    const cfg = aiService.resolveOptimalConfig('story_generation', { complexity: 'critical' })
    expect(cfg.provider).toBe('ollama')
    expect(cfg.model).toBe('qwen3:8b')
  })

  it('uses the matrix choice once that provider is configured', () => {
    localStorage.setItem('versatile_api_key_anthropic', 'encrypted-blob')
    const cfg = aiService.resolveOptimalConfig('story_generation', { complexity: 'critical' })
    expect(cfg.provider).toBe('anthropic')
  })

  it('leaves the pure routing preference itself untouched', () => {
    // `resolveOptimalModel` states what is BEST, independent of this machine's
    // credentials; only the call boundary filters by what can actually run.
    const ideal = routing.resolveOptimalModel('story_generation', { complexity: 'critical' })
    expect(ideal.provider).toBe('anthropic')
    expect(ideal.matrixMatch).toBe(true)
  })
})

describe('local-only mode', () => {
  beforeEach(() => {
    settingsStore.localOnly = true
  })

  it('keeps work local even when every cloud provider is configured', () => {
    localStorage.setItem('versatile_api_key_anthropic', 'encrypted-blob')
    localStorage.setItem('versatile_api_key_openai', 'encrypted-blob')
    settingsStore.aiProvider = 'anthropic'

    const cfg = aiService.resolveOptimalConfig('story_generation', { complexity: 'critical' })
    expect(cfg.provider).toBe('ollama')
    expect(cfg.model).toBe('qwen3:8b')
  })

  it('overrides an explicit per-feature cloud choice', () => {
    localStorage.setItem('versatile_api_key_openai', 'encrypted-blob')
    settingsStore.featureModels = { story_generation: { provider: 'openai', model: 'gpt-4o' } }

    const cfg = aiService.resolveOptimalConfig('story_generation', { complexity: 'standard' })
    expect(cfg.provider).toBe('ollama')
    expect(cfg.model).toBe('qwen3:8b')
  })

  it('still honours a local per-feature model choice', () => {
    settingsStore.featureModels = {
      story_generation: { provider: 'ollama', model: 'dolphin-mistral:7b' }
    }
    const cfg = aiService.resolveOptimalConfig('story_generation', { complexity: 'critical' })
    expect(cfg.provider).toBe('ollama')
    expect(cfg.model).toBe('dolphin-mistral:7b')
  })

  it('still routes utility work to the utility model', () => {
    localStorage.setItem('versatile_ollama_utility_model', 'phi4-mini:3.8b')
    const cfg = aiService.resolveOptimalConfig('story_generation', { role: 'utility' })
    expect(cfg.provider).toBe('ollama')
    expect(cfg.model).toBe('phi4-mini:3.8b')
  })

  it('reports the local provider to callers that read the feature config directly', () => {
    // spine.ts decides its concurrency from this; a hosted answer here would
    // have it schedule a run that never happens.
    settingsStore.aiProvider = 'anthropic'
    expect(aiService.resolveFeatureConfig('story_generation').provider).toBe('ollama')
  })
})

describe('feature model override precedence', () => {
  it('honours an explicit per-feature choice over the routing matrix', () => {
    // Regression: the matrix was consulted first and has an entry for every
    // feature at every complexity, so an explicit setting was unreachable for
    // any call that passed a complexity — which is every scene the writer makes.
    // An Ollama-only user silently had a cloud provider attempted instead.
    settingsStore.featureModels = {
      story_generation: { provider: 'ollama', model: 'dolphin-mistral:7b' }
    }
    const resolved = routing.resolveOptimalModel('story_generation', { complexity: 'critical' })
    expect(resolved.provider).toBe('ollama')
    expect(resolved.model).toBe('dolphin-mistral:7b')
  })

  it('still falls back to the matrix when no override is set', () => {
    settingsStore.featureModels = {}
    const resolved = routing.resolveOptimalModel('story_generation', { complexity: 'critical' })
    expect(resolved.matrixMatch).toBe(true)
  })

  it("treats the 'default' sentinel as no override", () => {
    settingsStore.featureModels = { story_generation: { provider: 'default' } }
    const resolved = routing.resolveOptimalModel('story_generation', { complexity: 'critical' })
    expect(resolved.matrixMatch).toBe(true)
  })
})

describe('local model context windows', () => {
  it('knows the real window for local models instead of assuming a flat default', async () => {
    const { getContextWindow } = await import('@/services/ai/modelBudget')
    expect(getContextWindow('qwen3:8b')).toBe(40960)
    expect(getContextWindow('phi4-mini:3.8b')).toBe(131072)
  })

  it('can learn an unknown local model at runtime', async () => {
    const { getContextWindow } = await import('@/services/ai/modelBudget')
    expect(getContextWindow('some-custom:latest')).toBeNull()
    routing.registerLocalModelMeta('some-custom:latest', { contextWindow: 65536 })
    expect(getContextWindow('some-custom:latest')).toBe(65536)
  })
})
