import { GuardrailRegistry } from '../registry'
import { digest } from '../guards/cacheGuard'
import type { GuardrailResult, GuardrailRunResult } from '../types'

/**
 * How guardrail failures are enforced.
 *
 * - `off`        — guards do not run at all.
 * - `detective`  — guards run, results are emitted to the reporting feed, nothing throws.
 * - `blocking`   — a failing *blocking* guard aborts the call.
 *
 * Defaults to `detective`. Blocking enforcement changes the failure mode of
 * every AI call in the app, so it is opt-in per deployment rather than a
 * silent default.
 */
export type GuardrailEnforcement = 'off' | 'detective' | 'blocking'

let enforcement: GuardrailEnforcement = 'detective'

export function setGuardrailEnforcement(mode: GuardrailEnforcement): void {
  enforcement = mode
}

export function getGuardrailEnforcement(): GuardrailEnforcement {
  return enforcement
}

export class GuardrailBlockedError extends Error {
  readonly results: GuardrailResult[]
  readonly kinds: string[]

  constructor(results: GuardrailResult[]) {
    const summary = results.map(r => r.message).join('; ')
    super(`Blocked by guardrails: ${summary}`)
    this.name = 'GuardrailBlockedError'
    this.results = results
    this.kinds = [...new Set(results.map(r => r.kind))]
  }
}

/** Throws when enforcement is `blocking` and a blocking guard failed. */
function enforce(run: GuardrailRunResult): GuardrailRunResult {
  if (enforcement === 'blocking' && run.blocking.length > 0) {
    throw new GuardrailBlockedError(run.blocking)
  }
  return run
}

const NOOP: GuardrailRunResult = {
  passed: true,
  results: [],
  blocking: [],
  detective: [],
  skipped: [],
  durationMs: 0,
}

/**
 * Pre-call prompt validation plus circuit-breaker state.
 *
 * Synchronous: this runs in front of every provider call and must not add an
 * await boundary to paths that did not have one.
 */
export function guardPrompt(input: {
  prompt: string
  systemPrompt: string
  provider: string
  feature?: string
  entryPoint?: string
}): GuardrailRunResult {
  if (enforcement === 'off') return NOOP

  return enforce(
    GuardrailRegistry.runSync({
      layer: 'ai_input',
      kinds: ['input', 'circuit_breaker'],
      data: { prompt: input.prompt, systemPrompt: input.systemPrompt },
      provider: input.provider,
      entryPoint: input.entryPoint ?? `aiService.${input.feature ?? 'generate'}`,
    })
  )
}

/** Validates a structured result against the schema the caller asked for. */
export function guardStructuredOutput(input: {
  data: unknown
  schema: unknown
  provider?: string
  entryPoint?: string
}): GuardrailRunResult {
  if (enforcement === 'off' || !input.schema) return NOOP

  return enforce(
    GuardrailRegistry.runSync({
      layer: 'ai_output',
      kinds: ['schema_conformance'],
      data: input.data,
      schema: input.schema,
      provider: input.provider,
      entryPoint: input.entryPoint ?? 'aiService.aiGenerateStructured',
    })
  )
}

/**
 * Validates a cache entry before it is written.
 *
 * Returns the digest to store alongside the value so a later read can verify
 * the pairing — see `createCacheGuard`.
 */
export function guardCacheWrite(input: {
  key: string
  value: unknown
  provider?: string
}): { run: GuardrailRunResult; digest: string } {
  const valueDigest = digest(input.value)
  if (enforcement === 'off') return { run: NOOP, digest: valueDigest }

  const run = GuardrailRegistry.runSync({
    layer: 'storage_write',
    kinds: ['cache_integrity'],
    cacheKey: input.key,
    data: { key: input.key, value: input.value, digest: valueDigest, createdAt: Date.now() },
    provider: input.provider,
    entryPoint: 'aiService.cacheWrite',
  })

  // A failed cache write is never worth aborting a completed generation over —
  // the result is already in hand. Report it and move on.
  return { run, digest: valueDigest }
}

/**
 * Feeds a provider failure to the circuit breaker.
 *
 * Never throws: this runs inside `catch` blocks, where a second exception
 * would mask the original provider error.
 */
export function recordProviderFailure(provider: string, error: unknown): void {
  if (enforcement === 'off') return

  try {
    GuardrailRegistry.runSync({
      layer: 'ai_output',
      kinds: ['circuit_breaker'],
      data: { error: error instanceof Error ? error.message : String(error), failed: true },
      provider,
      entryPoint: 'aiService.providerError',
    })
  } catch {
    // never mask the provider error
  }
}
