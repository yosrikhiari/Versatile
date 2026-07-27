import { FEATURES } from '../config/ai'

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

export const DEFAULT_LATENCY_BUDGETS: Record<string, { warn: number; block: number }> = {
  [FEATURES.SPARK]: { warn: 15_000, block: 45_000 },
  [FEATURES.POLISH]: { warn: 20_000, block: 60_000 },
  [FEATURES.CONTENT]: { warn: 30_000, block: 90_000 },
  [FEATURES.WORLDBUILDING]: { warn: 20_000, block: 60_000 },
  [FEATURES.COMPACTION]: { warn: 15_000, block: 45_000 },
  [FEATURES.STORY_GENERATION]: { warn: 60_000, block: 180_000 },
  [FEATURES.NETWORK]: { warn: 10_000, block: 30_000 },
  [FEATURES.TAGGING]: { warn: 10_000, block: 30_000 },
  [FEATURES.CHARACTER_CHAT]: { warn: 15_000, block: 45_000 },
  [FEATURES.POV_WRITING]: { warn: 30_000, block: 90_000 },
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

    if (budget.block && elapsedMs > budget.block) {
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
