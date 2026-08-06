import { FEATURES } from '../config/ai'
import { resolveTimeLimit } from '../config/timeLimits'

export class LatencyExceededError extends Error {
  feature: string
  elapsedMs: number
  limitMs: number

  constructor(feature: string, elapsedMs: number, limitMs: number) {
    super(`Latency budget exceeded for ${feature}: ${elapsedMs}ms > ${limitMs}ms`)
    this.name = 'LatencyExceededError'
    this.feature = feature
    this.elapsedMs = elapsedMs
    this.limitMs = limitMs
  }
}

/**
 * Thresholds calibrated against measured local-model latency, not guessed.
 *
 * Long-form prose on a consumer GPU is genuinely slow, and the previous
 * story-generation warn of 60s fired on EVERY scene: `reports/smoke-writer.json`
 * records 393 words in 225s on dolphin-mistral:7b, and `reports/writer-sweep.json`
 * records 177-271s per scene on phi4-mini:3.8b. A warning that fires every time
 * is not a warning — it trains you to ignore the log, which is how a 609s
 * director stage (`reports/director-spike-v2.json`, scene 3, ~9x its neighbours
 * and returning nothing) sat there unremarked.
 *
 * 300s therefore flags the outlier and stays quiet for the normal case.
 *
 * NOTE on `block`: `check()` throws past it, but nothing in production calls
 * `check()` — only `wrap()`, which warns. The block values are effectively
 * inert. That is deliberate for now: the old 180s story-generation block would
 * have thrown on ordinary local scenes had anything enforced it.
 */
export const DEFAULT_LATENCY_BUDGETS: Record<string, { warn: number; block: number }> = {
  [FEATURES.SPARK]: { warn: 15_000, block: 45_000 },
  [FEATURES.POLISH]: { warn: 20_000, block: 60_000 },
  [FEATURES.CONTENT]: { warn: 30_000, block: 90_000 },
  [FEATURES.WORLDBUILDING]: { warn: 20_000, block: 60_000 },
  [FEATURES.COMPACTION]: { warn: 15_000, block: 45_000 },
  [FEATURES.STORY_GENERATION]: { warn: 300_000, block: 900_000 },
  // Not a short call. The Story Network is one grammar-constrained pass over the
  // whole cast — ~1,900 output tokens for a 5-character bible, which is minutes
  // at local speeds. At 10s this warned on every single run, the failure mode
  // this file's header describes.
  [FEATURES.NETWORK]: { warn: 420_000, block: 900_000 },
  [FEATURES.TAGGING]: { warn: 10_000, block: 30_000 },
  [FEATURES.CHARACTER_CHAT]: { warn: 15_000, block: 45_000 },
  // Also long-form prose, so it lives on the same measured scale as
  // STORY_GENERATION rather than the short-call scale above.
  [FEATURES.POV_WRITING]: { warn: 300_000, block: 900_000 },
  [FEATURES.SHAPE_ANALYSIS]: { warn: 20_000, block: 60_000 },
  [FEATURES.BLURB]: { warn: 20_000, block: 60_000 }
}

export class LatencyBudget {
  budgets: Record<string, { warn: number; block: number }>

  constructor(budgets?: Record<string, { warn: number; block: number }>) {
    this.budgets = budgets ?? DEFAULT_LATENCY_BUDGETS
  }

  check(feature: string, elapsedMs: number) {
    const budget = this.budgets[feature]
    if (!budget) return { exceeded: false, blocked: false, elapsedMs }

    // The block is the only throwing path in this file; `wrap()` (what production
    // actually calls) has always been warn-only. Gated so the switch in
    // config/timeLimits governs it too, rather than leaving a live wall-clock
    // abort behind for whoever wires `check()` up later.
    if (resolveTimeLimit(budget.block) > 0 && elapsedMs > budget.block) {
      throw new LatencyExceededError(feature, elapsedMs, budget.block)
    }
    if (budget.warn && elapsedMs > budget.warn) {
      console.warn(
        `[latencyBudget] ${feature} took ${elapsedMs}ms (warn threshold ${budget.warn}ms)`
      )
      return { exceeded: true, blocked: false, elapsedMs, warnThreshold: budget.warn }
    }
    return { exceeded: false, blocked: false, elapsedMs }
  }

  wrap<T extends (...args: any[]) => any>(feature: string, fn: T): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return async (...args: Parameters<T>) => {
      const start = Date.now()
      try {
        return await fn(...args)
      } finally {
        const elapsed = Date.now() - start
        const budget = this.budgets[feature]
        if (budget && budget.warn && elapsed > budget.warn) {
          console.warn(
            `[latencyBudget] ${feature} took ${elapsed}ms (warn threshold ${budget.warn}ms)`
          )
        }
      }
    }
  }

  getThresholds(feature: string) {
    return this.budgets[feature] || null
  }
}

export const latencyBudget = new LatencyBudget()

export function __resetLatencyBudget() {}
