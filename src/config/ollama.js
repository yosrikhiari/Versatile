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

export function setOllamaEndpoint(url) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, url)
}

export function getOllamaModel() {
  // STORAGE_KEYS ref
  return localStorage.getItem(STORAGE_KEYS.OLLAMA_MODEL) || DEFAULT_MODEL
}

export function setOllamaModel(model) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_MODEL, model)
}

export function getOllamaNumCtx() {
  // STORAGE_KEYS ref
  const raw = localStorage.getItem(STORAGE_KEYS.OLLAMA_NUM_CTX)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_NUM_CTX
}

export function setOllamaNumCtx(numCtx) {
  // STORAGE_KEYS ref
  localStorage.setItem(STORAGE_KEYS.OLLAMA_NUM_CTX, String(numCtx))
}

export { DEFAULT_MODEL, DEFAULT_NUM_CTX }
