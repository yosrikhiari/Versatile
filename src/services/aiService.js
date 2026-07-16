import { PROVIDERS, FEATURES, PROVIDER_MODELS } from '../config/ai'
import { getApiKeyStorageKey } from '../config/storageKeys'
import { useSettingsStore } from '../stores/settingsStore'
import { decrypt } from './ollamaService'
import { sanitizeJson } from './ai/aiHelpers'
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

/**
 * In-flight request budget, per provider.
 *
 * A local Ollama runs one model on one machine: two concurrent generations do
 * not finish twice as fast, they contend for the same weights and KV cache — and
 * with OLLAMA_NUM_PARALLEL > 1 Ollama MULTIPLIES its context allocation, so
 * concurrency costs RAM as well as speed. Cloud providers are the opposite:
 * latency-bound, so parallelism is the entire point.
 */
const PROVIDER_CONCURRENCY = {
  [PROVIDERS.OLLAMA]: 1,
  default: 4
}

/**
 * A counting semaphore.
 *
 * This exists because the codebase had FIVE places deciding how many calls the
 * backend could take (useStoryDirector:190, spine.js:14, useStoryCritic:290,
 * generation/utils.js:48, AgentMemory.js:87), three of which did not know
 * whether the provider was local — and, more importantly, because a limit at the
 * task layer CANNOT bound the transport layer. `parallelWithLimit(tasks, 1)` on
 * Ollama still issued two concurrent generations, because each task then fanned
 * out with `Promise.all` internally (useVolumeStoryGenerator.js:862). A limit
 * placed above a fan-out cannot bound what happens below it.
 *
 * Here — below every fan-out, at the one point all requests funnel through — is
 * the only place that can. The task-level limits above are left in place as
 * scheduling hints; they are now harmless, because this is what actually holds.
 */
function createSemaphore(limit) {
  let active = 0
  const waiting = []

  const pump = () => {
    if (active >= limit || waiting.length === 0) return
    active++
    waiting.shift()()
  }

  return async function withSlot(fn) {
    await new Promise((resolve) => {
      waiting.push(resolve)
      pump()
    })
    try {
      return await fn()
    } finally {
      active--
      pump()
    }
  }
}

const semaphores = new Map()

function slotFor(provider) {
  if (!semaphores.has(provider)) {
    const limit = PROVIDER_CONCURRENCY[provider] ?? PROVIDER_CONCURRENCY.default
    semaphores.set(provider, createSemaphore(limit))
  }
  return semaphores.get(provider)
}

/** Test seam: drop all semaphores so limits can be re-read between cases. */
export function __resetSemaphores() {
  semaphores.clear()
}

export { createSemaphore, PROVIDER_CONCURRENCY }

async function getApiKey(provider) {
  if (provider === PROVIDERS.OLLAMA) return null
  const storageKey = getApiKeyStorageKey(provider)
  // STORAGE_KEYS ref
  const encrypted = localStorage.getItem(storageKey)
  if (!encrypted) return ''
  try {
    // Keys are persisted AES-GCM-encrypted by the settings store; decrypt()
    // handles both that and legacy base64-obfuscated keys. (A prior version
    // used the base64-only deobfuscate() here, which silently corrupted every
    // AES-GCM key and broke cloud-provider auth.)
    return await decrypt(encrypted)
  } catch {
    return ''
  }
}

function defaultModelForProvider(provider) {
  if (provider === PROVIDERS.OLLAMA) {
    return useSettingsStore().ollamaModel
  }
  return PROVIDER_MODELS[provider]?.[0] || null
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
    // The slot is taken INSIDE withRetry, per attempt — not around the whole
    // loop. Otherwise a request would hold the only Ollama slot while sleeping
    // through its exponential backoff, stalling every other caller for seconds.
    return await withRetry(
      () =>
        slotFor(provider)(() =>
          providerModule.generate(prompt, systemPrompt, model, providerOptions)
        ),
      isRetryable,
      { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
    )
  } catch (error) {
    const store = useSettingsStore()
    if (store.aiProviderFallback && store.aiProviderFallback !== 'none') {
      const fallbackModule = PROVIDER_MAP[store.aiProviderFallback]
      if (fallbackModule) {
        const fallbackKey = await getApiKey(store.aiProviderFallback)
        if (store.aiProviderFallback === PROVIDERS.OLLAMA || fallbackKey) {
          // Resolve the fallback provider's default model — passing null here
          // sent `model: null` in the request body and made every fallback fail.
          const fallbackModel = defaultModelForProvider(store.aiProviderFallback)
          try {
            return await slotFor(store.aiProviderFallback)(() =>
              fallbackModule.generate(prompt, systemPrompt, fallbackModel, {
                apiKey: fallbackKey || undefined,
                signal: options.signal,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                timeout: options.timeout
              })
            )
          } catch (fallbackError) {
            // Preserve the original failure as the cause so the root error
            // isn't masked by a secondary fallback error.
            fallbackError.cause = error
            throw fallbackError
          }
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

  // A failed stream can't be safely resumed: generation is non-deterministic,
  // so a retry re-streams from token 0. Once we've forwarded any chunk to the
  // caller, replaying would duplicate/garble the visible output — so we only
  // retry (and only fall back) while nothing has been emitted yet. After the
  // first chunk, a failure propagates with the partial output already shown.
  let emittedAny = false
  const trackedOnChunk = onChunk
    ? (delta, full) => {
        emittedAny = true
        onChunk(delta, full)
      }
    : undefined
  const shouldRetry = (error) => !emittedAny && isRetryable(error)

  try {
    // A stream holds its slot for the whole response, which is deliberate: two
    // concurrent streams against one local model is exactly what we are stopping.
    return await withRetry(
      () =>
        slotFor(provider)(() =>
          providerModule.stream(prompt, systemPrompt, model, trackedOnChunk, providerOptions)
        ),
      shouldRetry,
      { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
    )
  } catch (error) {
    if (emittedAny) throw error
    const store = useSettingsStore()
    if (store.aiProviderFallback && store.aiProviderFallback !== 'none') {
      const fallbackModule = PROVIDER_MAP[store.aiProviderFallback]
      if (fallbackModule) {
        const fallbackKey = await getApiKey(store.aiProviderFallback)
        if (store.aiProviderFallback === PROVIDERS.OLLAMA || fallbackKey) {
          const fallbackModel = defaultModelForProvider(store.aiProviderFallback)
          try {
            return await slotFor(store.aiProviderFallback)(() =>
              fallbackModule.stream(prompt, systemPrompt, fallbackModel, trackedOnChunk, {
                apiKey: fallbackKey || undefined,
                signal: options.signal,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                timeout: options.timeout
              })
            )
          } catch (fallbackError) {
            fallbackError.cause = error
            throw fallbackError
          }
        }
      }
    }
    throw error
  }
}

/**
 * Structured JSON generation. Prefers the provider's native structured-output
 * path (Anthropic tool-use / OpenAI json_schema / Ollama format grammar) when a
 * JSON `schema` is supplied and the provider supports it; otherwise, or on any
 * failure, falls back to a plain generate + sanitizeJson. Always returns a
 * parsed object or throws — never leaks raw model text to the caller.
 *
 * Ported from the previously-dead aiService.ts so the single live (.js) chain
 * owns structured output; gemini/groq (no generateStructured) transparently use
 * the fallback path.
 */
export async function aiGenerateStructured(prompt, systemPrompt, options = {}) {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveFeatureConfig(feature)
  const provider = options.provider || config.provider
  const model = options.model || config.model
  const schema = options.schema

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const apiKey = await getApiKey(provider)
  const hasKey = provider === PROVIDERS.OLLAMA || !!apiKey

  // 1) Native structured output when supported and we have a key.
  if (schema && hasKey && typeof providerModule.generateStructured === 'function') {
    try {
      const result = await withRetry(
        () =>
          slotFor(provider)(() =>
            providerModule.generateStructured(prompt, systemPrompt, model, schema, {
              apiKey: apiKey || undefined,
              signal: options.signal,
              temperature: options.temperature,
              maxTokens: options.maxTokens,
              timeout: options.timeout,
              schemaName: options.schemaName
            })
          ),
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
