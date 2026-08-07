import { PROVIDERS, FEATURES, PROVIDER_MODELS } from '../config/ai'
import { resolveOptimalModel, getModelMetadata, isProviderUsable } from '../config/modelRouting'
import { getApiKeyStorageKey } from '../config/storageKeys'
import { getOllamaUtilityModel } from '../config/ollama'
import { useSettingsStore } from '../stores/settingsStore'
import { decrypt } from './ollamaService'
import { sanitizeJson, repairTruncatedJson } from './ai/aiHelpers'
import { estimateTokens } from './ai/contextBudget'
import { preloadTokenizer } from './ai/tokenizer'
import {
  resolveMaxTokens,
  checkInputBudget,
  estimateSchemaOverhead,
  getContextWindow
} from './ai/modelBudget'
import { TokenLimitError, InputBudgetExceededError } from './ai/tokenLimitError'
import { MIN_OUTPUT_TOKENS, FALLBACK_CONTEXT_WINDOW } from '../config/generationLimits'
import { recordObservedUsage, recordFeatureTokens, isFeatureAnomaly } from './ai/tokenCalibration'
import * as ollamaProvider from './providers/ollama'
import * as openaiProvider from './providers/openai'
import * as anthropicProvider from './providers/anthropic'
import * as geminiProvider from './providers/gemini'
import * as groqProvider from './providers/groq'
import { useCostTrackingStore } from '../stores/costTrackingStore'
import { computeCost } from '../config/modelPricing'
import { providerBudget, SessionBudget, SessionBudgetExceededError } from './aiProviderBudget'
import { latencyBudget } from './latencyBudget'
import {
  createSemaphore,
  foregroundSlot,
  resetSemaphores,
  PROVIDER_CONCURRENCY
} from './providerGate'
import { langfuseService } from './langfuseService'
import * as aiResponseCache from './aiResponseCache'
import { trackError } from '../composables/useErrorTracker'
import {
  guardPrompt,
  guardStructuredOutput,
  recordProviderFailure
} from '../guardrails/integration/aiGuardrails'

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AiGenerateOptions {
  /** AI feature tag (FEATURES.*). */
  feature?: string
  /** Pipeline phase for cost attribution. */
  phase?: string
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  stop?: string | string[]
  signal?: AbortSignal
  /**
   * Absolute ceiling for the call. A backstop against a runaway generation, not
   * the primary guard — bounding total time cannot tell a slow-but-healthy local
   * model apart from a wedged one, and treating the two alike is what killed
   * long runs mid-chapter. Prefer `idleTimeout` to detect a real hang.
   */
  timeout?: number
  /**
   * Per-call sampling overrides. Omitted means the global Ollama defaults apply.
   *
   * These exist because a call's shape determines what sampling suits it. The
   * chapter-skeleton call emits ~2,300 tokens of short, deliberately-distinct
   * titles, and the default `repeat_last_n` of 512 covers under three chapters
   * of that — so chapter 1's title exerted no repetition pressure on chapter 10's.
   */
  repeatPenalty?: number
  repeatLastN?: number
  topP?: number
  minP?: number
  /** Max ms of no progress (no new tokens) before the call is considered stalled. */
  idleTimeout?: number
  /** Max ms to wait for the first token; covers prompt evaluation, where silence is expected. */
  firstTokenTimeout?: number
  /**
   * Progress hook for structured calls, which return one parsed object but are
   * streamed underneath. A caller under a stage watchdog needs evidence the call
   * is alive before the result exists; without it a multi-minute schema-bound
   * call is indistinguishable from a hang. Ignored by providers that do not
   * stream structured output.
   */
  onToken?: (chunk: string, full: string) => void
  maxRetries?: number
  retryDelay?: number
  complexity?: string
  workspaceType?: string
  /**
   * `utility` marks short, extractive, schema-bound work (planning JSON, scene
   * metadata, relationship and spine passes) as opposed to prose. On a local
   * provider these are routed to the configured utility model, which is where
   * most of a run's non-prose latency goes.
   */
  role?: 'utility' | 'prose'
  schema?: Record<string, unknown>
  schemaName?: string
  /**
   * `null` is admitted alongside `undefined` because the composables that thread
   * this through (writer, director, critic) hold `SessionBudget | null` — `null`
   * is their explicit "no budget attached" sentinel, not an accident. Every
   * consumer below guards with a truthiness check, so the two are already
   * equivalent at runtime; only the declared type disagreed.
   */
  sessionBudget?: SessionBudget | null
}

interface ProviderOptions {
  apiKey: string | undefined
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  stop?: string | string[]
  timeout?: number
  idleTimeout?: number
  firstTokenTimeout?: number
  onToken?: (chunk: string, full: string) => void
  // Sampling. The Ollama provider already accepts these per call, but they were
  // never forwarded from here — so every structured call silently took the
  // global defaults and a caller could not tune sampling for its own shape of
  // output. That is how a 12-chapter batch ran with repeat_last_n=512, a window
  // covering under three chapters of its own output.
  repeatPenalty?: number
  repeatLastN?: number
  topP?: number
  minP?: number
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
  if (error instanceof TokenLimitError) return error.retryable !== false
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

// The semaphore itself moved to `providerGate` so the embedding path can take
// slots from the same pool — while it lived here it only ever covered
// generation traffic, and `/api/embed` sailed straight past it. Re-exported
// unchanged because this module's public surface is what callers and tests
// already import.
export { createSemaphore, PROVIDER_CONCURRENCY, resetSemaphores as __resetSemaphores }

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

  // Honoured here too, not only in `resolveOptimalConfig`: this function is
  // exported and read directly by callers deciding concurrency and provider
  // behaviour (spine.ts's `isOllamaProvider`, for one). If it reported a hosted
  // provider while calls actually went local, those decisions would be made on
  // a picture of the run that is not true.
  if (store.localOnly) {
    return {
      provider: PROVIDERS.OLLAMA,
      model:
        (override?.provider === PROVIDERS.OLLAMA && override.model) ||
        defaultModelFor(PROVIDERS.OLLAMA)
    }
  }

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
  const base = options.complexity
    ? resolveOptimalModel(feature, {
        complexity: options.complexity,
        workspaceType: options.workspaceType
      })
    : resolveFeatureConfig(feature)

  // Local-only mode is absolute: no matrix entry, workspace override or feature
  // default may send work off this machine. Checked before anything else so
  // there is exactly one place a call could escape, and it is this one.
  if (useSettingsStore().localOnly) {
    // `localModelFor` owns the whole model decision, `base` included. Preferring
    // `base.model` when it happened to be local looked like a harmless shortcut
    // and quietly disabled utility-model routing, since the base config always
    // carries the main model.
    return { provider: PROVIDERS.OLLAMA, model: localModelFor(feature, options) }
  }

  // The routing matrix says which model is BEST for a job; it cannot know which
  // providers this user can actually reach. For a local-only user the STANDARD
  // entry for STORY_GENERATION is Anthropic, so every scene of a novel failed
  // with "anthropic API key not configured" — and because the writer passes a
  // complexity on every call, that matrix path is the one every scene took.
  //
  // The filter belongs here, at the boundary where a provider is chosen for a
  // real call, rather than inside `resolveOptimalModel`, which stays a pure
  // statement of preference that can be reasoned about on its own.
  const resolved = isProviderUsable(base.provider) ? base : fallbackToUsableProvider(base)

  // Utility work only gets redirected on a local provider: a hosted provider's
  // small model is a different trade-off the user has already expressed through
  // their own settings, and second-guessing it here would be overreach.
  if (options.role === 'utility' && resolved.provider === PROVIDERS.OLLAMA) {
    const utility = getOllamaUtilityModel()
    if (utility) return { provider: resolved.provider, model: utility }
  }
  return resolved
}

/**
 * Which local model runs a given call in local-only mode.
 *
 * An explicit per-feature Ollama choice wins; then the utility model for cheap
 * structured work; then the user's main model. This keeps the *model* routing
 * the user configured meaningful even though the *provider* is now fixed.
 */
function localModelFor(feature: string, options: AiGenerateOptions): string | null {
  const store = useSettingsStore()
  const override = store.featureModels?.[feature]
  if (override?.provider === PROVIDERS.OLLAMA && override.model) return override.model
  if (options.role === 'utility') {
    const utility = getOllamaUtilityModel()
    if (utility) return utility
  }
  return store.ollamaModel || null
}

/**
 * Swap an unreachable provider for one the user has actually set up.
 *
 * Prefers their configured provider, then anything else with a key, then Ollama
 * — which needs no credential and is the reason a local-first user has a working
 * app at all. Warns once per call so the substitution is visible rather than
 * silently changing which model wrote the book.
 */
function fallbackToUsableProvider(base: { provider: string; model: string | null }): { provider: string; model: string | null } {
  // A provider name we do not recognise is a typo or a broken setting, not a
  // missing credential. Substituting for it would hide the mistake; let it
  // reach the "Unknown provider" error where the user can see what they wrote.
  if (!PROVIDER_MAP[base.provider]) return base

  const store = useSettingsStore()
  const candidates = [store.aiProvider, ...Object.keys(PROVIDER_MAP), PROVIDERS.OLLAMA]
  const usable = candidates.find((p) => p && PROVIDER_MAP[p] && isProviderUsable(p))
  if (!usable || usable === base.provider) return base

  console.warn(
    `[aiService] ${base.provider} has no API key configured; using ${usable} instead. ` +
      `Set a key or choose a provider in Settings > AI Providers to control this.`
  )
  return { provider: usable, model: defaultModelForProvider(usable) }
}

function getFallbackChain(primary: string): string[] {
  const store = useSettingsStore()
  // In local-only mode the chain is the local provider and nothing else. A
  // fallback is the one path that would quietly send a failed local call to a
  // hosted model, which is exactly what local-only exists to prevent.
  if (store.localOnly) return [PROVIDERS.OLLAMA]

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

interface CallBudget {
  inputTokens: number
  maxTokens: number
}

/**
 * Loads the exact tokenizer for `model` (once per encoding, then cached),
 * measures the prompt, and derives max_tokens from the model's context window.
 *
 * Every provider used to send a flat `max_tokens: 4096` regardless of model or
 * prompt size. On an 8K-window model a large prompt plus 4096 requested output
 * overruns the window and the provider returns a hard 400; on a 200K-window
 * model that same 4096 leaves most of the window unused.
 */
async function prepareCallBudget(
  model: string,
  systemPrompt: string,
  prompt: string,
  explicitMaxTokens?: number,
  feature?: string,
  schemaOverhead?: number
): Promise<CallBudget> {
  await preloadTokenizer(model)
  const inputTokens = estimateTokens(systemPrompt) + estimateTokens(prompt)

  checkPromptSanityCap(model, inputTokens)
  checkInputBudget(model, inputTokens)

  if (feature) {
    const anomaly = isFeatureAnomaly(feature, inputTokens)
    if (anomaly?.isAnomaly) {
      console.warn(
        `[aiService] ${feature}: input is ${inputTokens} tokens, ` +
        `anomalous (baseline ${anomaly.baseline.toFixed(0)} ± ${(anomaly.stddev * 3).toFixed(0)}, ` +
        `${anomaly.samples} samples)`
      )
    }
    recordFeatureTokens(feature, inputTokens)
  }

  return { inputTokens, maxTokens: resolveMaxTokens(model, inputTokens, explicitMaxTokens, schemaOverhead) }
}

/**
 * Hard upper bound: reject prompts that exceed 2× the model's max context
 * window. This is a safety net — no prompt should ever approach this under
 * normal operation, so a hit indicates a bug or adversarial input.
 */
function checkPromptSanityCap(model: string, inputTokens: number): void {
  // `getModelMetadata` takes (provider, model); calling it with just the model
  // passed the model as the provider and left `model` undefined, so it always
  // returned null and every model silently got the fallback window — the sanity
  // cap was never actually the model's own 2x window. `getContextWindow` is the
  // model-only lookup the rest of the budget math already uses.
  const contextWindow = getContextWindow(model) ?? FALLBACK_CONTEXT_WINDOW
  const sanityCap = contextWindow * 2
  if (inputTokens > sanityCap) {
    throw new InputBudgetExceededError(
      `[aiService] ${model}: input is ${inputTokens} tokens, exceeds sanity cap of ${sanityCap} (2× context window)`,
      model,
      inputTokens,
      sanityCap
    )
  }
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

  // Input guardrails and the circuit breaker gate every provider call. Under
  // the default `detective` enforcement these only report — see `aiGuardrails`.
  guardPrompt({ prompt, systemPrompt, provider, feature, entryPoint: 'aiService.aiGenerate' })

  return await idempotencyTracker.dedup(
    provider,
    model,
    options.temperature,
    feature,
    systemPrompt,
    prompt,
    async () => {
      // `options.schema`, not a bare `schema` — there is no such binding in this
      // function, so this threw a ReferenceError on every aiGenerate call.
      const schemaOverhead = estimateSchemaOverhead(options.schema)
      const budget = await prepareCallBudget(
        model,
        systemPrompt,
        prompt,
        options.maxTokens,
        feature,
        schemaOverhead
      )

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
        maxTokens: budget.maxTokens,
        stop: options.stop,
        timeout: options.timeout,
        idleTimeout: options.idleTimeout,
        firstTokenTimeout: options.firstTokenTimeout,
        // Without this the text path is heartbeat-blind. It matters most for the
        // JSON fallback below `aiGenerateStructured`: a planning call that lost
        // native structured output would stream fine for eight minutes while the
        // stage watchdog, hearing nothing, declared "made no progress" and killed
        // the run.
        onToken: options.onToken
      }

      async function trackGenerate(providerName: string, modelName: string, opts: ProviderOptions, estimatedInputTokens: number): Promise<string> {
        if (options.sessionBudget) {
          const sCheck = options.sessionBudget.check()
          if (!sCheck.allowed) throw new SessionBudgetExceededError(sCheck.reason)
          if (sCheck.warn) console.warn(`[aiService] session: ${sCheck.reason}`)
        }
        providerBudget.check(providerName)
        const pm = providerName === provider ? providerModule : PROVIDER_MAP[providerName]!
        const trace = makeLangfuseTrace('ai-generate', feature, providerName, modelName)
        const start = performance.now()
        try {
          const result = await withRetry(
            () => {
              const generate = () =>
                foregroundSlot(providerName)(() =>
                  latencyBudget.wrap(feature, () => pm.generate(prompt, systemPrompt, modelName, opts))()
                )
              return generate().catch((err) => {
                if (err instanceof TokenLimitError && (opts.maxTokens ?? 0) > MIN_OUTPUT_TOKENS) {
                  opts.maxTokens = Math.max(Math.floor(opts.maxTokens! / 2), MIN_OUTPUT_TOKENS)
                  return generate()
                }
                if (err instanceof TokenLimitError) err.retryable = false
                throw err
              })
            },
            isRetryable,
            { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
          )
          const { text, usage } = result
          const durationMs = performance.now() - start
          endLangfuseGen(trace, text, usage, modelName, durationMs)
          if (usage) {
            // The provider just told us what our prompt really cost. That closes
            // the loop on the local estimate for free — no reference corpus, no
            // calibration job, and it re-converges by itself if the model changes.
            recordObservedUsage(modelName, estimatedInputTokens, usage.promptTokens)
            const cost = computeCost(modelName, usage)
            // Flattened: the store's token totals read promptTokens/completionTokens
            // off the entry directly, so a nested `usage` object summed to nothing.
            useCostTrackingStore().logCost({
              model: modelName,
              provider: providerName,
              feature,
              phase: options.phase,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              cost
            })
            providerBudget.record(providerName, usage.promptTokens + usage.completionTokens, cost)
            if (options.sessionBudget) {
              options.sessionBudget.record(providerName, usage.promptTokens + usage.completionTokens, cost)
            }
          }
          aiResponseCache!
            .store(providerName, modelName, opts.temperature, feature, systemPrompt, prompt, text)
            .catch(() => {})
          return text
        } catch (error) {
          failLangfuseGen(trace, error, performance.now() - start)
          recordProviderFailure(providerName, error)
          throw error
        }
      }

      return await withFallback(async (fbProvider) => {
        if (fbProvider === provider) {
          return await trackGenerate(provider, model, providerOptions, budget.inputTokens)
        }
        const fbKey = await getApiKey(fbProvider)
        if (fbProvider !== PROVIDERS.OLLAMA && !fbKey) {
          throw new Error(`${fbProvider} API key not configured`)
        }
        const fbModel = defaultModelForProvider(fbProvider)!
        // Re-measured against the fallback model: it has its own context window,
        // and often its own tokenizer family.
        const fbBudget = await prepareCallBudget(fbModel, systemPrompt, prompt, options.maxTokens)
        return await trackGenerate(
          fbProvider,
          fbModel,
          {
            apiKey: fbKey || undefined,
            signal: options.signal,
            temperature: options.temperature,
            maxTokens: fbBudget.maxTokens,
            timeout: options.timeout
          },
          fbBudget.inputTokens
        )
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

  guardPrompt({ prompt, systemPrompt, provider, feature, entryPoint: 'aiService.aiStream' })

  const budget = await prepareCallBudget(model, systemPrompt, prompt, options.maxTokens, feature)

  const apiKey = await getApiKey(provider)
  if (provider !== PROVIDERS.OLLAMA && !apiKey) {
    throw new Error(`${provider} API key not configured. Please add it in Settings > AI Providers.`)
  }

  const providerOptions: ProviderOptions = {
    apiKey: apiKey || undefined,
    signal: options.signal,
    temperature: options.temperature,
    maxTokens: budget.maxTokens,
    stop: options.stop,
    timeout: options.timeout,
    idleTimeout: options.idleTimeout,
    firstTokenTimeout: options.firstTokenTimeout
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
    if (options.sessionBudget) {
      const sCheck = options.sessionBudget.check()
      if (!sCheck.allowed) throw new SessionBudgetExceededError(sCheck.reason)
      if (sCheck.warn) console.warn(`[aiService] session: ${sCheck.reason}`)
    }
    providerBudget.check(provider)
    const text = await withRetry(
      () => {
        const stream = () =>
          foregroundSlot(provider)(() =>
            latencyBudget.wrap(feature, () =>
              providerModule.stream(prompt, systemPrompt, model, trackedOnChunk, providerOptions)
            )()
          )
        return stream().catch((err) => {
          if (!emittedAny && err instanceof TokenLimitError && (providerOptions.maxTokens ?? 0) > MIN_OUTPUT_TOKENS) {
            providerOptions.maxTokens = Math.max(Math.floor(providerOptions.maxTokens! / 2), MIN_OUTPUT_TOKENS)
            return stream()
          }
          if (err instanceof TokenLimitError) err.retryable = false
          throw err
        })
      },
      shouldRetry,
      { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
    )
    if (options.sessionBudget) {
      options.sessionBudget.record(provider, 0, 0)
    }
    endStreamTrace(text)
    return text
  } catch (error) {
    recordProviderFailure(provider, error)
    if (emittedAny) throw error
    trackError(error, {
      source: 'ai',
      severity: 'warning',
      context: { provider, feature, phase: 'primary-stream' }
    })
    const fbResult = await withFallback(async (fbProvider) => {
      if (fbProvider === provider) throw error
      if (options.sessionBudget) {
        const sCheck = options.sessionBudget.check()
        if (!sCheck.allowed) throw new SessionBudgetExceededError(sCheck.reason)
        if (sCheck.warn) console.warn(`[aiService] session: ${sCheck.reason}`)
      }
      providerBudget.check(fbProvider)
      const fbKey = await getApiKey(fbProvider)
      if (fbProvider !== PROVIDERS.OLLAMA && !fbKey) {
        throw new Error(`${fbProvider} API key not configured`)
      }
      const fbModel = defaultModelForProvider(fbProvider)!
      const fbBudget = await prepareCallBudget(fbModel, systemPrompt, prompt, options.maxTokens)
      return await foregroundSlot(fbProvider)(() =>
        latencyBudget.wrap(feature, () =>
          PROVIDER_MAP[fbProvider]!.stream(prompt, systemPrompt, fbModel, trackedOnChunk, {
            apiKey: fbKey || undefined,
            signal: options.signal,
            temperature: options.temperature,
            maxTokens: fbBudget.maxTokens,
            timeout: options.timeout
          })
        )()
      )
    }, provider)
    if (options.sessionBudget) {
      options.sessionBudget.record(provider, 0, 0)
    }
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

  guardPrompt({
    prompt,
    systemPrompt,
    provider,
    feature,
    entryPoint: 'aiService.aiGenerateStructured'
  })

  const budget = await prepareCallBudget(model, systemPrompt, prompt, options.maxTokens, feature)

  const apiKey = await getApiKey(provider)
  const hasKey = provider === PROVIDERS.OLLAMA || !!apiKey

  if (schema && hasKey && typeof providerModule.generateStructured === 'function') {
    const trace = makeLangfuseTrace('ai-generate-structured', feature, provider, model)
    const start = performance.now()
    try {
      if (options.sessionBudget) {
        const sCheck = options.sessionBudget.check()
        if (!sCheck.allowed) throw new SessionBudgetExceededError(sCheck.reason)
        if (sCheck.warn) console.warn(`[aiService] session: ${sCheck.reason}`)
      }
      providerBudget.check(provider)
      const structOpts: ProviderOptions & { schemaName?: string } = {
        apiKey: apiKey || undefined,
        signal: options.signal,
        temperature: options.temperature,
        maxTokens: budget.maxTokens,
        timeout: options.timeout,
        idleTimeout: options.idleTimeout,
        firstTokenTimeout: options.firstTokenTimeout,
        onToken: options.onToken,
        schemaName: options.schemaName,
        repeatPenalty: options.repeatPenalty,
        repeatLastN: options.repeatLastN,
        topP: options.topP,
        minP: options.minP
      }
      const result = await withRetry(
        () => {
          const generate = () =>
            foregroundSlot(provider)(() =>
              latencyBudget.wrap(feature, () =>
                providerModule.generateStructured!(prompt, systemPrompt, model, schema, structOpts)
              )()
            )
          return generate().catch((err) => {
            if (err instanceof TokenLimitError && (structOpts.maxTokens ?? 0) > MIN_OUTPUT_TOKENS) {
              structOpts.maxTokens = Math.max(Math.floor(structOpts.maxTokens! / 2), MIN_OUTPUT_TOKENS)
              return generate()
            }
            if (err instanceof TokenLimitError) err.retryable = false
            throw err
          })
        },
        isRetryable,
        { maxRetries: options.maxRetries, retryDelay: options.retryDelay }
      )
      if (result && typeof result === 'object') {
        const { data, usage } = result
        const durationMs = performance.now() - start
        endLangfuseGen(trace, JSON.stringify(data), usage, model, durationMs)
        if (usage) {
          recordObservedUsage(model, budget.inputTokens, usage.promptTokens)
          const cost = computeCost(model, usage)
          useCostTrackingStore().logCost({
            model,
            provider,
            feature,
            phase: options.phase,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            cost
          })
          providerBudget.record(provider, usage.promptTokens + usage.completionTokens, cost)
          if (options.sessionBudget) {
            options.sessionBudget.record(provider, usage.promptTokens + usage.completionTokens, cost)
          }
        }
        // The provider claimed structured output — verify it actually matches
        // the schema before it reaches the store.
        guardStructuredOutput({ data, schema, provider, entryPoint: 'aiService.aiGenerateStructured' })

        const output = typeof data === 'string' ? data : JSON.stringify(data)
        aiResponseCache!
          .store(provider, model, options.temperature, feature, systemPrompt, prompt, output)
          .catch(() => {})
        return data
      }
    } catch (err) {
      failLangfuseGen(trace, err, performance.now() - start)
      recordProviderFailure(provider, err)

      // A stalled or truncated structured call still carries everything the
      // model emitted before it stopped. On local hardware regenerating that is
      // minutes of work, so repair the prefix before falling back to a full
      // re-run — nine complete chapters beat starting over.
      const partial = (err as { partial?: unknown })?.partial
      if (typeof partial === 'string' && partial.trim()) {
        const salvaged = repairTruncatedJson(partial)
        if (salvaged) {
          console.warn(
            `[aiGenerateStructured] recovered a truncated response (${partial.length} chars) instead of regenerating`
          )
          return salvaged
        }
      }
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
