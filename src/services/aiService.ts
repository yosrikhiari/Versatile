import { PROVIDERS, FEATURES, PROVIDER_MODELS, FEATURE_DEFAULTS } from '../config/ai'
import { getApiKeyStorageKey } from '../config/storageKeys'
import { useSettingsStore } from '../stores/settingsStore'
import { deobfuscate } from './ollamaService'
import type { AiGenerateOptions, FeatureName, ProviderName, ProviderModule } from '../types/ai'
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

function isRetryable(error: unknown): boolean {
  const message = (error as Error)?.message || ''
  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(message))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
}

async function withRetry<T>(
  fn: (attempt: number, isIntermediate: boolean) => Promise<T>,
  isRetryableFn: (error: unknown) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  const retryDelay = options.retryDelay ?? 1000
  let lastError: unknown

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
  [PROVIDERS.OLLAMA]: ollamaProvider as unknown as ProviderModule,
  [PROVIDERS.OPENAI]: openaiProvider as ProviderModule,
  [PROVIDERS.ANTHROPIC]: anthropicProvider as ProviderModule,
  [PROVIDERS.GEMINI]: geminiProvider as ProviderModule,
  [PROVIDERS.GROQ]: groqProvider as ProviderModule
} as unknown as Record<ProviderName, ProviderModule>

function getApiKey(provider: ProviderName): string | null {
  if (provider === PROVIDERS.OLLAMA) return null
  const storageKey = getApiKeyStorageKey(provider)
  const encrypted = localStorage.getItem(storageKey)
  if (!encrypted) return ''
  try {
    return deobfuscate(encrypted)
  } catch {
    return ''
  }
}

interface FeatureOverride {
  provider?: string
  model?: string | null
}

export interface FeatureConfig {
  provider: ProviderName
  model: string | null
}

function resolveFeatureConfig(feature: FeatureName): FeatureConfig {
  const store = useSettingsStore()
  const override = store.featureModels?.[feature] as FeatureOverride | undefined
  const defaultModelFor = (provider: ProviderName): string | null =>
    provider === PROVIDERS.OLLAMA ? store.ollamaModel : PROVIDER_MODELS[provider]?.[0] || null

  if (override?.provider && override.provider !== 'default') {
    return {
      provider: override.provider as ProviderName,
      model: override.model ?? defaultModelFor(override.provider as ProviderName)
    }
  }

  const featDef = FEATURE_DEFAULTS[feature]
  let model = defaultModelFor(store.aiProvider as ProviderName)
  if (store.aiProvider === PROVIDERS.OLLAMA && featDef?.model) {
    model = featDef.model
  }

  return {
    provider: store.aiProvider as ProviderName,
    model
  }
}

export function getConfiguredModel(feature: FeatureName): string | null {
  const config = resolveFeatureConfig(feature)
  return config.model
}

export function getConfiguredProvider(feature: FeatureName): ProviderName {
  const config = resolveFeatureConfig(feature)
  return config.provider
}

export async function aiGenerate(
  prompt: string,
  systemPrompt: string,
  options: AiGenerateOptions = {}
): Promise<string> {
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
      const fallbackModule = PROVIDER_MAP[store.aiProviderFallback as ProviderName]
      if (fallbackModule) {
        const fallbackKey = getApiKey(store.aiProviderFallback as ProviderName)
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

export async function aiStream(
  prompt: string,
  systemPrompt: string,
  onChunk: ((chunk: string, full: string) => void) | undefined,
  options: AiGenerateOptions = {}
): Promise<string> {
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
      const fallbackModule = PROVIDER_MAP[store.aiProviderFallback as ProviderName]
      if (fallbackModule) {
        const fallbackKey = getApiKey(store.aiProviderFallback as ProviderName)
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

export async function aiTestConnection(
  provider: ProviderName,
  apiKey?: string
): Promise<boolean> {
  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)
  if (provider === PROVIDERS.OLLAMA) {
    return await (providerModule as typeof ollamaProvider).testConnection()
  }
  return await (providerModule as typeof openaiProvider).testConnection(apiKey!)
}

export async function aiListModels(): Promise<string[]> {
  return await ollamaProvider.listModels()
}

export { ollamaProvider }
