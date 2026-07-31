// Turns a model's context window into the two numbers a generation call needs:
// how much assembled input may occupy, and what max_tokens to ask for.
//
// Before this, every provider sent `max_tokens: 4096` regardless of model or
// input size. On an 8K-window model (gpt-4, gemma2-9b-it, gpt-oss-20b) a 6K-token
// prompt plus 4096 requested output exceeds the window and the provider returns
// a hard 400. On a 200K-window model the same 4096 leaves most of the window
// unused. Deriving it from the window fixes both directions.

import { InputBudgetExceededError } from './tokenLimitError'
import { MODEL_META } from '../../config/modelRouting'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  FALLBACK_CONTEXT_WINDOW,
  INPUT_BUDGET_RATIO,
  MAX_OUTPUT_TOKENS_CAP,
  MIN_OUTPUT_TOKENS,
  OUTPUT_HEADROOM_RATIO,
  SCHEMA_OVERHEAD_ESTIMATE_RATIO
} from '../../config/generationLimits'

/** Context window in tokens, or null when we have no data for this model. */
export function getContextWindow(model: string): number | null {
  if (!model) return null
  const meta = MODEL_META[model as keyof typeof MODEL_META]
  return meta?.contextWindow ?? null
}

/**
 * How many tokens of assembled context this model may receive. Unknown models
 * get the smallest window we know of rather than a generous default — under-
 * filling wastes capacity, over-filling fails the call.
 */
export function inputBudgetForModel(model: string): number {
  const window = getContextWindow(model) ?? FALLBACK_CONTEXT_WINDOW
  return Math.floor(window * INPUT_BUDGET_RATIO)
}

/**
 * max_tokens for a call whose input is `inputTokens`. Bounded below so output is
 * never cut mid-sentence, and above by MAX_OUTPUT_TOKENS_CAP so a looping
 * generation cannot bill an entire context window.
 *
 * Unknown models keep the historical flat 4096 — we have no window to reason
 * about, and changing their behaviour is not this function's job.
 */
export function maxOutputTokensForModel(model: string, inputTokens: number): number {
  const window = getContextWindow(model)
  if (window === null) return DEFAULT_MAX_OUTPUT_TOKENS

  const remaining = window - Math.max(0, inputTokens)
  const withHeadroom = Math.floor(remaining * OUTPUT_HEADROOM_RATIO)
  return Math.min(Math.max(withHeadroom, MIN_OUTPUT_TOKENS), MAX_OUTPUT_TOKENS_CAP)
}

/**
 * Rough token cost of the JSON envelope for a structured-output schema.
 * Based on serialising the schema (keys, types, structural braces) — the
 * parts that appear in every instance regardless of content length.
 */
export function estimateSchemaOverhead(schema: Record<string, unknown> | undefined): number {
  if (!schema) return 0
  const json = JSON.stringify(schema)
  return Math.ceil(json.length / SCHEMA_OVERHEAD_ESTIMATE_RATIO)
}

/**
 * What a provider call should send. An explicit caller value always wins — call
 * sites that already reason about their own output length (scene generation
 * sizes max_tokens from the target word count) know better than the window math.
 *
 * When no explicit value is given, adds `schemaOverhead` to the window-derived
 * result so structured-output calls get extra headroom for JSON envelope tokens
 * (keys, braces, quotes) that aren't part of the content the call site estimated.
 */
export function resolveMaxTokens(model: string, inputTokens: number, explicit?: number, schemaOverhead?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit
  }
  const base = maxOutputTokensForModel(model, inputTokens)
  if (schemaOverhead && schemaOverhead > 0) {
    return Math.min(base + schemaOverhead, MAX_OUTPUT_TOKENS_CAP)
  }
  return base
}

export interface BudgetOverflow {
  model: string
  budget: number
  inputTokens: number
  overflowTokens: number
}

/**
 * Throws InputBudgetExceededError when assembled input exceeds what the model
 * can physically accept (the full context window). The 67 % budget ratio from
 * inputBudgetForModel is advisory — exceeding it generates a warning returned
 * here; exceeding the hard context window is a blocking error.
 *
 * We do not trim silently: only the caller knows which block is safe to drop,
 * and truncating prose mid-scene is how context bugs hide.
 */
export function checkInputBudget(model: string, inputTokens: number): BudgetOverflow | null {
  const budget = inputBudgetForModel(model)
  const window = getContextWindow(model)

  if (window !== null && inputTokens > window) {
    throw new InputBudgetExceededError(
      `[modelBudget] ${model}: input is ${inputTokens} tokens, ` +
      `exceeds context window of ${window}`,
      model,
      inputTokens,
      window
    )
  }

  if (inputTokens <= budget) return null
  return { model, budget, inputTokens, overflowTokens: inputTokens - budget }
}
