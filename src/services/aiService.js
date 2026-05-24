import { PROVIDERS, FEATURES, API_KEY_STORAGE_PREFIX } from '../config/ai'
import { useSettingsStore } from '../stores/settingsStore'
import { simpleDecrypt } from './ollamaService'
import * as ollamaProvider from './providers/ollama'
import * as openaiProvider from './providers/openai'
import * as anthropicProvider from './providers/anthropic'
import * as geminiProvider from './providers/gemini'
import * as groqProvider from './providers/groq'

const PROVIDER_MAP = {
  [PROVIDERS.OLLAMA]: ollamaProvider,
  [PROVIDERS.OPENAI]: openaiProvider,
  [PROVIDERS.ANTHROPIC]: anthropicProvider,
  [PROVIDERS.GEMINI]: geminiProvider,
  [PROVIDERS.GROQ]: groqProvider
}

function getApiKey(provider) {
  if (provider === PROVIDERS.OLLAMA) return null
  const encrypted = localStorage.getItem(`${API_KEY_STORAGE_PREFIX}${provider}`)
  if (!encrypted) return ''
  try {
    return simpleDecrypt(encrypted)
  } catch {
    return ''
  }
}

function resolveFeatureConfig(feature) {
  const store = useSettingsStore()
  const override = store.featureModels?.[feature]
  if (override?.provider && override.provider !== 'default') {
    return {
      provider: override.provider,
      model: override.model || null
    }
  }
  return {
    provider: store.aiProvider,
    model: store.aiProvider === PROVIDERS.OLLAMA ? store.ollamaModel : null
  }
}

export function getConfiguredModel(feature) {
  const config = resolveFeatureConfig(feature)
  return config.model
}

export function getConfiguredProvider(feature) {
  const config = resolveFeatureConfig(feature)
  return config.provider
}

export async function aiGenerate(prompt, systemPrompt, options = {}) {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveFeatureConfig(feature)
  const provider = options.provider || config.provider
  const model = options.model || config.model

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const apiKey = getApiKey(provider)
  if (provider !== PROVIDERS.OLLAMA && !apiKey) {
    throw new Error(`${provider} API key not configured. Please add it in Settings > AI Providers.`)
  }

  const providerOptions = {
    apiKey: apiKey || undefined,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    timeout: options.timeout
  }

  try {
    return await providerModule.generate(prompt, systemPrompt, model, providerOptions)
  } catch (error) {
    const store = useSettingsStore()
    if (store.aiProviderFallback && store.aiProviderFallback !== 'none') {
      const fallbackModule = PROVIDER_MAP[store.aiProviderFallback]
      if (fallbackModule) {
        const fallbackKey = getApiKey(store.aiProviderFallback)
        if (store.aiProviderFallback === PROVIDERS.OLLAMA || fallbackKey) {
          return await fallbackModule.generate(prompt, systemPrompt, null, {
            apiKey: fallbackKey || undefined,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            timeout: options.timeout
          })
        }
      }
    }
    throw error
  }
}

export async function aiStream(prompt, systemPrompt, onChunk, options = {}) {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveFeatureConfig(feature)
  const provider = options.provider || config.provider
  const model = options.model || config.model

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const apiKey = getApiKey(provider)
  if (provider !== PROVIDERS.OLLAMA && !apiKey) {
    throw new Error(`${provider} API key not configured. Please add it in Settings > AI Providers.`)
  }

  const providerOptions = {
    apiKey: apiKey || undefined,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    timeout: options.timeout
  }

  return await providerModule.stream(prompt, systemPrompt, model, onChunk, providerOptions)
}

export async function aiTestConnection(provider, apiKey) {
  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)
  if (provider === PROVIDERS.OLLAMA) {
    return await providerModule.testConnection()
  }
  return await providerModule.testConnection(apiKey)
}

export async function aiListModels() {
  return await ollamaProvider.listModels()
}

export { ollamaProvider }
