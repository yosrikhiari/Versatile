import { PROVIDERS, FEATURES, PROVIDER_MODELS, FEATURE_DEFAULTS, PROVIDER_DEFAULT } from '../config/ai'
import type { AiGenerateOptions, FeatureName, ProviderName, ProviderModule, FeatureOverride } from '../types/ai'
import { getApiKey, getProviderModule, PROVIDER_MAP } from './providerRegistry'
import { isRetryable, withRetry } from './retryService'

export interface FeatureConfig {
  provider: ProviderName
  model: string | null
}

export function resolveFeatureConfig(
  feature: FeatureName,
  options?: Pick<AiGenerateOptions, 'defaultProvider' | 'defaultModel' | 'featureModels'>
): FeatureConfig {
  const defaultProvider = options?.defaultProvider
  const defaultModel = options?.defaultModel
  const featureModels = options?.featureModels

  const override = featureModels?.[feature] as FeatureOverride | undefined
  const defaultModelFor = (provider: ProviderName): string | null =>
    provider === PROVIDERS.OLLAMA ? (defaultModel ?? null) : PROVIDER_MODELS[provider]?.[0] || null

  if (override?.provider && override.provider !== 'default') {
    return {
      provider: override.provider as ProviderName,
      model: override.model ?? defaultModelFor(override.provider as ProviderName)
    }
  }

  const featDef = FEATURE_DEFAULTS[feature]
  const effectiveProvider = defaultProvider ?? PROVIDER_DEFAULT
  let model = defaultModelFor(effectiveProvider)
  if (effectiveProvider === PROVIDERS.OLLAMA && featDef?.model) {
    model = featDef.model
  }

  return {
    provider: effectiveProvider,
    model
  }
}

export function getConfiguredModel(
  feature: FeatureName,
  options?: Pick<AiGenerateOptions, 'defaultProvider' | 'defaultModel' | 'featureModels'>
): string | null {
  const config = resolveFeatureConfig(feature, options)
  return config.model
}

export function getConfiguredProvider(
  feature: FeatureName,
  options?: Pick<AiGenerateOptions, 'defaultProvider' | 'defaultModel' | 'featureModels'>
): ProviderName {
  const config = resolveFeatureConfig(feature, options)
  return config.provider
}

export async function aiGenerate(
  prompt: string,
  systemPrompt: string,
  options: AiGenerateOptions = {}
): Promise<string> {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveFeatureConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model

  const providerModule = getProviderModule(provider)
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
    const fallbackProvider = options.fallbackProvider
    if (fallbackProvider && fallbackProvider !== 'none') {
      const fallbackModule = PROVIDER_MAP[fallbackProvider as ProviderName]
      if (fallbackModule) {
        const fallbackKey = getApiKey(fallbackProvider as ProviderName)
        if (fallbackProvider === PROVIDERS.OLLAMA || fallbackKey) {
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
  const config = resolveFeatureConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model

  const providerModule = getProviderModule(provider)
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
    const fallbackProvider = options.fallbackProvider
    if (fallbackProvider && fallbackProvider !== 'none') {
      const fallbackModule = PROVIDER_MAP[fallbackProvider as ProviderName]
      if (fallbackModule) {
        const fallbackKey = getApiKey(fallbackProvider as ProviderName)
        if (fallbackProvider === PROVIDERS.OLLAMA || fallbackKey) {
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
  const providerModule = getProviderModule(provider)
  if (provider === PROVIDERS.OLLAMA) {
    const ollamaMod = await import('./providers/ollama')
    return await ollamaMod.testConnection()
  }
  const openaiMod = await import('./providers/openai')
  return await openaiMod.testConnection(apiKey!)
}

export async function aiListModels(): Promise<string[]> {
  const ollamaMod = await import('./providers/ollama')
  return await ollamaMod.listModels()
}
