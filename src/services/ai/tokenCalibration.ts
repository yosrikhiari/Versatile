// Per-model correction between the token count we compute locally and the one
// the provider actually bills.
//
// Two things drift, and both land in the same number. We only ship OpenAI's BPE
// tables, so counts for Claude/Gemini/Llama/Qwen are a structural proxy rather
// than that model's real tokenizer. On top of that every provider wraps our text
// in chat framing (role markers, template tokens) we never see.
//
// Both show up in `usage.promptTokens`, which every provider already returns on
// every non-streaming call. So calibration costs one multiplication per estimate
// and needs no reference corpus, no cache file, and no scheduled refresh — it
// converges on live traffic and re-converges by itself when a model changes.

const STORAGE_KEY = 'versatile.tokenCalibration.v1'

// Weight on each new sample. Low enough that one anomalous prompt cannot move
// the factor much, high enough to track a model swap within a session's worth
// of calls.
const EWMA_ALPHA = 0.2

// Chat framing is additive (~10 tokens), so on a short prompt it dominates and
// would teach a multiplicative factor something false. Only learn from prompts
// large enough that framing is noise.
const MIN_SAMPLE_TOKENS = 200

// A factor outside this range means the estimate is wrong in a way a scalar
// cannot fix (wrong model key, truncated prompt, provider bug). Clamp rather
// than let one bad reading corrupt the budget.
const MIN_FACTOR = 0.5
const MAX_FACTOR = 2.0

export interface CalibrationEntry {
  factor: number
  samples: number
}

let cache: Record<string, CalibrationEntry> | null = null

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Private-mode / disabled storage: calibration degrades to in-memory only.
    return null
  }
}

function load(): Record<string, CalibrationEntry> {
  if (cache) return cache
  cache = {}
  const store = storage()
  if (!store) return cache
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return cache
    const parsed = JSON.parse(raw)
    for (const [model, entry] of Object.entries(parsed || {})) {
      const e = entry as Partial<CalibrationEntry>
      if (typeof e?.factor === 'number' && Number.isFinite(e.factor)) {
        cache[model] = {
          factor: Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, e.factor)),
          samples: typeof e.samples === 'number' ? e.samples : 1
        }
      }
    }
  } catch {
    // Corrupt entry: start over rather than fail a generation on a parse error.
    cache = {}
  }
  return cache
}

function persist(): void {
  const store = storage()
  if (!store || !cache) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Quota or serialization failure is not worth interrupting generation for.
  }
}

/** Multiplier to apply to a locally computed token count for `model`. */
export function getCalibration(model: string): number {
  if (!model) return 1
  return load()[model]?.factor ?? 1
}

/**
 * Feed one observation back in. `estimated` is what we computed before sending;
 * `actual` is the provider's reported prompt token count for that same call.
 */
export function recordObservedUsage(model: string, estimated: number, actual: number): void {
  if (!model) return
  if (!Number.isFinite(estimated) || !Number.isFinite(actual)) return
  if (estimated < MIN_SAMPLE_TOKENS || actual <= 0) return

  const observed = actual / estimated
  if (!Number.isFinite(observed) || observed <= 0) return

  const entries = load()
  const prior = entries[model]
  const blended = prior ? prior.factor * (1 - EWMA_ALPHA) + observed * EWMA_ALPHA : observed

  entries[model] = {
    factor: Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, blended)),
    samples: (prior?.samples ?? 0) + 1
  }
  persist()
}

/** Snapshot for diagnostics — what the app has learned about each model so far. */
export function getCalibrationReport(): Record<string, CalibrationEntry> {
  return { ...load() }
}

export function resetCalibration(): void {
  cache = {}
  const store = storage()
  try {
    store?.removeItem(STORAGE_KEY)
  } catch {
    // Best effort.
  }
}
