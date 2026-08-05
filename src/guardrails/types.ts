export type GuardrailKind =
  | 'entity'
  | 'relationship'
  | 'schema_conformance'
  | 'fact_canon'
  | 'content_safety'
  | 'pii_leakage'
  | 'cross_turn_consistency'
  | 'cache_integrity'
  | 'input'
  | 'quality'
  | 'circuit_breaker'
  | 'integrity'
  | 'character_name'

export type GuardrailCategory = 'structural' | 'semantic' | 'operational'

/**
 * Runtime cost of a guard. `llm` guards are metered against a per-session
 * budget; `O(1)` and `O(n)` guards run unconditionally.
 *
 * This reflects what a guard *actually does*, not what it conceptually checks —
 * a heuristic fact-canon guard is `O(n)`, and only an LLM-backed replacement
 * should register as `llm`. Registering a cheap guard as `llm` would silently
 * retire it once the session budget ran out.
 */
export type GuardrailCost = 'O(1)' | 'O(n)' | 'llm'

export type GuardrailSeverity = 'blocking' | 'detective'

export type GuardrailLayer =
  | 'ai_output'
  | 'ai_input'
  | 'user_edit'
  | 'storage_write'
  | 'sync'

export interface GuardrailResult {
  kind: GuardrailKind
  passed: boolean
  severity: GuardrailSeverity
  message: string
  details?: Record<string, unknown>
  layer: GuardrailLayer
  contextId?: string
  timestamp: number
  /** Stamped by the registry from the guard's registration. */
  category?: GuardrailCategory
  /** Wall-clock time of the guard that produced this result. Stamped by the registry. */
  durationMs?: number
  /** Stamped by the registry from `GuardrailContext.entryPoint`, for cost attribution. */
  entryPoint?: string
}

export interface GuardrailEvent {
  id: string
  kind: GuardrailKind
  category?: GuardrailCategory
  layer: GuardrailLayer
  result: GuardrailResult
  context: Record<string, unknown>
  resolved: boolean
}

export interface GuardrailContext {
  layer: GuardrailLayer
  data: unknown
  /** Originating composable/function, e.g. `useStoryWriter.writeScene`. Enables cost attribution. */
  entryPoint?: string
  /** Restricts the run to these kinds. When omitted, every guard registered for `layer` runs. */
  kinds?: GuardrailKind[]
  turnType?: string
  provider?: string
  sessionId?: string
  sceneId?: string
  /** Cache key under validation — read by the cache-integrity guard. */
  cacheKey?: string
  /** JSON schema the payload must conform to — read by the schema guard. */
  schema?: unknown
  /** Prior turns for cross-turn consistency checks. */
  priorTurns?: unknown[]
  metadata?: Record<string, unknown>
}

export interface GuardrailRunResult {
  passed: boolean
  results: GuardrailResult[]
  blocking: GuardrailResult[]
  detective: GuardrailResult[]
  /** Kinds that did not run because their per-session LLM budget was exhausted. */
  skipped: GuardrailKind[]
  durationMs: number
}

export type GuardFunction = (
  context: GuardrailContext
) => GuardrailResult[] | Promise<GuardrailResult[]>

export interface GuardMeta {
  category: GuardrailCategory
  cost: GuardrailCost
  /** Layers this guard applies to. A guard never runs on a layer outside this list. */
  layers: GuardrailLayer[]
}

export interface GuardRegistration extends GuardMeta {
  kind: GuardrailKind
  guard: GuardFunction
}
