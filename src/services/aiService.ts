import { PROVIDERS, FEATURES, PROVIDER_MODELS, FEATURE_DEFAULTS, PROVIDER_DEFAULT } from '../config/ai'
import type { AiGenerateOptions, FeatureName, ProviderName, ProviderModule, FeatureOverride, ProviderOptions } from '../types/ai'
import { getApiKey, getProviderModule, PROVIDER_MAP } from './providerRegistry'
import { isRetryable, withRetry } from './retryService'
import { sanitizeJson } from './ai/aiHelpers'

async function tryFallbackProvider<T>(
  error: unknown,
  options: AiGenerateOptions,
  fn: (module: ProviderModule, apiKey: string | undefined) => Promise<T>
): Promise<T> {
  const fallbackProvider = options.fallbackProvider
  if (fallbackProvider && fallbackProvider !== 'none') {
    const fallbackModule = PROVIDER_MAP[fallbackProvider as ProviderName]
    if (fallbackModule) {
      const fallbackKey = await getApiKey(fallbackProvider as ProviderName)
      if (fallbackProvider === PROVIDERS.OLLAMA || fallbackKey) {
        return await withRetry(
          () => fn(fallbackModule, fallbackKey || undefined),
          isRetryable,
          { maxRetries: 1 }
        )
      }
    }
  }
  throw error
}

function pickProviderOptions(options: AiGenerateOptions): ProviderOptions {
  return {
    apiKey: undefined,
    signal: options.signal,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    stop: options.stop,
    timeout: options.timeout
  }
}

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
  const apiKey = await getApiKey(provider)
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
    return await tryFallbackProvider(error, options, (mod, key) =>
      mod.generate(prompt, systemPrompt, null, { ...pickProviderOptions(options), apiKey: key })
    )
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
  const apiKey = await getApiKey(provider)
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
    return await tryFallbackProvider(error, options, (mod, key) =>
      mod.stream(prompt, systemPrompt, null, onChunk, { ...pickProviderOptions(options), apiKey: key })
    )
  }
}

/**
 * Structured JSON generation. Prefers the provider's native structured-output
 * path (Anthropic tool-use / OpenAI json_schema / Ollama format) when a schema
 * is supplied and supported; otherwise (or on failure) falls back to a plain
 * generate call plus sanitizeJson. Always returns a parsed object or throws.
 */
export async function aiGenerateStructured(
  prompt: string,
  systemPrompt: string,
  options: AiGenerateOptions = {}
): Promise<Record<string, unknown>> {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveFeatureConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model
  const schema = options.schema

  const providerModule = getProviderModule(provider)
  const apiKey = await getApiKey(provider)
  const hasKey = provider === PROVIDERS.OLLAMA || !!apiKey

  // 1) Native structured output, when the provider supports it and we have a key.
  if (schema && hasKey && typeof providerModule.generateStructured === 'function') {
    try {
      const result = await withRetry(
        () =>
          providerModule.generateStructured!(prompt, systemPrompt, model, schema, {
            apiKey: apiKey || undefined,
            signal: options.signal,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            timeout: options.timeout,
            schemaName: options.schemaName
          }),
        isRetryable,
        { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
      )
      if (result && typeof result === 'object') return result
    } catch (err) {
      // Native path failed (unsupported model, strict-schema rejection, …) —
      // fall through to the text + sanitizeJson path below.
      console.warn('[aiGenerateStructured] native structured output failed, falling back:', err)
    }
  }

  // 2) Fallback: plain generation (keeps aiGenerate's retry + provider fallback)
  //    with an explicit JSON directive, then sanitizeJson.
  const jsonDirective =
    '\n\nRespond with ONLY a single valid JSON object. No prose, no markdown, no code fences.'
  const text = await aiGenerate(prompt, systemPrompt + jsonDirective, options)
  const parsed = sanitizeJson(text)
  if (!parsed) {
    throw new Error('Structured generation failed: the model did not return valid JSON.')
  }
  return parsed
}

export async function aiTestConnection(
  provider: ProviderName,
  apiKey?: string
): Promise<boolean> {
  if (provider === PROVIDERS.OLLAMA) {
    const ollamaMod = await import('./providers/ollama')
    return await ollamaMod.testConnection()
  }
  if (!apiKey) return false
  const providerModule = getProviderModule(provider)
  return await providerModule.testConnection(apiKey)
}

export async function aiListModels(): Promise<string[]> {
  const ollamaMod = await import('./providers/ollama')
  return await ollamaMod.listModels()
}
