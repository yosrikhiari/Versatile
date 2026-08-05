import {
  getOllamaEndpoint,
  getOllamaNumCtx,
  getOllamaRepeatPenalty,
  getOllamaRepeatLastN,
  getOllamaTopP,
  getOllamaMinP
} from '../../config/ollama'
import { PROVIDERS } from '../../config/ai'
import { TokenLimitError } from '../ai/tokenLimitError'
import { recordThroughput } from '../generationEstimate'

interface OllamaOptions {
  apiKey?: string
  timeout?: number
  signal?: AbortSignal
  maxTokens?: number
  temperature?: number
  stop?: string[]
  numCtx?: number
  repeatPenalty?: number
  repeatLastN?: number
  topP?: number
  minP?: number
  /** Max ms between two streamed tokens before the call is considered stalled. */
  idleTimeout?: number
  /** Max ms to wait for the FIRST token (covers prompt evaluation). */
  firstTokenTimeout?: number
  /** @deprecated alias for `idleTimeout`, kept so existing callers keep working. */
  chunkTimeout?: number
  /**
   * Progress hook for calls that return one blob (`generateStructured`). The
   * tokens are still streamed — this exposes them so a caller can prove the call
   * is alive without waiting for the parsed result.
   */
  onToken?: (chunk: string, full: string) => void
  format?: Record<string, unknown> | string
  /**
   * Let a reasoning-capable model emit chain-of-thought. Off by default — see
   * THINKING_DISABLED_BY_DEFAULT.
   */
  think?: boolean
}

/**
 * Reasoning models put their chain-of-thought in a separate `thinking` field,
 * NOT in `response`, and it is billed against the same `num_predict` budget.
 *
 * This app discards that field entirely, so every thinking token was paid for
 * and thrown away. Worse, it displaces real output: measured on qwen3:8b — the
 * default model here — "Reply with exactly: ready" under a 40-token budget spent
 * all 40 on reasoning and returned an EMPTY response. The same call with
 * thinking off answers correctly in 2 tokens.
 *
 * For prose the effect is quieter but more expensive: a scene budgeted at 4,500
 * tokens silently spends part of it reasoning, so the scene lands short of the
 * word count it was explicitly told to hit. At ~6 tok/s that is minutes per
 * scene bought and discarded.
 *
 * Non-reasoning models ignore the flag, so it is safe to send unconditionally.
 */
const THINKING_DISABLED_BY_DEFAULT = false

/**
 * Timeout policy for a local model.
 *
 * A wall-clock budget cannot distinguish "the server is wedged" from "a 4 GB GPU
 * is honestly producing 6 tokens a second", and on this class of hardware the
 * second case is normal: 4,500 tokens at 5.85 tok/s is 13 minutes of healthy
 * work. Bounding total time therefore killed generations that were succeeding —
 * which is exactly how a 10-chapter run died at chapter 2.
 *
 * So we bound *lack of progress* instead. While tokens keep arriving the call
 * lives; when they stop for IDLE_TIMEOUT_MS it dies immediately, which is both
 * more forgiving of slow hardware and faster to detect a real hang than any
 * total-time budget was.
 *
 * ABSOLUTE_CEILING_MS remains only as a backstop against a server that streams
 * forever (a looping generation still emits tokens, so the idle timer never
 * fires). It is deliberately far above any legitimate single call.
 */
const IDLE_TIMEOUT_MS = 90_000
/**
 * Prompt evaluation happens before the first token and scales with prompt size;
 * on a partially-offloaded model a 10k-token prompt can take minutes with no
 * output at all. This is the one phase where silence is expected.
 */
const FIRST_TOKEN_TIMEOUT_MS = 300_000
/**
 * Fifteen minutes, not an hour.
 *
 * The ceiling only ever fires on a call that is streaming steadily but far too
 * slowly — a healthy call finishes long before it, and a wedged one is caught by
 * the idle timer in 90s. Its single job is to cut losses, and at an hour it did
 * that job badly: a contended run spent 3600s per scene producing prose that was
 * then thrown away, so an author waited an hour per scene to be told it failed.
 * No legitimate single scene on working hardware approaches this.
 */
const ABSOLUTE_CEILING_MS = 900_000

export class OllamaStalledError extends Error {
  /** Tokens received before the stall — non-empty output may still be salvageable. */
  partial: string
  idleMs: number

  constructor(message: string, partial: string, idleMs: number) {
    super(message)
    this.name = 'OllamaStalledError'
    this.partial = partial
    this.idleMs = idleMs
  }
}

function decorateOllamaError(message: string, original: unknown) {
  const lower = message.toLowerCase()
  if (lower.includes('cuda') || lower.includes('shared object') || lower.includes('llama runner')) {
    return new Error(
      `Ollama GPU error — try restarting Ollama or set OLLAMA_INTEL_GPU=1 to force CPU mode`
    )
  }
  return original instanceof Error ? original : new Error(message)
}

const modelCache = new Set<string>()
let modelCacheLoaded = false

async function ensureModelAvailable(model: string) {
  if (!model) return
  if (modelCache.has(model)) return

  if (!modelCacheLoaded) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(`${getOllamaEndpoint()}/api/tags`, { signal: controller.signal })
      clearTimeout(timeout)
      if (response.ok) {
        const data = await response.json()
        for (const m of data.models || []) {
          modelCache.add(m.name)
        }
        modelCacheLoaded = true
      }
    } catch {
      // Best-effort model-cache warm-up; leave cache empty on failure.
    }
  }

  if (modelCacheLoaded && !modelCache.has(model)) {
    throw new Error(
      `Model "${model}" not found in Ollama. Pull it first with: ollama pull ${model}`
    )
  }
}

export function __resetModelCache() {
  modelCache.clear()
  modelCacheLoaded = false
}

function buildOllamaOptions(options: OllamaOptions = {}) {
  const opts: Record<string, unknown> = {}
  if (options.maxTokens) opts.num_predict = options.maxTokens
  if (options.temperature != null) opts.temperature = options.temperature
  if (Array.isArray(options.stop) && options.stop.length) opts.stop = options.stop
  const numCtx = options.numCtx ?? getOllamaNumCtx()
  if (numCtx > 0) opts.num_ctx = numCtx

  // Always sent. An unset Ollama sampling option is not "no opinion" — it is the
  // server's default silently applying, and the defaults here (repeat_last_n=64)
  // are tuned for chat turns, not for multi-thousand-token prose. See the note in
  // config/ollama.ts.
  const repeatPenalty = options.repeatPenalty ?? getOllamaRepeatPenalty()
  if (repeatPenalty > 0) opts.repeat_penalty = repeatPenalty

  const repeatLastN = options.repeatLastN ?? getOllamaRepeatLastN()
  if (repeatLastN > 0 || repeatLastN === -1) opts.repeat_last_n = repeatLastN

  const topP = options.topP ?? getOllamaTopP()
  if (topP > 0 && topP <= 1) opts.top_p = topP

  const minP = options.minP ?? getOllamaMinP()
  if (minP > 0 && minP <= 1) opts.min_p = minP

  return Object.keys(opts).length ? { options: opts } : {}
}

function readWithTimeout(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number) {
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DOMException(`Stream read timed out after ${timeoutMs}ms`, 'TimeoutError'))
    }, timeoutMs)
    reader.read().then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

interface StreamRunResult {
  text: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
}

/**
 * The single request path every Ollama call goes through.
 *
 * Streaming is used even when the caller wants one blob back, because the token
 * stream is the only evidence we have that a local model is alive. Non-streaming
 * `/api/generate` returns nothing until it is completely finished, so a slow-but-
 * healthy call and a wedged one are indistinguishable until the budget expires —
 * and then the partial work is gone too. Streaming makes progress observable,
 * lets `format` (structured output) still apply, and preserves partial text when
 * something does go wrong.
 */
async function runStream(
  prompt: string,
  systemPrompt: string,
  model: string,
  onChunk: ((text: string, full: string) => void) | null | undefined,
  options: OllamaOptions
): Promise<StreamRunResult> {
  const ceilingMs = options.timeout && options.timeout > 0 ? options.timeout : ABSOLUTE_CEILING_MS
  const idleMs = options.idleTimeout ?? options.chunkTimeout ?? IDLE_TIMEOUT_MS
  const firstTokenMs = options.firstTokenTimeout ?? Math.max(FIRST_TOKEN_TIMEOUT_MS, idleMs)

  let ceilingTimer: ReturnType<typeof setTimeout> | undefined
  const externalSignal = options.signal
  const controller = new AbortController()
  const onAbort = () => controller.abort(externalSignal!.reason)

  let fullResponse = ''

  try {
    await ensureModelAvailable(model)

    ceilingTimer = setTimeout(
      () =>
        controller.abort(new DOMException(`Request timed out after ${ceilingMs}ms`, 'AbortError')),
      ceilingMs
    )
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason)
      } else {
        externalSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    const response = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        system: systemPrompt,
        prompt: prompt,
        stream: true,
        think: options.think ?? THINKING_DISABLED_BY_DEFAULT,
        ...(options.format ? { format: options.format } : {}),
        ...buildOllamaOptions(options)
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      let detail = ''
      try {
        const errBody = await response.json()
        detail = errBody.error || JSON.stringify(errBody)
      } catch {
        // Response body wasn't JSON; fall through and throw with status only.
      }
      const msg = `Ollama error (${response.status}): ${detail}`.trim()
      if (/(?:context length exceeded|context_length_exceeded|maximum context|prompt too large)/i.test(msg)) {
        throw new TokenLimitError(msg, PROVIDERS.OLLAMA, model, options.maxTokens)
      }
      throw decorateOllamaError(msg, detail)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    // A JSON object can be split across two network chunks; without carrying the
    // remainder forward the tail of one object and the head of the next are both
    // dropped, which silently truncates output.
    let buffered = ''
    let thinkingChars = 0

    function onStreamAbort() {
      try {
        reader.cancel()
      } catch {
        // Reader may already be closed on abort; ignore.
      }
    }
    if (externalSignal) {
      if (externalSignal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      externalSignal.addEventListener('abort', onStreamAbort, { once: true })
    }

    try {
      let sawFirstToken = false
      while (true) {
        const budget = sawFirstToken ? idleMs : firstTokenMs
        let result: ReadableStreamReadResult<Uint8Array>
        try {
          result = await readWithTimeout(reader, budget)
        } catch (err) {
          if (err instanceof DOMException && err.name === 'TimeoutError') {
            // No progress for `budget` ms. This is the real hang signal; report
            // it with whatever was produced so callers can salvage partial work.
            throw new OllamaStalledError(
              sawFirstToken
                ? `Ollama stopped producing tokens for ${budget}ms (received ${fullResponse.length} chars)`
                : `Ollama produced no output within ${budget}ms (prompt evaluation stalled)`,
              fullResponse,
              budget
            )
          }
          throw err
        }
        if (result.done) break
        sawFirstToken = true

        buffered += decoder.decode(result.value, { stream: true })
        const lines = buffered.split('\n')
        // The last element is either '' (clean boundary) or a partial object.
        buffered = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line)
            if (parsed.response) {
              fullResponse += parsed.response
              if (onChunk) onChunk(parsed.response, fullResponse)
            }
            // Reasoning tokens are progress even though they are not output —
            // they must reset the idle timer, but must never be mistaken for
            // prose. Only reachable when a caller opts thinking back on.
            if (parsed.thinking) thinkingChars += parsed.thinking.length
            // The final streamed object carries the counts. Capturing them here
            // means streaming calls report real token usage for cost tracking;
            // previously only the non-streaming path did, so every streamed
            // scene was billed as zero.
            if (parsed.done) {
              usage.promptTokens = parsed.prompt_eval_count || 0
              usage.completionTokens = parsed.eval_count || 0
              usage.totalTokens = usage.promptTokens + usage.completionTokens
              // `eval_duration` (ns) times generation alone — excluding prompt
              // evaluation, queueing, and the request-level semaphore that
              // serialises Ollama calls. Timing this one layer up would fold all
              // of that in and report a rate several times lower than the model's,
              // which would make every run estimate built on it useless.
              if (parsed.eval_duration > 0) {
                recordThroughput(model, usage.completionTokens, parsed.eval_duration / 1e6)
              }
            }
          } catch {
            // Not a complete JSON object — should not happen now that partial
            // lines are buffered, but a malformed line must not kill the stream.
          }
        }
      }
    } finally {
      if (externalSignal) externalSignal.removeEventListener('abort', onStreamAbort)
    }

    // Silent empty output is the worst failure mode here: the call "succeeded",
    // billed its tokens, and handed back nothing. Name the cause instead.
    if (!fullResponse && thinkingChars > 0) {
      console.warn(
        `[ollama] ${model} spent its entire ${usage.completionTokens}-token budget on reasoning ` +
          `and produced no output. Disable thinking or raise maxTokens for this call.`
      )
    }

    return { text: fullResponse, usage }
  } catch (error) {
    if (error instanceof OllamaStalledError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      // An abort the caller asked for is a cancellation, not a timeout — saying
      // "timed out" made every user-pressed Stop look like a failure.
      if (externalSignal?.aborted) throw error
      throw new Error(`Ollama request exceeded its ${ceilingMs}ms ceiling`)
    }
    throw decorateOllamaError((error as Error).message || String(error), error)
  } finally {
    clearTimeout(ceilingTimer)
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort)
  }
}

export async function generate(prompt: string, systemPrompt: string, model: string, options: OllamaOptions = {}) {
  const { text, usage } = await runStream(prompt, systemPrompt, model, null, options)
  return { text, usage }
}

export async function stream(prompt: string, systemPrompt: string, model: string, onChunk?: (text: string, full: string) => void, options: OllamaOptions = {}) {
  const { text } = await runStream(prompt, systemPrompt, model, onChunk, options)
  return text
}

/**
 * Structured output: constrain decoding to the JSON schema via Ollama's `format`
 * field. Streams like everything else — `format` and `stream` compose fine, and
 * streaming is what makes the idle-timeout (rather than a wall-clock guess)
 * possible for the planning calls that need it most.
 */
export async function generateStructured(prompt: string, systemPrompt: string, model: string, schema: Record<string, unknown>, options: OllamaOptions = {}) {
  const raw = await runStream(prompt, systemPrompt, model, options.onToken ?? null, {
    ...options,
    format: schema
  })
  try {
    return { data: JSON.parse(raw.text), usage: raw.usage }
  } catch (err) {
    // Grammar-constrained output that ran out of num_predict is valid JSON up to
    // the truncation point. Carrying the text on the error lets the caller repair
    // it instead of paying for the whole generation a second time.
    throw new OllamaStalledError(
      `Ollama returned unparseable structured output (${raw.text.length} chars): ${(err as Error).message}`,
      raw.text,
      0
    )
  }
}

export async function listModels() {
  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/tags`)
    if (response.ok) {
      const data = await response.json()
      return data.models?.map((m: { name: string }) => m.name) || []
    }
    return []
  } catch {
    return []
  }
}

export async function testConnection() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(`${getOllamaEndpoint()}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

export async function generateEmbedding(text: string, model = 'nomic-embed-text') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama embeddings error: ${response.status}`)
    }

    const data = await response.json()
    return data.embeddings?.[0]
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

export { IDLE_TIMEOUT_MS, FIRST_TOKEN_TIMEOUT_MS, ABSOLUTE_CEILING_MS }
