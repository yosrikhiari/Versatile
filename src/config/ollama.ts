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

export { DEFAULT_MODEL, DEFAULT_NUM_CTX }
