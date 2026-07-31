import { STORAGE_KEYS } from '../config/storageKeys'

/**
 * Predicts how long a generation run will actually take, from measured
 * throughput rather than assumption.
 *
 * The generator happily accepts "10 chapters x 10,000 words" with no indication
 * that, on a machine where the model runs partly on CPU, that is a six-hour job.
 * The user finds out by watching it not finish. Throughput varies by more than
 * an order of magnitude across setups — a 4 GB GPU running an 8B model at ~6
 * tok/s versus a 3.8B model that fits in VRAM at ~13 — so a hardcoded constant
 * would be wrong for almost everyone. We measure instead.
 */

/** Output tokens per word of English prose. */
const TOKENS_PER_WORD = 1.35

/**
 * Assumed tokens/second before this machine has been measured. Deliberately
 * optimistic-but-plausible for a small local model; the first few real calls
 * replace it, and estimates are flagged provisional until then.
 */
const DEFAULT_TOKENS_PER_SECOND = 12

/** Weight of each new sample in the running average. */
const EWMA_ALPHA = 0.25

/** Ignore samples too small to time meaningfully. */
const MIN_SAMPLE_TOKENS = 40

/** Non-prose overhead per scene: metadata extraction, critique, eval, commit. */
const OVERHEAD_TOKENS_PER_SCENE = 900
/** Planning + spine cost per chapter, before a word of prose is written. */
const OVERHEAD_TOKENS_PER_CHAPTER = 500

export interface ThroughputRecord {
  tokensPerSecond: number
  samples: number
}

type Store = Record<string, ThroughputRecord>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MODEL_THROUGHPUT)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEYS.MODEL_THROUGHPUT, JSON.stringify(store))
  } catch {
    // Throughput history is an optimisation; losing it must never break a run.
  }
}

/**
 * Fold one observed generation into the running average for `model`.
 * Silently ignores samples that cannot yield a meaningful rate.
 */
export function recordThroughput(model: string, completionTokens: number, durationMs: number) {
  if (!model || !(completionTokens >= MIN_SAMPLE_TOKENS) || !(durationMs > 0)) return
  const rate = completionTokens / (durationMs / 1000)
  if (!Number.isFinite(rate) || rate <= 0) return

  const store = readStore()
  const prev = store[model]
  store[model] = prev
    ? {
        tokensPerSecond: prev.tokensPerSecond * (1 - EWMA_ALPHA) + rate * EWMA_ALPHA,
        samples: prev.samples + 1
      }
    : { tokensPerSecond: rate, samples: 1 }
  writeStore(store)
}

export function getThroughput(model: string): ThroughputRecord | null {
  if (!model) return null
  return readStore()[model] || null
}

export interface RunEstimate {
  /** Predicted wall-clock milliseconds. */
  ms: number
  tokensPerSecond: number
  /** False until this machine has been measured; the figure is a guess. */
  measured: boolean
  samples: number
}

/**
 * Estimate a run from its shape. Counts the non-prose passes too — planning,
 * spine, per-scene metadata and critique are a real fraction of a run's cost and
 * omitting them is how an estimate ends up cheerfully wrong.
 */
export function estimateRun({
  totalWords,
  scenes = 0,
  chapters = 0,
  model = ''
}: {
  totalWords: number
  scenes?: number
  chapters?: number
  model?: string
}): RunEstimate {
  const record = getThroughput(model)
  const tokensPerSecond = record?.tokensPerSecond || DEFAULT_TOKENS_PER_SECOND

  const proseTokens = Math.max(0, totalWords) * TOKENS_PER_WORD
  const overheadTokens =
    Math.max(0, scenes) * OVERHEAD_TOKENS_PER_SCENE +
    Math.max(0, chapters) * OVERHEAD_TOKENS_PER_CHAPTER

  return {
    ms: ((proseTokens + overheadTokens) / tokensPerSecond) * 1000,
    tokensPerSecond,
    measured: !!record,
    samples: record?.samples || 0
  }
}

/** Human-readable duration: "45 min", "2h 20m". */
export function formatDuration(ms: number): string {
  if (ms < 60000) return 'under a minute'
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

/** Runs longer than this are worth warning about before they are started. */
export const LONG_RUN_WARNING_MS = 45 * 60 * 1000

export { TOKENS_PER_WORD, DEFAULT_TOKENS_PER_SECOND }
