/**
 * Centralized registry for all localStorage keys used across the application.
 */
export const STORAGE_KEYS = {
  // App State & Onboarding
  CORE_LOOP_SEEN: 'versatile_core_loop_seen',
  ONBOARDING_V2: 'versatile_onboarding_v2',
  
  // Settings & Configuration
  SETTINGS: 'versatile_settings',
  FEATURE_MODELS: 'versatile_feature_models',
  
  // API & Providers
  OLLAMA_ENDPOINT: 'versatile_ollama_endpoint',
  OLLAMA_MODEL: 'versatile_ollama_model',
  OPENAI_KEY: 'versatile_openai_key',
  OPENAI_FALLBACK_PROMPTED: 'versatile_openai_fallback_prompted',
  EMBEDDING_MODEL: 'versatile_embedding_model',
  
  // Dynamic Keys (Prefixes)
  API_KEY_PREFIX: 'versatile_api_key_',
  EMBEDDING_PREFIX: 'versatile_embedding_',

  // User Preferences
  CHAPTER_CONTEXT: 'versatile_chapter_context',
  SESSION_GOAL: 'pref_sessionGoal',
  ACTIVE_LENSES: 'pref_activeLenses',
  SPARK_PROMPT_TYPE: 'pref_selectedPromptType',
  SPARK_RELATE_PROJECT: 'pref_relateToProject',
}

/**
 * Helper to get a dynamic API key storage key
 * @param {string} provider 
 * @returns {string}
 */
export function getApiKeyStorageKey(provider) {
  return `${STORAGE_KEYS.API_KEY_PREFIX}${provider}`
}

/**
 * Helper to get an embedding cache key
 * @param {string} cacheKey 
 * @returns {string}
 */
export function getEmbeddingStorageKey(cacheKey) {
  return `${STORAGE_KEYS.EMBEDDING_PREFIX}${cacheKey}`
}
