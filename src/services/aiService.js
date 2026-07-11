import { PROVIDERS, FEATURES, PROVIDER_MODELS } from '../config/ai'
import { getApiKeyStorageKey } from '../config/storageKeys'
import { useSettingsStore } from '../stores/settingsStore'
import { deobfuscate } from './ollamaService'
import * as ollamaProvider from './providers/ollama'
import * as openaiProvider from './providers/openai'
import * as anthropicProvider from './providers/anthropic'
import * as geminiProvider from './providers/gemini'
import * as groqProvider from './providers/groq'

const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /rate limit/i,
  /429/i,
  /5\d{2}/i,
  /too many requests/i,
  /service unavailable/i,
  /internal server error/i,
  /bad gateway/i,
  /econnrefused/i,
  /econnreset/i,
  /etimedout/i,
  /network/i,
  /socket/i
]

function isRetryable(error) {
  const message = error?.message || ''
  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(message))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry(fn, isRetryableFn, options = {}) {
  const maxRetries = options.maxRetries ?? 2
  const retryDelay = options.retryDelay ?? 1000
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const jitter = Math.random() * retryDelay
      await sleep(retryDelay * Math.pow(2, attempt - 1) + jitter)
    }

    try {
      return await fn(attempt, attempt < maxRetries)
    } catch (error) {
      lastError = error
      if (isRetryableFn(error) && attempt < maxRetries) {
        continue
      }
      throw error
    }
  }

  throw lastError
}

const PROVIDER_MAP = {
  [PROVIDERS.OLLAMA]: ollamaProvider,
  [PROVIDERS.OPENAI]: openaiProvider,
  [PROVIDERS.ANTHROPIC]: anthropicProvider,
  [PROVIDERS.GEMINI]: geminiProvider,
  [PROVIDERS.GROQ]: groqProvider
}

function getApiKey(provider) {
  if (provider === PROVIDERS.OLLAMA) return null
  const storageKey = getApiKeyStorageKey(provider)
  // STORAGE_KEYS ref
  const encrypted = localStorage.getItem(storageKey)
  if (!encrypted) return ''
  try {
    return deobfuscate(encrypted)
  } catch {
    return ''
  }
}

function resolveFeatureConfig(feature) {
  const store = useSettingsStore()
  const override = store.featureModels?.[feature]
  const defaultModelFor = (provider) =>
    provider === PROVIDERS.OLLAMA ? store.ollamaModel : PROVIDER_MODELS[provider]?.[0] || null

  if (override?.provider && override.provider !== 'default') {
    return {
      provider: override.provider,
      model: override.model || defaultModelFor(override.provider)
    }
  }
  return {
    provider: store.aiProvider,
    model: defaultModelFor(store.aiProvider)
  }
}

export { resolveFeatureConfig }
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
    signal: options.signal,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    stop: options.stop,
    timeout: options.timeout
  }

  try {
    return await withRetry(
      () => providerModule.generate(prompt, systemPrompt, model, providerOptions),
      isRetryable,
      { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
    )
  } catch (error) {
    const store = useSettingsStore()
    if (store.aiProviderFallback && store.aiProviderFallback !== 'none') {
      const fallbackModule = PROVIDER_MAP[store.aiProviderFallback]
      if (fallbackModule) {
        const fallbackKey = getApiKey(store.aiProviderFallback)
        if (store.aiProviderFallback === PROVIDERS.OLLAMA || fallbackKey) {
          return await fallbackModule.generate(prompt, systemPrompt, null, {
            apiKey: fallbackKey || undefined,
            signal: options.signal,
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
    signal: options.signal,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    stop: options.stop,
    timeout: options.timeout
  }

  try {
    return await withRetry(
      (attempt, isIntermediate) => {
        const chunkHandler = attempt > 0 && isIntermediate ? undefined : onChunk
        return providerModule.stream(prompt, systemPrompt, model, chunkHandler, providerOptions)
      },
      isRetryable,
      { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
    )
  } catch (error) {
    const store = useSettingsStore()
    if (store.aiProviderFallback && store.aiProviderFallback !== 'none') {
      const fallbackModule = PROVIDER_MAP[store.aiProviderFallback]
      if (fallbackModule) {
        const fallbackKey = getApiKey(store.aiProviderFallback)
        if (store.aiProviderFallback === PROVIDERS.OLLAMA || fallbackKey) {
          return await fallbackModule.stream(prompt, systemPrompt, null, onChunk, {
            apiKey: fallbackKey || undefined,
            signal: options.signal,
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
