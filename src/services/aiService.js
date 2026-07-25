import { PROVIDERS, FEATURES, PROVIDER_MODELS } from '../config/ai'
import { resolveOptimalModel, getModelMetadata } from '../config/modelRouting'
import { getApiKeyStorageKey } from '../config/storageKeys'
import { useSettingsStore } from '../stores/settingsStore'
import { decrypt } from './ollamaService'
import { sanitizeJson } from './ai/aiHelpers'
import * as ollamaProvider from './providers/ollama'
import * as openaiProvider from './providers/openai'
import * as anthropicProvider from './providers/anthropic'
import * as geminiProvider from './providers/gemini'
import * as groqProvider from './providers/groq'
import { useCostTrackingStore } from '../stores/costTrackingStore'
import { computeCost } from '../config/modelPricing'
import { providerBudget } from './aiProviderBudget'
import { latencyBudget } from './latencyBudget'
import { langfuseService } from './langfuseService'
import * as aiResponseCache from './aiResponseCache'
import { trackError } from '../composables/useErrorTracker'

function makeLangfuseTrace(name, feature, provider, model) {
  if (!langfuseService.isConfigured) return null
  const traceId = crypto.randomUUID()
  const generationId = crypto.randomUUID()
  langfuseService.createTrace(traceId, {
    name,
    metadata: { feature, provider, model, timestamp: Date.now() }
  })
  langfuseService.createGeneration(traceId, generationId, {
    name: `gen:${feature}`,
    model,
    provider,
    input: name
  })
  return { traceId, generationId }
}

function endLangfuseGen(trace, output, usage, model, durationMs) {
  if (!trace) return
  const body = { output, model, metadata: { latencyMs: durationMs, status: 'success' } }
  if (usage) {
    body.usage = {
      input: usage.promptTokens,
      output: usage.completionTokens,
      total: usage.totalTokens,
      unit: 'TOKENS'
    }
  }
  langfuseService.endGeneration(trace.generationId, body)
}

function failLangfuseGen(trace, error, durationMs) {
  if (!trace) return
  langfuseService.endGeneration(trace.generationId, {
    error: error?.message || String(error),
    metadata: { latencyMs: durationMs, status: 'error' }
  })
}

const RETRYABLE_ERROR_PATTERNS = [
  /(?:timeout|timed\s*out)/i,
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

/**
 * Idempotency tracker — deduplicates in-flight requests so identical calls
 * that arrive before the first one completes share a single provider round-trip.
 *
 * Uses an LRU-ish Map keyed by SHA-256 hash of (provider, model, temperature,
 * feature, systemPrompt, prompt). Entries are removed on settle (resolve or
 * reject) so the Map stays small.
 */
const IDEMPOTENCY_TTL_MS = 60_000

class IdempotencyTracker {
  constructor() {
    this._inFlight = new Map()
  }

  _hashKey(provider, model, temperature, feature, systemPrompt, prompt) {
    const encoder = new TextEncoder()
    const data = encoder.encode(
      JSON.stringify({ provider, model, temperature, feature, systemPrompt, prompt })
    )
    return crypto.subtle.digest('SHA-256', data).then((hashBuffer) => {
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    })
  }

  async dedup(provider, model, temperature, feature, systemPrompt, prompt, factory) {
    const key = await this._hashKey(provider, model, temperature, feature, systemPrompt, prompt)

    const existing = this._inFlight.get(key)
    if (existing) {
      console.debug(`[aiService] idempotency hit for ${feature} on ${provider}/${model}`)
      return existing.promise
    }

    const entry = { createdAt: Date.now() }
    entry.promise = factory().finally(() => {
      this._inFlight.delete(key)
    })
    this._inFlight.set(key, entry)

    return entry.promise
  }

  _cleanup() {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS
    for (const [key, entry] of this._inFlight) {
      if (entry.createdAt < cutoff) this._inFlight.delete(key)
    }
  }

  get size() {
    return this._inFlight.size
  }
}

export { IdempotencyTracker }
export const idempotencyTracker = new IdempotencyTracker()

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

export function resolveOptimalConfig(feature, options = {}) {
  if (options.complexity) {
    return resolveOptimalModel(feature, {
      complexity: options.complexity,
      workspaceType: options.workspaceType
    })
  }
  return resolveFeatureConfig(feature)
}

/**
 * Resolve the fallback chain: [primary, ...fallbacks] with duplicates removed
 * and `none` / empty entries filtered out.
 */
function getFallbackChain(primary) {
  const store = useSettingsStore()
  const chain = [primary]
  for (const fb of store.aiFallbackChain || []) {
    if (fb && fb !== 'none' && fb !== primary && !chain.includes(fb)) {
      chain.push(fb)
    }
  }
  return chain
}

/**
 * Try a method against each provider in the fallback chain, in order.
 * Each call to executeOnProvider receives the current provider string.
 * Stops on first success; re-throws the last error if all fail.
 */
async function withFallback(executeOnProvider, primary) {
  const chain = getFallbackChain(primary)
  const errors = []

  for (const fbProvider of chain) {
    try {
      return await executeOnProvider(fbProvider)
    } catch (error) {
      errors.push({ provider: fbProvider, error })
      if (fbProvider !== chain[chain.length - 1]) {
        console.warn(`[aiService] ${fbProvider} failed, trying next:`, error?.message)
      }
    }
  }

  const last = errors[errors.length - 1]
  if (errors.length > 1) {
    last.error.cause = errors[0].error
  }
  throw last.error
}

export async function aiGenerate(prompt, systemPrompt, options = {}) {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveOptimalConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const cacheHit = await aiResponseCache.lookup(
    provider,
    model,
    options.temperature,
    feature,
    systemPrompt,
    prompt
  )
  if (cacheHit) return cacheHit

  // Idempotency — dedup identical in-flight requests after the cache miss
  return await idempotencyTracker.dedup(
    provider,
    model,
    options.temperature,
    feature,
    systemPrompt,
    prompt,
    async () => {
      const apiKey = await getApiKey(provider)
      if (provider !== PROVIDERS.OLLAMA && !apiKey) {
        throw new Error(
          `${provider} API key not configured. Please add it in Settings > AI Providers.`
        )
      }

      const providerOptions = {
        apiKey: apiKey || undefined,
        signal: options.signal,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stop: options.stop,
        timeout: options.timeout
      }

      async function trackGenerate(providerName, model, opts) {
        providerBudget.check(providerName)
        const pm = providerName === provider ? providerModule : PROVIDER_MAP[providerName]
        const trace = makeLangfuseTrace('ai-generate', feature, providerName, model)
        const start = performance.now()
        try {
          const result = await withRetry(
            () =>
              slotFor(providerName)(() =>
                latencyBudget.wrap(feature, () => pm.generate(prompt, systemPrompt, model, opts))()
              ),
            isRetryable,
            { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
          )
          const { text, usage } = result
          const durationMs = performance.now() - start
          endLangfuseGen(trace, text, usage, model, durationMs)
          if (usage) {
            const cost = computeCost(model, usage)
            useCostTrackingStore().logCost({
              model,
              provider: providerName,
              feature,
              usage,
              cost
            })
            providerBudget.record(providerName, usage.promptTokens + usage.completionTokens, cost)
          }
          aiResponseCache
            .store(providerName, model, opts.temperature, feature, systemPrompt, prompt, text)
            .catch(() => {})
          return text
        } catch (error) {
          failLangfuseGen(trace, error, performance.now() - start)
          throw error
        }
      }

      return await withFallback(async (fbProvider) => {
        if (fbProvider === provider) {
          return await trackGenerate(provider, model, providerOptions)
        }
        const fbKey = await getApiKey(fbProvider)
        if (fbProvider !== PROVIDERS.OLLAMA && !fbKey) {
          throw new Error(`${fbProvider} API key not configured`)
        }
        const fbModel = defaultModelForProvider(fbProvider)
        return await trackGenerate(fbProvider, fbModel, {
          apiKey: fbKey || undefined,
          signal: options.signal,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeout: options.timeout
        })
      }, provider)
    }
  )
}

export async function aiStream(prompt, systemPrompt, onChunk, options = {}) {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveOptimalConfig(feature, options)
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

  const trace = makeLangfuseTrace('ai-stream', feature, provider, model)
  const start = performance.now()
  const endStreamTrace = (text, err) => {
    if (!trace) return
    if (err) {
      failLangfuseGen(trace, err, performance.now() - start)
    } else {
      endLangfuseGen(trace, text, null, model, performance.now() - start)
    }
  }

  try {
    providerBudget.check(provider)
    const text = await withRetry(
      () =>
        slotFor(provider)(() =>
          latencyBudget.wrap(feature, () =>
            providerModule.stream(prompt, systemPrompt, model, trackedOnChunk, providerOptions)
          )()
        ),
      shouldRetry,
      { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
    )
    endStreamTrace(text)
    return text
  } catch (error) {
    if (emittedAny) throw error
    // Primary provider failed before emitting anything — record it, then try fallback.
    trackError(error, {
      source: 'ai',
      severity: 'warning',
      context: { provider, feature, phase: 'primary-stream' }
    })
    const fbResult = await withFallback(async (fbProvider) => {
      if (fbProvider === provider) throw error
      providerBudget.check(fbProvider)
      const fbKey = await getApiKey(fbProvider)
      if (fbProvider !== PROVIDERS.OLLAMA && !fbKey) {
        throw new Error(`${fbProvider} API key not configured`)
      }
      const fbModel = defaultModelForProvider(fbProvider)
      return await slotFor(fbProvider)(() =>
        latencyBudget.wrap(feature, () =>
          PROVIDER_MAP[fbProvider].stream(prompt, systemPrompt, fbModel, trackedOnChunk, {
            apiKey: fbKey || undefined,
            signal: options.signal,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            timeout: options.timeout
          })
        )()
      )
    }, provider)
    endStreamTrace(fbResult)
    return fbResult
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
  const config = resolveOptimalConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model
  const schema = options.schema

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const cacheHit = await aiResponseCache.lookup(
    provider,
    model,
    options.temperature,
    feature,
    systemPrompt,
    prompt
  )
  if (cacheHit) return cacheHit

  const apiKey = await getApiKey(provider)
  const hasKey = provider === PROVIDERS.OLLAMA || !!apiKey

  // 1) Native structured output when supported and we have a key.
  if (schema && hasKey && typeof providerModule.generateStructured === 'function') {
    const trace = makeLangfuseTrace('ai-generate-structured', feature, provider, model)
    const start = performance.now()
    try {
      providerBudget.check(provider)
      const result = await withRetry(
        () =>
          slotFor(provider)(() =>
            latencyBudget.wrap(feature, () =>
              providerModule.generateStructured(prompt, systemPrompt, model, schema, {
                apiKey: apiKey || undefined,
                signal: options.signal,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                timeout: options.timeout,
                schemaName: options.schemaName
              })
            )()
          ),
        isRetryable,
        { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
      )
      if (result && typeof result === 'object') {
        const { data, usage } = result
        const durationMs = performance.now() - start
        endLangfuseGen(trace, JSON.stringify(data), usage, model, durationMs)
        if (usage) {
          const cost = computeCost(model, usage)
          useCostTrackingStore().logCost({
            model,
            provider,
            feature,
            usage,
            cost
          })
          providerBudget.record(provider, usage.promptTokens + usage.completionTokens, cost)
        }
        const output = typeof data === 'string' ? data : JSON.stringify(data)
        aiResponseCache
          .store(provider, model, options.temperature, feature, systemPrompt, prompt, output)
          .catch(() => {})
        return data
      }
    } catch (err) {
      failLangfuseGen(trace, err, performance.now() - start)
      // Native path failed — fall through to the text + sanitizeJson path below.
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

export { ollamaProvider, isRetryable }
