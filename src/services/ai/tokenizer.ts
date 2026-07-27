// Token counting for context budgeting.
//
// `countTokens` is deliberately SYNCHRONOUS. fitToBudget() re-estimates blocks
// inside its degrade and shrink loops, so an async counter would turn a single
// budget pass into ~20 awaits and make every caller up the chain async for no
// gain. Exact BPE tables load once through `preloadTokenizer()` — a dynamic
// import, so the rank tables (1.7MB for cl100k, 3.6MB for o200k) land in their
// own lazy chunk instead of the main bundle. Every call after that resolves is
// exact and in-process.
//
// Until the preload resolves, and for text we count before any model is chosen,
// we fall back to the character-ratio heuristic that used to be the only path.
// The fallback is the previous behaviour exactly, which is what makes adopting
// exact counts risk-free.

import { getCalibration } from './tokenCalibration'

export type TokenKind = 'prose' | 'json'

const CHARS_PER_TOKEN: Record<TokenKind, number> = {
  prose: 4.0,
  json: 2.6
}

export type EncodingName = 'o200k_base' | 'cl100k_base'

/**
 * Only OpenAI publishes BPE tables we can ship. Everything else — Claude,
 * Gemini, Llama, Qwen, Mixtral — gets cl100k_base as a structural proxy, and
 * tokenCalibration corrects the systematic offset from the provider's own
 * reported usage. A proxy plus a learned scalar beats a 4:1 character guess,
 * and unlike a hand-maintained alias table it cannot go stale silently.
 */
export function encodingFor(model: string): EncodingName {
  const m = (model || '').toLowerCase()
  const isO200k =
    m.startsWith('gpt-4o') ||
    m.startsWith('chatgpt-4o') ||
    m.startsWith('gpt-5') ||
    m.includes('gpt-oss') ||
    /^o[134](-|$)/.test(m)
  return isO200k ? 'o200k_base' : 'cl100k_base'
}

type Encoder = (text: string) => number

const encoders = new Map<EncodingName, Encoder>()
const inflight = new Map<EncodingName, Promise<Encoder | null>>()

// The model the next un-qualified countTokens() call should assume. Context
// assembly happens well before the provider call, and threading a model through
// every budget helper would be churn for a value that is constant per generation.
let activeModel = ''

export function setActiveModel(model: string): void {
  activeModel = model || ''
}

export function getActiveModel(): string {
  return activeModel
}

function loadEncoder(name: EncodingName): Promise<Encoder | null> {
  const ready = encoders.get(name)
  if (ready) return Promise.resolve(ready)

  const existing = inflight.get(name)
  if (existing) return existing

  const task = (async () => {
    try {
      // Two literal specifiers rather than a computed one: Vite can only split
      // a dynamic import into its own chunk if it can see the path statically.
      const mod =
        name === 'o200k_base'
          ? await import('gpt-tokenizer/encoding/o200k_base')
          : await import('gpt-tokenizer/encoding/cl100k_base')
      const fn = (text: string) => mod.countTokens(text)
      encoders.set(name, fn)
      return fn
    } catch (error) {
      console.warn(`[tokenizer] ${name} unavailable, staying on heuristic:`, error)
      return null
    } finally {
      inflight.delete(name)
    }
  })()

  inflight.set(name, task)
  return task
}

/**
 * Load the exact tokenizer for `model` and make it the active one. Safe to call
 * repeatedly — the table is loaded at most once per encoding. Resolves false if
 * the tables could not load, in which case counting stays on the heuristic.
 */
export async function preloadTokenizer(model?: string): Promise<boolean> {
  if (model) setActiveModel(model)
  const encoder = await loadEncoder(encodingFor(model || activeModel))
  return encoder !== null
}

/** True when `countTokens` is currently returning exact counts for this model. */
export function isExact(model?: string): boolean {
  return encoders.has(encodingFor(model || activeModel))
}

/** The pre-existing character-ratio estimate. Always available, never throws. */
export function heuristicTokens(text: string, kind: TokenKind = 'prose'): number {
  if (!text) return 0
  return Math.ceil(text.length / (CHARS_PER_TOKEN[kind] ?? CHARS_PER_TOKEN.prose))
}

/**
 * Token count for `text`. Exact once the tokenizer for the active model has
 * loaded, heuristic before that. `kind` only affects the heuristic path — real
 * BPE already accounts for how densely JSON tokenizes.
 */
export function countTokens(text: string, kind: TokenKind = 'prose', model?: string): number {
  if (!text) return 0
  const target = model || activeModel
  const encoder = encoders.get(encodingFor(target))
  if (!encoder) return heuristicTokens(text, kind)
  try {
    return Math.max(1, Math.round(encoder(text) * getCalibration(target)))
  } catch {
    // A tokenizer failure must never fail a generation.
    return heuristicTokens(text, kind)
  }
}

/** Test seam: drop loaded tables so a suite can exercise the fallback path. */
export function resetTokenizerForTests(): void {
  encoders.clear()
  inflight.clear()
  activeModel = ''
}
