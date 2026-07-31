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
//
// Budget-poisoning defense
// ------------------------
// An attacker who can craft input prompts (via stored scenes, system prompts,
// or story text) could try to push the calibration factor toward 0.5 (making
// the system underestimate real token counts, causing silent overflow) or
// toward 2.0 (wasting budget). The defenses are:
//
//   1. Per-model variance tracking — samples >2σ from the running factor are
//      classified as outliers and rejected before they pollute the EWMA.
//   2. Anomaly rate gating — if >20 % of a model's observations are outliers,
//      the entry auto-resets rather than accumulate a contaminated record.
//   3. Consecutive-anomaly tripwire — 5 outliers in a row triggers an
//      immediate reset regardless of the overall ratio.
//   4. Convergence hallucination detection — if after 20+ samples the factor
//      sits within 1 % of 1.0 with near-zero variance, it probably means a
//      bug or a calibration probe rather than genuine convergence.

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

// ------------ Budget-poisoning defense thresholds ------------

// How many standard deviations a new observation may be from the running factor
// before we classify it as an outlier and reject it.
const OUTLIER_SIGMA = 2

// Minimum samples required before outlier detection activates. Fewer samples =
// not enough data to estimate variance.
const MIN_OUTLIER_SAMPLES = 4

// If the fraction of rejected outliers (anomalies / total) exceeds this, the
// entry auto-resets. An attacker needs to stay below this ratio to keep their
// manipulations in the blend.
const MAX_ANOMALY_RATE = 0.2

// If this many observations in a row are outliers, reset immediately regardless
// of the overall ratio.
const MAX_CONSECUTIVE_ANOMALIES = 5

// After this many samples, if the factor is within ANOMALY_EPSILON of 1.0 with
// near-zero variance, flag it as a possible convergence hallucination / probe.
const MIN_CONVERGENCE_SAMPLES = 20
const CONVERGENCE_EPSILON = 0.01
const CONVERGENCE_VARIANCE_MAX = 0.001

// ----------------------------------------------------------------

export interface CalibrationEntry {
  factor: number
  samples: number
  /** EWMA variance of the observed ratio — used for outlier detection. */
  variance: number
  /** Running count of outlier observations rejected. */
  anomalies: number
  /** How many consecutive observations have been outliers (0 = not in streak). */
  consecutiveAnomalies: number
  /** Timestamp (epoch ms) of the most recent reset, or 0 if never reset. */
  lastReset: number
}

let cache: Record<string, CalibrationEntry> | null = null

/** Models that have already triggered a convergence warning this session. */
const warnedConvergence = new Set<string>()

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
          samples: typeof e.samples === 'number' ? e.samples : 1,
          // v2 fields — default to 0 for entries persisted before the
          // budget-poisoning defense was added.
          variance: typeof e.variance === 'number' ? e.variance : 0,
          anomalies: typeof e.anomalies === 'number' ? e.anomalies : 0,
          consecutiveAnomalies: typeof e.consecutiveAnomalies === 'number' ? e.consecutiveAnomalies : 0,
          lastReset: typeof e.lastReset === 'number' ? e.lastReset : 0
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
 *
 * Budget-poisoning defense: samples that deviate >2σ from the running factor
 * are rejected as outliers. If >20 % of a model's observations are outliers,
 * or 5 outliers occur consecutively, the entry auto-resets.
 */
export function recordObservedUsage(model: string, estimated: number, actual: number): void {
  if (!model) return
  if (!Number.isFinite(estimated) || !Number.isFinite(actual)) return
  if (estimated < MIN_SAMPLE_TOKENS || actual <= 0) return

  const observed = actual / estimated
  if (!Number.isFinite(observed) || observed <= 0) return

  const entries = load()
  const prior = entries[model]

  // ---------- Budget-poisoning outlier rejection ----------
  if (prior && prior.samples >= MIN_OUTLIER_SAMPLES) {
    // Guard against zero-variance: with 4+ identical observations the running
    // factor is essentially locked, so any different observation is suspect.
    const stddev = prior.variance > 0 ? Math.sqrt(prior.variance) : 1e-10
    const deviation = Math.abs(observed - prior.factor) / stddev

    if (deviation > OUTLIER_SIGMA) {
      const anomalies = (prior.anomalies ?? 0) + 1
      const consecutiveAnomalies = (prior.consecutiveAnomalies ?? 0) + 1
      const totalAttempts = prior.samples + anomalies
      const anomalyRate = anomalies / totalAttempts

      // Auto-reset when either threshold triggers.
      if (anomalyRate > MAX_ANOMALY_RATE || consecutiveAnomalies >= MAX_CONSECUTIVE_ANOMALIES) {
        console.warn(
          `[tokenCalibration] ${model}: auto-reset — ${anomalies}/${totalAttempts} ` +
          `observations were outliers (rate ${(anomalyRate * 100).toFixed(1)}%), ` +
          `${consecutiveAnomalies} consecutive`
        )
        delete entries[model]
        persist()
        return
      }

      // Record the rejection and keep the factor unchanged.
      entries[model] = {
        ...prior,
        anomalies,
        consecutiveAnomalies
      }
      persist()
      return
    }
  }

  // ---------- Normal update path ----------
  // Running variance (Welford-inspired EWMA). Captures the spread of the
  // observed ratio around the blended factor.
  const diff = Math.abs(observed - (prior?.factor ?? observed))
  const variance = prior
    ? prior.variance * (1 - EWMA_ALPHA) + diff * diff * EWMA_ALPHA
    : 0

  const rawBlended = prior
    ? prior.factor * (1 - EWMA_ALPHA) + observed * EWMA_ALPHA
    : observed

  const sampleCount = (prior?.samples ?? 0) + 1
  const finalFactor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, rawBlended))

  // Convergence-hallucination warning: fire at most once per session per model.
  if (
    !warnedConvergence.has(model) &&
    sampleCount >= MIN_CONVERGENCE_SAMPLES &&
    Math.abs(finalFactor - 1) < CONVERGENCE_EPSILON &&
    variance < CONVERGENCE_VARIANCE_MAX
  ) {
    warnedConvergence.add(model)
    console.warn(
      `[tokenCalibration] ${model}: factor ${finalFactor.toFixed(3)} ` +
      `converged to 1.0 with near-zero variance after ${sampleCount} samples — ` +
      `possible calibration probe`
    )
  }

  entries[model] = {
    factor: finalFactor,
    samples: sampleCount,
    variance,
    anomalies: prior?.anomalies ?? 0,
    consecutiveAnomalies: 0,
    lastReset: prior?.lastReset ?? 0
  }
  persist()
}

/** Snapshot for diagnostics — what the app has learned about each model so far. */
export function getCalibrationReport(): Record<string, CalibrationEntry> {
  return { ...load() }
}

// ---------------------------------------------------------------------------
// Budget-poisoning health diagnostics
// ---------------------------------------------------------------------------

export interface CalibrationHealth {
  model: string
  factor: number
  samples: number
  stddev: number
  anomalies: number
  anomalyRate: number
  lastReset: number
  /** True when the entry looks suspicious and might merit investigation. */
  suspicious: boolean
  /** Human-readable explanation when suspicious is true. */
  reason?: string
}

/**
 * Return a health snapshot for a single model. `null` when the model has no
 * calibration data yet.
 */
export function getCalibrationHealth(model: string): CalibrationHealth | null {
  if (!model) return null
  const entry = load()[model]
  if (!entry) return null

  const stddev = Math.sqrt(entry.variance)
  const totalAttempts = entry.samples + entry.anomalies
  const anomalyRate = totalAttempts > 0 ? entry.anomalies / totalAttempts : 0

  let suspicious = false
  const reasons: string[] = []

  // Convergence hallucination: perfectly-on-1.0 with near-zero variance after
  // enough samples is unlikely with proxy tokenizers.
  if (
    entry.samples >= MIN_CONVERGENCE_SAMPLES &&
    Math.abs(entry.factor - 1) < CONVERGENCE_EPSILON &&
    entry.variance < CONVERGENCE_VARIANCE_MAX
  ) {
    suspicious = true
    reasons.push(
      `factor ${entry.factor.toFixed(3)} at 1.0 with near-zero variance after ` +
      `${entry.samples} samples — possible calibration probe`
    )
  }

  // High anomaly rate suggests active manipulation or model mismatch.
  if (entry.anomalies > 0 && anomalyRate > MAX_ANOMALY_RATE) {
    suspicious = true
    reasons.push(
      `anomaly rate ${(anomalyRate * 100).toFixed(1)}% exceeds threshold ` +
      `${(MAX_ANOMALY_RATE * 100).toFixed(0)}%`
    )
  }

  // High stddev relative to factor indicates a noisy signal that may not be
  // trustworthy.
  if (entry.samples >= MIN_OUTLIER_SAMPLES && entry.variance > 0 && stddev / entry.factor > 0.3) {
    suspicious = true
    reasons.push(
      `relative stddev ${(stddev / entry.factor * 100).toFixed(1)}% is high ` +
      `— calibration may be unreliable`
    )
  }

  return {
    model,
    factor: entry.factor,
    samples: entry.samples,
    stddev,
    anomalies: entry.anomalies,
    anomalyRate,
    lastReset: entry.lastReset,
    suspicious,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined
  }
}

/**
 * Return health snapshots for all tracked models. Convenience wrapper around
 * getCalibrationHealth.
 */
export function getCalibrationHealthReport(): CalibrationHealth[] {
  const entries = load()
  return Object.keys(entries)
    .map(getCalibrationHealth)
    .filter((h): h is CalibrationHealth => h !== null)
}

/**
 * Hard-reset a single model's calibration data. Useful when the health check
 * finds a suspicious entry and the caller wants to start fresh without
 * affecting other models.
 */
export function resetModelCalibration(model: string): void {
  if (!model) return
  const entries = load()
  if (entries[model]) {
    delete entries[model]
    persist()
  }
}

// ---------------------------------------------------------------------------
// Per-feature EWMA baseline tracking for anomaly detection.
// When a feature's input token count spikes >3σ above its rolling mean,
// it may indicate a bug or adversarial input.
// ---------------------------------------------------------------------------

const FEATURE_STORAGE_KEY = 'versatile.featureBaseline.v1'

const FEATURE_EWMA_ALPHA = 0.15

const MIN_ANOMALY_SAMPLES = 3

export interface FeatureBaseline {
  mean: number
  variance: number
  samples: number
}

let featureCache: Record<string, FeatureBaseline> | null = null

function loadFeatureBaselines(): Record<string, FeatureBaseline> {
  if (featureCache) return featureCache
  featureCache = {}
  const store = storage()
  if (!store) return featureCache
  try {
    const raw = store.getItem(FEATURE_STORAGE_KEY)
    if (!raw) return featureCache
    const parsed = JSON.parse(raw)
    for (const [feature, entry] of Object.entries(parsed || {})) {
      const e = entry as Partial<FeatureBaseline>
      if (typeof e?.mean === 'number' && typeof e?.variance === 'number') {
        featureCache[feature] = {
          mean: e.mean,
          variance: e.variance,
          samples: typeof e.samples === 'number' ? e.samples : 1
        }
      }
    }
  } catch {
    featureCache = {}
  }
  return featureCache
}

function persistFeatureBaselines(): void {
  const store = storage()
  if (!store || !featureCache) return
  try {
    store.setItem(FEATURE_STORAGE_KEY, JSON.stringify(featureCache))
  } catch {
    // Best effort.
  }
}

export function recordFeatureTokens(feature: string, tokenCount: number): void {
  if (!feature || !Number.isFinite(tokenCount) || tokenCount <= 0) return

  const entries = loadFeatureBaselines()
  const prior = entries[feature]

  if (!prior) {
    entries[feature] = { mean: tokenCount, variance: 0, samples: 1 }
  } else {
    const mean = prior.mean * (1 - FEATURE_EWMA_ALPHA) + tokenCount * FEATURE_EWMA_ALPHA
    const diff = Math.abs(tokenCount - prior.mean)
    const variance = prior.variance * (1 - FEATURE_EWMA_ALPHA) + diff * diff * FEATURE_EWMA_ALPHA

    entries[feature] = {
      mean,
      variance,
      samples: prior.samples + 1
    }
  }
  persistFeatureBaselines()
}

export function getFeatureBaseline(feature: string): FeatureBaseline | null {
  if (!feature) return null
  return loadFeatureBaselines()[feature] ?? null
}

export function isFeatureAnomaly(
  feature: string,
  tokenCount: number
): { isAnomaly: boolean; baseline: number; stddev: number; samples: number } | null {
  if (!feature || !Number.isFinite(tokenCount)) return null
  const baseline = getFeatureBaseline(feature)
  if (!baseline || baseline.samples < MIN_ANOMALY_SAMPLES) return null
  const stddev = Math.sqrt(baseline.variance)
  if (stddev <= 0) return null
  const deviation = Math.abs(tokenCount - baseline.mean) / stddev
  return {
    isAnomaly: deviation > 3,
    baseline: baseline.mean,
    stddev,
    samples: baseline.samples
  }
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
