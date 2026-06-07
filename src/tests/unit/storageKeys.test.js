import { describe, it, expect } from 'vitest'
import { STORAGE_KEYS, getApiKeyStorageKey, getEmbeddingStorageKey } from '../../config/storageKeys'

describe('storageKeys config', () => {
  describe('STORAGE_KEYS constants', () => {
    it('defines CORE_LOOP_SEEN', () => {
      expect(STORAGE_KEYS.CORE_LOOP_SEEN).toBe('versatile_core_loop_seen')
    })

    it('defines ONBOARDING_V2', () => {
      expect(STORAGE_KEYS.ONBOARDING_V2).toBe('versatile_onboarding_v2')
    })

    it('defines SETTINGS', () => {
      expect(STORAGE_KEYS.SETTINGS).toBe('versatile_settings')
    })

    it('defines API_KEY_PREFIX', () => {
      expect(STORAGE_KEYS.API_KEY_PREFIX).toBe('versatile_api_key_')
    })

    it('defines EMBEDDING_PREFIX', () => {
      expect(STORAGE_KEYS.EMBEDDING_PREFIX).toBe('versatile_embedding_')
    })
  })

  describe('getApiKeyStorageKey', () => {
    it('returns key prefixed with API_KEY_PREFIX', () => {
      expect(getApiKeyStorageKey('openai')).toBe('versatile_api_key_openai')
    })

    it('returns key for anthropic', () => {
      expect(getApiKeyStorageKey('anthropic')).toBe('versatile_api_key_anthropic')
    })
  })

  describe('getEmbeddingStorageKey', () => {
    it('returns key prefixed with EMBEDDING_PREFIX', () => {
      expect(getEmbeddingStorageKey('my-cache')).toBe('versatile_embedding_my-cache')
    })
  })
})
