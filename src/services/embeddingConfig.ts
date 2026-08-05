import { EMBEDDING_DEFAULTS } from '../config/ai'
import { STORAGE_KEYS } from '../config/storageKeys'

// The embedding provider/model, resolved from the user's saved settings.
//
// This exists because the index and the queries hitting it were resolving the
// model through three different paths that only agreed by coincidence:
//
//   - embeddingQueue called getEmbeddings() with no options  → EMBEDDING_DEFAULTS
//   - getEmbedding() (singular) hardcoded ollama + 'nomic-embed-text'
//   - documentChunker read settingsStore.embeddingModel
//
// They match on a fresh install and diverge the moment anyone touches the
// embedding setting: the corpus keeps being embedded with the shipped default
// while the startup check validates the *chosen* model, and semanticSearch
// silently drops every chunk whose dimension no longer matches the query's
// (see warnDimMismatch in researchDb). Reading one persisted value everywhere
// is what makes the setting mean something.
//
// Deliberately reads localStorage rather than the Pinia store: embeddingService
// is imported by aiResponseCache, which aiService imports, which settingsStore
// imports — importing the store here would close that cycle. This is the same
// JSON blob settingsStore.saveSettings() writes, so it is the same value.

export interface EmbeddingConfig {
  provider: string
  model: string
  threshold: number
}

let cachedRaw: string | null = null
let cachedConfig: EmbeddingConfig | null = null

function readSettings(): EmbeddingConfig {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEYS.SETTINGS)
  } catch {
    // No storage (SSR, worker, private mode) — defaults are the answer.
    raw = null
  }

  if (raw === cachedRaw && cachedConfig) return cachedConfig

  let provider = EMBEDDING_DEFAULTS.provider
  let model = EMBEDDING_DEFAULTS.model
  let threshold = EMBEDDING_DEFAULTS.threshold

  if (raw) {
    try {
      const data = JSON.parse(raw)
      if (data.embeddingProvider) provider = data.embeddingProvider
      if (data.embeddingModel) model = data.embeddingModel
      if (typeof data.embeddingThreshold === 'number') threshold = data.embeddingThreshold
    } catch {
      // Corrupt settings blob; defaults again.
    }
  }

  cachedRaw = raw
  cachedConfig = { provider, model, threshold }
  return cachedConfig
}

/**
 * The provider/model every embedding call should use unless it was handed an
 * explicit override. Overrides win, then saved settings, then the shipped
 * defaults — never a hardcoded literal at the call site.
 */
export function resolveEmbeddingConfig(
  overrides: { provider?: string | null; model?: string | null } = {}
): EmbeddingConfig {
  const base = readSettings()
  return {
    provider: overrides.provider || base.provider,
    model: overrides.model || base.model,
    threshold: base.threshold
  }
}

/** Drops the memoized read. Only needed when settings change in this same tab. */
export function invalidateEmbeddingConfig(): void {
  cachedRaw = null
  cachedConfig = null
}
