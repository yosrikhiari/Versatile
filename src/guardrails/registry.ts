import type {
  GuardrailKind,
  GuardrailResult,
  GuardrailEvent,
  GuardrailContext,
  GuardrailRunResult,
  GuardFunction,
  GuardMeta,
  GuardRegistration,
} from './types'

/**
 * Default category/cost/layer metadata per guard kind.
 *
 * `layers` is what stops a guard from firing on data it knows nothing about —
 * without it, a sync-integrity check would also run the entity guard.
 */
const DEFAULT_META: Record<GuardrailKind, GuardMeta> = {
  entity: { category: 'structural', cost: 'O(1)', layers: ['ai_output', 'user_edit'] },
  relationship: { category: 'structural', cost: 'O(1)', layers: ['ai_output', 'user_edit'] },
  schema_conformance: { category: 'structural', cost: 'O(1)', layers: ['ai_output'] },
  cross_turn_consistency: { category: 'structural', cost: 'O(1)', layers: ['ai_output'] },
  cache_integrity: { category: 'structural', cost: 'O(1)', layers: ['ai_output', 'storage_write'] },
  content_safety: { category: 'semantic', cost: 'O(n)', layers: ['ai_output'] },
  pii_leakage: { category: 'semantic', cost: 'O(n)', layers: ['ai_output'] },
  fact_canon: { category: 'semantic', cost: 'O(n)', layers: ['ai_output'] },
  quality: { category: 'semantic', cost: 'O(n)', layers: ['ai_output'] },
  input: { category: 'structural', cost: 'O(n)', layers: ['ai_input'] },
  circuit_breaker: { category: 'operational', cost: 'O(1)', layers: ['ai_input', 'ai_output'] },
  integrity: { category: 'operational', cost: 'O(1)', layers: ['storage_write', 'sync'] },
  character_name: { category: 'structural', cost: 'O(1)', layers: ['ai_output'] },
}

const DEFAULT_LLM_BUDGET = 25

const listeners = new Set<(event: GuardrailEvent) => void>()
const guards = new Map<GuardrailKind, GuardRegistration>()
const spendByKind = new Map<GuardrailKind, number>()

let llmBudget = DEFAULT_LLM_BUDGET
let eventCounter = 0

export const GuardrailRegistry = {
  /**
   * Register a guard. `meta` overrides the per-kind defaults — pass
   * `{ cost: 'llm' }` for a guard that makes model calls so it gets metered.
   */
  register(kind: GuardrailKind, guard: GuardFunction, meta: Partial<GuardMeta> = {}): void {
    const base = DEFAULT_META[kind]
    guards.set(kind, {
      kind,
      guard,
      category: meta.category ?? base.category,
      cost: meta.cost ?? base.cost,
      layers: meta.layers ?? base.layers,
    })
  },

  unregister(kind: GuardrailKind): void {
    guards.delete(kind)
  },

  registeredKinds(): GuardrailKind[] {
    return [...guards.keys()]
  },

  /**
   * Run every guard registered for `context.layer`, awaiting async guards.
   * Guard failures are isolated: a guard that throws yields a detective result
   * rather than taking down the surrounding generation.
   */
  async run(context: GuardrailContext): Promise<GuardrailRunResult> {
    const startedAt = now()
    const results: GuardrailResult[] = []
    const skipped: GuardrailKind[] = []

    for (const reg of selectGuards(context)) {
      if (reg.cost === 'llm' && !hasBudget(reg.kind)) {
        skipped.push(reg.kind)
        continue
      }

      const guardStart = now()
      try {
        const raw = await reg.guard(context)
        if (reg.cost === 'llm') recordSpend(reg.kind)
        results.push(...enrich(raw, reg, context, now() - guardStart))
      } catch (err) {
        results.push(guardErrorResult(reg, context, err, now() - guardStart))
      }
    }

    return finalize(results, context, skipped, now() - startedAt)
  },

  /**
   * Synchronous variant for hot paths that cannot await. Skips `llm`-cost
   * guards entirely — they are reported in `skipped`.
   */
  runSync(context: GuardrailContext): GuardrailRunResult {
    const startedAt = now()
    const results: GuardrailResult[] = []
    const skipped: GuardrailKind[] = []

    for (const reg of selectGuards(context)) {
      if (reg.cost === 'llm') {
        skipped.push(reg.kind)
        continue
      }

      const guardStart = now()
      try {
        const raw = reg.guard(context)
        if (raw instanceof Promise) {
          // A guard registered as cheap returned a promise — it cannot be
          // resolved here, so report it rather than silently dropping it.
          skipped.push(reg.kind)
          continue
        }
        results.push(...enrich(raw, reg, context, now() - guardStart))
      } catch (err) {
        results.push(guardErrorResult(reg, context, err, now() - guardStart))
      }
    }

    return finalize(results, context, skipped, now() - startedAt)
  },

  onEvent(cb: (event: GuardrailEvent) => void): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  /** Per-kind count of metered (`llm`) guard invocations this session. */
  getSessionCost(): Partial<Record<GuardrailKind, number>> {
    return Object.fromEntries(spendByKind) as Partial<Record<GuardrailKind, number>>
  },

  hasBudgetRemaining(kind: GuardrailKind): boolean {
    return hasBudget(kind)
  },

  setLlmBudget(budget: number): void {
    llmBudget = Math.max(0, budget)
  },

  resetSessionCost(): void {
    spendByKind.clear()
  },

  /**
   * Unregisters every guard and resets budget state.
   *
   * Deliberately leaves event listeners alone: subscribers own their own
   * teardown via the handle `onEvent` returns, and consumers that subscribe at
   * module scope (the reporting feed) subscribe exactly once — dropping them
   * here would silence the feed for the rest of the session with no way back.
   */
  clear(): void {
    guards.clear()
    spendByKind.clear()
    llmBudget = DEFAULT_LLM_BUDGET
  },

  /** Drops all event subscribers. For tests that need a clean listener set. */
  clearListeners(): void {
    listeners.clear()
  },
}

function selectGuards(context: GuardrailContext): GuardRegistration[] {
  const selected: GuardRegistration[] = []
  for (const reg of guards.values()) {
    if (!reg.layers.includes(context.layer)) continue
    if (context.kinds && !context.kinds.includes(reg.kind)) continue
    selected.push(reg)
  }
  return selected
}

function enrich(
  raw: GuardrailResult[],
  reg: GuardRegistration,
  context: GuardrailContext,
  durationMs: number
): GuardrailResult[] {
  return raw.map(r => ({
    ...r,
    category: r.category ?? reg.category,
    durationMs: r.durationMs ?? durationMs,
    entryPoint: r.entryPoint ?? context.entryPoint,
  }))
}

function guardErrorResult(
  reg: GuardRegistration,
  context: GuardrailContext,
  err: unknown,
  durationMs: number
): GuardrailResult {
  return {
    kind: reg.kind,
    passed: false,
    severity: 'detective',
    message: `Guard "${reg.kind}" threw: ${err instanceof Error ? err.message : String(err)}`,
    details: { error: err instanceof Error ? err.message : String(err) },
    layer: context.layer,
    contextId: context.sceneId,
    timestamp: Date.now(),
    category: reg.category,
    durationMs,
    entryPoint: context.entryPoint,
  }
}

function finalize(
  results: GuardrailResult[],
  context: GuardrailContext,
  skipped: GuardrailKind[],
  durationMs: number
): GuardrailRunResult {
  const blocking = results.filter(r => !r.passed && r.severity === 'blocking')
  const detective = results.filter(r => !r.passed && r.severity === 'detective')

  for (const result of results) {
    if (!result.passed) {
      emitEvent({
        id: `gr-${++eventCounter}-${Date.now()}`,
        kind: result.kind,
        category: result.category,
        layer: context.layer,
        result,
        context: context as unknown as Record<string, unknown>,
        resolved: false,
      })
    }
  }

  return { passed: blocking.length === 0, results, blocking, detective, skipped, durationMs }
}

function hasBudget(kind: GuardrailKind): boolean {
  return (spendByKind.get(kind) ?? 0) < llmBudget
}

function recordSpend(kind: GuardrailKind): void {
  spendByKind.set(kind, (spendByKind.get(kind) ?? 0) + 1)
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function emitEvent(event: GuardrailEvent): void {
  for (const cb of listeners) {
    try {
      cb(event)
    } catch {
      // swallow listener errors
    }
  }
}
