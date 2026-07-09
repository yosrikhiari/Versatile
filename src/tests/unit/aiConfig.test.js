import { describe, it, expect } from 'vitest'
import * as ai from '../../config/ai'

describe('PROVIDERS', () => {
  it('has the expected providers', () => {
    expect(ai.PROVIDERS.OLLAMA).toBe('ollama')
    expect(ai.PROVIDERS.OPENAI).toBe('openai')
    expect(ai.PROVIDERS.ANTHROPIC).toBe('anthropic')
    expect(ai.PROVIDERS.GEMINI).toBe('gemini')
    expect(ai.PROVIDERS.GROQ).toBe('groq')
  })
})

describe('PROVIDER_LABELS', () => {
  it('has labels for all providers', () => {
    for (const p of Object.values(ai.PROVIDERS)) {
      expect(ai.PROVIDER_LABELS[p]).toBeTruthy()
    }
  })
})

describe('PROVIDER_BASE_URLS', () => {
  it('has URLs for remote providers', () => {
    expect(ai.PROVIDER_BASE_URLS[ai.PROVIDERS.OPENAI]).toMatch(/^https:\/\//)
    expect(ai.PROVIDER_BASE_URLS[ai.PROVIDERS.ANTHROPIC]).toMatch(/^https:\/\//)
    expect(ai.PROVIDER_BASE_URLS[ai.PROVIDERS.GEMINI]).toMatch(/^https:\/\//)
    expect(ai.PROVIDER_BASE_URLS[ai.PROVIDERS.GROQ]).toMatch(/^https:\/\//)
  })
})

describe('PROVIDER_MODELS', () => {
  it('has model lists for each provider', () => {
    for (const p of [
      ai.PROVIDERS.OPENAI,
      ai.PROVIDERS.ANTHROPIC,
      ai.PROVIDERS.GEMINI,
      ai.PROVIDERS.GROQ
    ]) {
      expect(Array.isArray(ai.PROVIDER_MODELS[p])).toBe(true)
      expect(ai.PROVIDER_MODELS[p].length).toBeGreaterThan(0)
    }
  })
})

describe('FEATURES', () => {
  it('has all expected features', () => {
    const expected = [
      'spark',
      'polish',
      'content',
      'worldbuilding',
      'compaction',
      'story_generation',
      'network'
    ]
    for (const f of expected) {
      expect(Object.values(ai.FEATURES)).toContain(f)
    }
  })
})

describe('FEATURE_LABELS', () => {
  it('has labels for all features', () => {
    for (const f of Object.values(ai.FEATURES)) {
      expect(ai.FEATURE_LABELS[f]).toBeTruthy()
    }
  })
})

describe('FEATURE_DEFAULTS', () => {
  it('defaults all features to Ollama', () => {
    for (const f of Object.values(ai.FEATURES)) {
      expect(ai.FEATURE_DEFAULTS[f].provider).toBe('ollama')
      expect(ai.FEATURE_DEFAULTS[f]).toHaveProperty('model')
    }
  })
})

describe('PROVIDER_DEFAULT', () => {
  it('defaults to Ollama', () => {
    expect(ai.PROVIDER_DEFAULT).toBe('ollama')
  })
})

describe('FEATURE_LIST and PROVIDER_LIST', () => {
  it('FEATURE_LIST contains all features', () => {
    expect(ai.FEATURE_LIST.sort()).toEqual(Object.values(ai.FEATURES).sort())
  })

  it('PROVIDER_LIST contains all providers', () => {
    expect(ai.PROVIDER_LIST.sort()).toEqual(Object.values(ai.PROVIDERS).sort())
  })
})

describe('EMBEDDING constants', () => {
  it('has embedding providers', () => {
    expect(ai.EMBEDDING_PROVIDERS.OLLAMA).toBe('ollama')
    expect(ai.EMBEDDING_PROVIDERS.MISTRAL).toBe('mistral')
  })

  it('has embedding defaults with threshold', () => {
    expect(ai.EMBEDDING_DEFAULTS.threshold).toBe(0.75)
    expect(ai.EMBEDDING_DEFAULTS.provider).toBe('ollama')
  })

  it('has threshold boundaries', () => {
    expect(ai.EMBEDDING_THRESHOLD_MIN).toBe(0.4)
    expect(ai.EMBEDDING_THRESHOLD_MAX).toBe(0.98)
    expect(ai.EMBEDDING_THRESHOLD_STEP).toBe(0.01)
  })
})

describe('API_KEY_STORAGE_PREFIX', () => {
  it('has expected prefix', () => {
    expect(ai.API_KEY_STORAGE_PREFIX).toBe('versatile_apikey_')
  })
})
