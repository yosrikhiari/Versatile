import { PROVIDERS, FEATURES, PROVIDER_MODELS } from '../config/ai'
import { getApiKeyStorageKey } from '../config/storageKeys'
import { useSettingsStore } from '../stores/settingsStore'
import { simpleDecrypt } from './ollamaService'
import * as ollamaProvider from './providers/ollama'
import * as openaiProvider from './providers/openai'
import * as anthropicProvider from './providers/anthropic'
import * as geminiProvider from './providers/gemini'
import * as groqProvider from './providers/groq'
import { debugSnapshot } from './debugSnapshot'

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
  return RETRYABLE_ERROR_PATTERNS.some(p => p.test(message))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
    return simpleDecrypt(encrypted)
  } catch {
    return ''
  }
}

function resolveFeatureConfig(feature) {
  const store = useSettingsStore()
  const override = store.featureModels?.[feature]
  const defaultModelFor = (provider) =>
    provider === PROVIDERS.OLLAMA ? store.ollamaModel : (PROVIDER_MODELS[provider]?.[0] || null)

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
    timeout: options.timeout
  }

  const maxRetries = options.maxRetries ?? 2
  const retryDelay = options.retryDelay ?? 1000
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isRetry = attempt > 0

    if (isRetry) {
      const jitter = Math.random() * retryDelay
      await sleep(retryDelay * Math.pow(2, attempt - 1) + jitter)
    }

    debugSnapshot('ai-service-call', {
      feature,
      provider,
      model,
      attempt: attempt + 1,
      maxRetries: maxRetries + 1,
      hasApiKey: !!apiKey,
      promptLength: prompt.length,
      systemPromptLength: systemPrompt.length,
      temperature: providerOptions.temperature,
      maxTokens: providerOptions.maxTokens,
      timeout: providerOptions.timeout,
      hasSignal: !!options.signal
    })

    try {
      const result = await providerModule.generate(prompt, systemPrompt, model, providerOptions)

      debugSnapshot('ai-service-response', {
        feature,
        provider,
        model,
        attempt: attempt + 1,
        resultLength: result?.length || 0,
        resultPreview: result?.slice(0, 500) || '(empty)'
      })

      return result
    } catch (error) {
      lastError = error
      debugSnapshot('ai-service-error', {
        feature,
        provider,
        model,
        attempt: attempt + 1,
        errorMessage: error?.message || 'Unknown error',
        errorName: error?.name || ''
      })

      if (isRetryable(error) && attempt < maxRetries) {
        continue
      }

      if (!isRetryable(error) || attempt >= maxRetries) {
        const store = useSettingsStore()
        if (store.aiProviderFallback && store.aiProviderFallback !== 'none') {
          const fallbackModule = PROVIDER_MAP[store.aiProviderFallback]
          if (fallbackModule) {
            const fallbackKey = getApiKey(store.aiProviderFallback)
            if (store.aiProviderFallback === PROVIDERS.OLLAMA || fallbackKey) {
              debugSnapshot('ai-service-fallback', {
                fromProvider: provider,
                toProvider: store.aiProviderFallback,
                feature,
                afterRetries: attempt
              })
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
  }

  throw lastError
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
