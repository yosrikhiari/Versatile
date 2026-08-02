import { STORAGE_KEYS } from './storageKeys'

const DEFAULT_MODEL = 'qwen3:8b'
const DEFAULT_ENDPOINT = '/ollama'

/**
 * Context window requested from Ollama.
 *
 * Ollama defaults to 4096 whenever VRAM is under 24 GiB (docs.ollama.com/context-length,
 * tiered since 0.15.5) — which is every consumer machine this app targets. We never
 * sent num_ctx at all, so every prompt over 4096 tokens was at the mercy of whatever
 * the server does on overflow. A single writer prompt exceeds that even on a new
 * project; see scripts/ml-pipelines/potato-profile/.
 *
 * 16384 is a starting point for a 16GB machine, not a verified safe ceiling. KV cache
 * grows linearly with this, and RAM scales as OLLAMA_NUM_PARALLEL x context, so verify
 * against /api/ps on the target machine before raising it.
 */
const DEFAULT_NUM_CTX = 16384

/**
 * Repetition controls. Same class of bug as `num_ctx` above: an Ollama option we
 * never sent, silently taking a server default that is wrong for long-form prose.
 *
 * Ollama defaults to `repeat_last_n: 64` — a 64-TOKEN lookback. A sentence like
 * "He had no illusions of being any different." is ~11 tokens, so the penalty
 * window sees roughly six copies and nothing before that. It cannot perceive a
 * paragraph-scale loop at all. Measured consequence in a live run: one 1,866-word
 * scene ended with that sentence repeated 131 times until it hit the token
 * ceiling, and 45% of all committed prose across 13 scenes was duplicate text.
 *
 * 512 covers several paragraphs, which is the scale at which these loops form.
 * `-1` (full context) is available but costs sampling time on every token and is
 * unnecessary once the window exceeds the loop period.
 *
 * 1.15 over Ollama's 1.1: enough to break an established loop, low enough to
 * leave voice and deliberate motif repetition intact. Raising it further starts
 * suppressing ordinary words like character names.
 */
const DEFAULT_REPEAT_PENALTY = 1.15
const DEFAULT_REPEAT_LAST_N = 512

/**
 * Truncates the degenerate tail of the distribution, which is where loop tokens
 * live. `min_p` is the more robust of the two for creative text — it scales the
 * cutoff with the top token's confidence instead of a fixed probability mass —
 * but both are set because not every Ollama build honours `min_p`.
 */
const DEFAULT_TOP_P = 0.9
const DEFAULT_MIN_P = 0.05

export function getOllamaEndpoint() {
  // STORAGE_KEYS ref
  return localStorage.getItem(STORAGE_KEYS.OLLAMA_ENDPOINT) || DEFAULT_ENDPOINT
}

export function setOllamaEndpoint(url: any) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, url)
}

export function getOllamaModel() {
  // STORAGE_KEYS ref
  return localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL) || DEFAULT_MODEL
}

export function setOllamaModel(model: any) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, model)
}

/**
 * Model for utility work — structured planning, metadata extraction, relationship
 * and spine passes — as opposed to prose.
 *
 * These calls emit short JSON and are extractive rather than generative, so they
 * do not need the prose model's capability, but on a one-model setup they pay its
 * speed anyway. That matters: a 10-chapter plan is ~11 sequential calls before a
 * single word of the book is written. Measured on a GTX 1650, phi4-mini:3.8b runs
 * at 13.5 tok/s against qwen3:8b's 5.85 — it fits entirely in 4 GB of VRAM where
 * the 8B model does not.
 *
 * Unset means "use the prose model", which is exactly the previous behaviour.
 */
export function getOllamaUtilityModel(): string | null {
  return localStorage.getItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL) || null
}

export function setOllamaUtilityModel(model: string | null) {
  if (model) localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, model)
  else localStorage.removeItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL)
}

export function getOllamaNumCtx() {
  // STORAGE_KEYS ref
  const raw = localStorage.getItem(STORAGE_KEYS.OLLAMA_NUM_CTX)
  const parsed = Number.parseInt(raw ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_NUM_CTX
}

export function setOllamaNumCtx(numCtx: any) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_NUM_CTX, String(numCtx))
}

function readPositiveFloat(key: string, fallback: number): number {
  const parsed = Number.parseFloat(localStorage.getItem(key) ?? '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getOllamaRepeatPenalty(): number {
  return readPositiveFloat(STORAGE_KEYS.OLLAMA_REPEAT_PENALTY, DEFAULT_REPEAT_PENALTY)
}

export function setOllamaRepeatPenalty(value: number) {
  localStorage.setItem(STORAGE_KEYS.OLLAMA_REPEAT_PENALTY, String(value))
}

export function getOllamaRepeatLastN(): number {
  // -1 is meaningful (full context), so this cannot use the positive-only reader.
  const parsed = Number.parseInt(localStorage.getItem(STORAGE_KEYS.OLLAMA_REPEAT_LAST_N) ?? '', 10)
  return Number.isFinite(parsed) && (parsed > 0 || parsed === -1) ? parsed : DEFAULT_REPEAT_LAST_N
}

export function setOllamaRepeatLastN(value: number) {
  localStorage.setItem(STORAGE_KEYS.OLLAMA_REPEAT_LAST_N, String(value))
}

export function getOllamaTopP(): number {
  return readPositiveFloat(STORAGE_KEYS.OLLAMA_TOP_P, DEFAULT_TOP_P)
}

export function getOllamaMinP(): number {
  return readPositiveFloat(STORAGE_KEYS.OLLAMA_MIN_P, DEFAULT_MIN_P)
}

export {
  DEFAULT_MODEL,
  DEFAULT_NUM_CTX,
  DEFAULT_REPEAT_PENALTY,
  DEFAULT_REPEAT_LAST_N,
  DEFAULT_TOP_P,
  DEFAULT_MIN_P
}
