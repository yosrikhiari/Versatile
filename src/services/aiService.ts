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

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AiGenerateOptions {
  feature?: string
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  stop?: string | string[]
  signal?: AbortSignal
  timeout?: number
  maxRetries?: number
  retryDelay?: number
  complexity?: string
  workspaceType?: string
  schema?: Record<string, unknown>
  schemaName?: string
}

interface ProviderOptions {
  apiKey: string | undefined
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  stop?: string | string[]
  timeout?: number
}

interface LangfuseTrace {
  traceId: string
  generationId: string
}

interface GenerateResult {
  text: string
  usage: TokenUsage | null
}

interface StructuredResult {
  data: Record<string, unknown>
  usage: TokenUsage | null
}

interface ProviderModule {
  generate(prompt: string, systemPrompt: string, model: string, options: ProviderOptions): Promise<GenerateResult>
  stream(prompt: string, systemPrompt: string, model: string, onChunk?: ((delta: string, full: string) => void) | null, options?: ProviderOptions): Promise<string>
  generateStructured?(prompt: string, systemPrompt: string, model: string, schema: Record<string, unknown>, options: ProviderOptions & { schemaName?: string }): Promise<StructuredResult>
  testConnection(apiKey?: string): Promise<boolean>
  listModels?(): Promise<string[]>
}

function makeLangfuseTrace(name: string, feature: string, provider: string, model: string): LangfuseTrace | null {
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

function endLangfuseGen(trace: LangfuseTrace | null, output: string, usage: TokenUsage | null | undefined, model: string, durationMs: number): void {
  if (!trace) return
  const body: Record<string, unknown> = { output, model, metadata: { latencyMs: durationMs, status: 'success' } }
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

function failLangfuseGen(trace: LangfuseTrace | null, error: unknown, durationMs: number): void {
  if (!trace) return
  langfuseService.endGeneration(trace.generationId, {
    error: error instanceof Error ? error.message : String(error),
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

function isRetryable(error: unknown): boolean {
  const message = (error as Record<string, unknown>)?.message || ''
  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(String(message)))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: (attempt: number, hasMoreRetries: boolean) => Promise<T>, isRetryableFn: (error: unknown) => boolean, options: { maxRetries?: number; retryDelay?: number } = {}): Promise<T> {
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

const PROVIDER_MAP: Record<string, ProviderModule> = {
  [PROVIDERS.OLLAMA]: ollamaProvider as unknown as ProviderModule,
  [PROVIDERS.OPENAI]: openaiProvider as unknown as ProviderModule,
  [PROVIDERS.ANTHROPIC]: anthropicProvider as unknown as ProviderModule,
  [PROVIDERS.GEMINI]: geminiProvider as unknown as ProviderModule,
  [PROVIDERS.GROQ]: groqProvider as unknown as ProviderModule
}

const PROVIDER_CONCURRENCY: Record<string, number> = {
  [PROVIDERS.OLLAMA]: 1,
  default: 4
}

type SemaphoreFn = <T>(fn: () => Promise<T>) => Promise<T>

function createSemaphore(limit: number): SemaphoreFn {
  let active = 0
  const waiting: Array<() => void> = []

  const pump = (): void => {
    if (active >= limit || waiting.length === 0) return
    active++
    const next = waiting.shift()
    next?.()
  }

  return async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
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

const semaphores = new Map<string, SemaphoreFn>()

function slotFor(provider: string): SemaphoreFn {
  if (!semaphores.has(provider)) {
    const limit = PROVIDER_CONCURRENCY[provider] ?? PROVIDER_CONCURRENCY.default
    semaphores.set(provider, createSemaphore(limit))
  }
  return semaphores.get(provider)!
}

const IDEMPOTENCY_TTL_MS = 60_000

interface IdempotencyEntry {
  createdAt: number
  promise: Promise<string>
}

export class IdempotencyTracker {
  private _inFlight = new Map<string, IdempotencyEntry>()

  private async _hashKey(provider: string, model: string, temperature: number | undefined, feature: string, systemPrompt: string, prompt: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(
      JSON.stringify({ provider, model, temperature, feature, systemPrompt, prompt })
    )
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  async dedup(provider: string, model: string, temperature: number | undefined, feature: string, systemPrompt: string, prompt: string, factory: () => Promise<string>): Promise<string> {
    const key = await this._hashKey(provider, model, temperature, feature, systemPrompt, prompt)

    const existing = this._inFlight.get(key)
    if (existing) {
      console.debug(`[aiService] idempotency hit for ${feature} on ${provider}/${model}`)
      return existing.promise
    }

    const entry: IdempotencyEntry = { createdAt: Date.now(), promise: factory().finally(() => {
      this._inFlight.delete(key)
    }) }
    this._inFlight.set(key, entry)

    return entry.promise
  }

  _cleanup(): void {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS
    for (const [key, entry] of this._inFlight) {
      if (entry.createdAt < cutoff) this._inFlight.delete(key)
    }
  }

  get size(): number {
    return this._inFlight.size
  }
}

export const idempotencyTracker = new IdempotencyTracker()

export function __resetSemaphores(): void {
  semaphores.clear()
}

export { createSemaphore, PROVIDER_CONCURRENCY }

async function getApiKey(provider: string): Promise<string | null> {
  if (provider === PROVIDERS.OLLAMA) return null
  const storageKey = getApiKeyStorageKey(provider)
  const encrypted = localStorage.getItem(storageKey)
  if (!encrypted) return ''
  try {
    return await decrypt(encrypted)
  } catch {
    return ''
  }
}

function defaultModelForProvider(provider: string): string | null {
  if (provider === PROVIDERS.OLLAMA) {
    return useSettingsStore().ollamaModel
  }
  return PROVIDER_MODELS[provider]?.[0] || null
}

function resolveFeatureConfig(feature: string): { provider: string; model: string | null } {
  const store = useSettingsStore()
  const override = (store.featureModels as Record<string, { provider?: string; model?: string }> | undefined)?.[feature]
  const defaultModelFor = (provider: string): string | null =>
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

export function getConfiguredModel(feature: string): string | null {
  const config = resolveFeatureConfig(feature)
  return config.model
}

export function getConfiguredProvider(feature: string): string {
  const config = resolveFeatureConfig(feature)
  return config.provider
}

export function resolveOptimalConfig(feature: string, options: AiGenerateOptions = {}): { provider: string; model: string | null } {
  if (options.complexity) {
    return resolveOptimalModel(feature, {
      complexity: options.complexity,
      workspaceType: options.workspaceType
    })
  }
  return resolveFeatureConfig(feature)
}

function getFallbackChain(primary: string): string[] {
  const store = useSettingsStore()
  const chain = [primary]
  for (const fb of store.aiFallbackChain || []) {
    if (fb && fb !== 'none' && fb !== primary && !chain.includes(fb)) {
      chain.push(fb)
    }
  }
  return chain
}

interface ProviderError {
  provider: string
  error: unknown
}

async function withFallback<T>(executeOnProvider: (provider: string) => Promise<T>, primary: string): Promise<T> {
  const chain = getFallbackChain(primary)
  const errors: ProviderError[] = []

  for (const fbProvider of chain) {
    try {
      return await executeOnProvider(fbProvider)
    } catch (error) {
      errors.push({ provider: fbProvider, error })
      if (fbProvider !== chain[chain.length - 1]) {
        console.warn(`[aiService] ${fbProvider} failed, trying next:`, (error as Error)?.message)
      }
    }
  }

  const last = errors[errors.length - 1]
  if (errors.length > 1) {
    (last.error as Error).cause = errors[0].error
  }
  throw last.error
}

export async function aiGenerate(prompt: string, systemPrompt: string, options: AiGenerateOptions = {}): Promise<string> {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveOptimalConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model!

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const cacheHit = await aiResponseCache!.lookup(
    provider,
    model,
    options.temperature,
    feature,
    systemPrompt,
    prompt
  )
  if (cacheHit) return cacheHit

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

      const providerOptions: ProviderOptions = {
        apiKey: apiKey || undefined,
        signal: options.signal,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stop: options.stop,
        timeout: options.timeout
      }

      async function trackGenerate(providerName: string, modelName: string, opts: ProviderOptions): Promise<string> {
        providerBudget.check(providerName)
        const pm = providerName === provider ? providerModule : PROVIDER_MAP[providerName]!
        const trace = makeLangfuseTrace('ai-generate', feature, providerName, modelName)
        const start = performance.now()
        try {
          const result = await withRetry(
            () =>
              slotFor(providerName)(() =>
                latencyBudget.wrap(feature, () => pm.generate(prompt, systemPrompt, modelName, opts))()
              ),
            isRetryable,
            { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
          )
          const { text, usage } = result
          const durationMs = performance.now() - start
          endLangfuseGen(trace, text, usage, modelName, durationMs)
          if (usage) {
            const cost = computeCost(modelName, usage)
            // Flattened: the store's token totals read promptTokens/completionTokens
            // off the entry directly, so a nested `usage` object summed to nothing.
            useCostTrackingStore().logCost({
              model: modelName,
              provider: providerName,
              feature,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              cost
            })
            providerBudget.record(providerName, usage.promptTokens + usage.completionTokens, cost)
          }
          aiResponseCache!
            .store(providerName, modelName, opts.temperature, feature, systemPrompt, prompt, text)
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
        const fbModel = defaultModelForProvider(fbProvider)!
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

export async function aiStream(prompt: string, systemPrompt: string, onChunk?: ((delta: string, full: string) => void) | null, options: AiGenerateOptions = {}): Promise<string> {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveOptimalConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model!

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const apiKey = await getApiKey(provider)
  if (provider !== PROVIDERS.OLLAMA && !apiKey) {
    throw new Error(`${provider} API key not configured. Please add it in Settings > AI Providers.`)
  }

  const providerOptions: ProviderOptions = {
    apiKey: apiKey || undefined,
    signal: options.signal,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    stop: options.stop,
    timeout: options.timeout
  }

  let emittedAny = false
  const trackedOnChunk = onChunk
    ? (delta: string, full: string) => {
        emittedAny = true
        onChunk(delta, full)
      }
    : undefined
  const shouldRetry = (error: unknown): boolean => !emittedAny && isRetryable(error)

  const trace = makeLangfuseTrace('ai-stream', feature, provider, model)
  const start = performance.now()
  const endStreamTrace = (text: string, err?: unknown): void => {
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
      const fbModel = defaultModelForProvider(fbProvider)!
      return await slotFor(fbProvider)(() =>
        latencyBudget.wrap(feature, () =>
          PROVIDER_MAP[fbProvider]!.stream(prompt, systemPrompt, fbModel, trackedOnChunk, {
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

export async function aiGenerateStructured(prompt: string, systemPrompt: string, options: AiGenerateOptions = {}): Promise<Record<string, unknown>> {
  const feature = options.feature || FEATURES.CONTENT
  const config = resolveOptimalConfig(feature, options)
  const provider = options.provider || config.provider
  const model = options.model || config.model!
  const schema = options.schema

  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)

  const cacheHit = await aiResponseCache!.lookup(
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

  if (schema && hasKey && typeof providerModule.generateStructured === 'function') {
    const trace = makeLangfuseTrace('ai-generate-structured', feature, provider, model)
    const start = performance.now()
    try {
      providerBudget.check(provider)
      const result = await withRetry(
        () =>
          slotFor(provider)(() =>
            latencyBudget.wrap(feature, () =>
              providerModule.generateStructured!(prompt, systemPrompt, model, schema, {
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
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            cost
          })
          providerBudget.record(provider, usage.promptTokens + usage.completionTokens, cost)
        }
        const output = typeof data === 'string' ? data : JSON.stringify(data)
        aiResponseCache!
          .store(provider, model, options.temperature, feature, systemPrompt, prompt, output)
          .catch(() => {})
        return data
      }
    } catch (err) {
      failLangfuseGen(trace, err, performance.now() - start)
      console.warn('[aiGenerateStructured] native structured output failed, falling back:', err)
    }
  }

  const jsonDirective =
    '\n\nRespond with ONLY a single valid JSON object. No prose, no markdown, no code fences.'
  const text = await aiGenerate(prompt, systemPrompt + jsonDirective, options)
  const parsed = sanitizeJson(text)
  if (!parsed) {
    throw new Error('Structured generation failed: the model did not return valid JSON.')
  }
  return parsed
}

export async function aiTestConnection(provider: string, apiKey: string): Promise<boolean> {
  const providerModule = PROVIDER_MAP[provider]
  if (!providerModule) throw new Error(`Unknown provider: ${provider}`)
  if (provider === PROVIDERS.OLLAMA) {
    return await providerModule.testConnection()
  }
  return await providerModule.testConnection(apiKey)
}

export async function aiListModels(): Promise<string[]> {
  return await ollamaProvider.listModels()
}

export { ollamaProvider, isRetryable }
