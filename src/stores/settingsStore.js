import { defineStore } from 'pinia'
import { ref } from 'vue'
import { obfuscate, deobfuscate } from '../services/ollamaService'
import { PROVIDERS, PROVIDER_DEFAULT, FEATURE_DEFAULTS, EMBEDDING_DEFAULTS } from '../config/ai'
import { aiTestConnection } from '../services/aiService'
import { setOllamaEndpoint as setOllamaConfigEndpoint } from '../config/ollama'
import { STORAGE_KEYS, getApiKeyStorageKey } from '../config/storageKeys'
import { useLocalStorage } from '../composables/useLocalStorage'

const DEFAULT_SETTINGS = {
  ollamaEndpoint: '/ollama',
  ollamaModel: 'dolphin-mistral:7b',
  openaiApiKey: '',
  autoSaveInterval: 5,
  aiProvider: PROVIDER_DEFAULT,
  aiProviderFallback: 'none',
  embeddingProvider: EMBEDDING_DEFAULTS.provider,
  embeddingModel: EMBEDDING_DEFAULTS.model,
  embeddingThreshold: EMBEDDING_DEFAULTS.threshold
}

export const useSettingsStore = defineStore('settings', () => {
  const ollamaEndpoint = ref(DEFAULT_SETTINGS.ollamaEndpoint)
  const ollamaModel = ref(DEFAULT_SETTINGS.ollamaModel)
  const openaiApiKey = ref(DEFAULT_SETTINGS.openaiApiKey)
  const autoSaveInterval = ref(DEFAULT_SETTINGS.autoSaveInterval)
  const aiProvider = ref(DEFAULT_SETTINGS.aiProvider)
  const aiProviderFallback = ref(DEFAULT_SETTINGS.aiProviderFallback)
  const embeddingProvider = ref(DEFAULT_SETTINGS.embeddingProvider)
  const embeddingModel = ref(DEFAULT_SETTINGS.embeddingModel)
  const embeddingThreshold = ref(DEFAULT_SETTINGS.embeddingThreshold)

  const featureModels = useLocalStorage(STORAGE_KEYS.FEATURE_MODELS, {})

  function getFeatureDefault(feature) {
    return FEATURE_DEFAULTS[feature] || { provider: null, model: null }
  }

  function resolveFeatureProvider(feature) {
    const override = featureModels.value[feature]
    if (override?.provider && override.provider !== 'default') return override.provider
    return aiProvider.value
  }

  function resolveFeatureModel(feature) {
    const override = featureModels.value[feature]
    if (override?.model) return override.model
    const def = getFeatureDefault(feature)
    if (def.model) return def.model
    return null
  }

  function loadSettings() {
    try {
      // STORAGE_KEYS ref
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS)
      if (stored) {
        const data = JSON.parse(stored)
        if (data.ollamaEndpoint) {
          ollamaEndpoint.value = data.ollamaEndpoint
          setOllamaConfigEndpoint(data.ollamaEndpoint)
        }
        if (data.ollamaModel) ollamaModel.value = data.ollamaModel
        if (data.autoSaveInterval) autoSaveInterval.value = data.autoSaveInterval
        if (data.aiProvider) aiProvider.value = data.aiProvider
        if (data.aiProviderFallback) aiProviderFallback.value = data.aiProviderFallback
        if (data.embeddingProvider) embeddingProvider.value = data.embeddingProvider
        if (data.embeddingModel) embeddingModel.value = data.embeddingModel
        if (data.embeddingThreshold !== undefined)
          embeddingThreshold.value = data.embeddingThreshold
      }

      // STORAGE_KEYS ref
      const encryptedKey = localStorage.getItem(STORAGE_KEYS.OPENAI_KEY)
      if (encryptedKey) {
        try {
          openaiApiKey.value = deobfuscate(encryptedKey)
        } catch {
          openaiApiKey.value = ''
        }
      }

      // featureModels loaded reactively via useLocalStorage
    } catch (e) {
      console.warn('Failed to load settings:', e)
    }
  }

  function saveSettings() {
    try {
      // STORAGE_KEYS ref
      localStorage.setItem(
        STORAGE_KEYS.SETTINGS,
        JSON.stringify({
          ollamaEndpoint: ollamaEndpoint.value,
          ollamaModel: ollamaModel.value,
          openaiApiKey: openaiApiKey.value,
          autoSaveInterval: autoSaveInterval.value,
          aiProvider: aiProvider.value,
          aiProviderFallback: aiProviderFallback.value,
          embeddingProvider: embeddingProvider.value,
          embeddingModel: embeddingModel.value,
          embeddingThreshold: embeddingThreshold.value
        })
      )
    } catch (e) {
      console.warn('Failed to save settings:', e)
    }
  }

  function setOllamaEndpoint(url) {
    ollamaEndpoint.value = url
    setOllamaConfigEndpoint(url)
    saveSettings()
  }

  function setOllamaModel(model) {
    ollamaModel.value = model
    saveSettings()
  }

  /**
   * SECURITY NOTE: API keys are stored in localStorage with basic obfuscation
   * (obfuscate). This is NOT real encryption — any script running on the
   * page can read and decode the key. This is a known limitation of a local-first
   * browser app. Users should treat stored keys as low-privilege and avoid using
   * high-spend keys.
   */
  function setOpenaiApiKey(key) {
    openaiApiKey.value = key
    if (key) {
      // STORAGE_KEYS ref
      localStorage.setItem(STORAGE_KEYS.OPENAI_KEY, obfuscate(key))
    } else {
      // STORAGE_KEYS ref
      localStorage.removeItem(STORAGE_KEYS.OPENAI_KEY)
    }
    saveSettings()
  }

  function setAutoSaveInterval(minutes) {
    autoSaveInterval.value = minutes
    saveSettings()
  }

  function setAIProvider(provider) {
    aiProvider.value = provider
    saveSettings()
  }

  function setAIProviderFallback(fallback) {
    aiProviderFallback.value = fallback
    saveSettings()
  }

  function setFeatureModel(feature, provider, model) {
    featureModels.value = {
      ...featureModels.value,
      [feature]: { provider: provider || 'default', model: model || null }
    }
    saveSettings()
  }

  function getStoredApiKey(provider) {
    const encrypted = localStorage.getItem(getApiKeyStorageKey(provider))
    if (!encrypted) return ''
    try {
      return deobfuscate(encrypted)
    } catch {
      return ''
    }
  }

  function setStoredApiKey(provider, key) {
    if (key) {
      localStorage.setItem(getApiKeyStorageKey(provider), obfuscate(key))
    } else {
      localStorage.removeItem(getApiKeyStorageKey(provider))
    }
  }

  function setEmbeddingProvider(provider) {
    embeddingProvider.value = provider
    saveSettings()
  }

  function setEmbeddingModel(model) {
    embeddingModel.value = model
    saveSettings()
  }

  function setEmbeddingThreshold(threshold) {
    embeddingThreshold.value = threshold
    saveSettings()
  }

  function resetToDefaults() {
    ollamaEndpoint.value = DEFAULT_SETTINGS.ollamaEndpoint
    setOllamaConfigEndpoint(DEFAULT_SETTINGS.ollamaEndpoint)
    ollamaModel.value = DEFAULT_SETTINGS.ollamaModel
    openaiApiKey.value = ''
    autoSaveInterval.value = DEFAULT_SETTINGS.autoSaveInterval
    aiProvider.value = DEFAULT_SETTINGS.aiProvider
    aiProviderFallback.value = DEFAULT_SETTINGS.aiProviderFallback
    embeddingProvider.value = DEFAULT_SETTINGS.embeddingProvider
    embeddingModel.value = DEFAULT_SETTINGS.embeddingModel
    embeddingThreshold.value = DEFAULT_SETTINGS.embeddingThreshold
    featureModels.value = {}
    saveSettings()
  }

  async function testOllamaConnection() {
    try {
      const response = await fetch(`${ollamaEndpoint.value}/api/tags`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
      if (response.ok) {
        return { success: true, message: 'Connection successful' }
      }
      return { success: false, message: `Server returned ${response.status}` }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  async function testProviderConnection(provider) {
    if (provider === PROVIDERS.OLLAMA) {
      return await testOllamaConnection()
    }
    const key = getStoredApiKey(provider)
    if (!key) {
      return { success: false, message: 'No API key configured' }
    }
    try {
      const ok = await aiTestConnection(provider, key)
      return ok
        ? { success: true, message: 'Connection successful' }
        : { success: false, message: 'Connection failed' }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }

  loadSettings()

  return {
    ollamaEndpoint,
    ollamaModel,
    openaiApiKey,
    autoSaveInterval,
    aiProvider,
    aiProviderFallback,
    embeddingProvider,
    embeddingModel,
    embeddingThreshold,
    featureModels,
    resolveFeatureProvider,
    resolveFeatureModel,
    loadSettings,
    saveSettings,
    setOllamaEndpoint,
    setOllamaModel,
    setOpenaiApiKey,
    setAutoSaveInterval,
    setAIProvider,
    setAIProviderFallback,
    setFeatureModel,
    getStoredApiKey,
    setStoredApiKey,
    setEmbeddingProvider,
    setEmbeddingModel,
    setEmbeddingThreshold,
    resetToDefaults,
    testOllamaConnection,
    testProviderConnection
  }
})
