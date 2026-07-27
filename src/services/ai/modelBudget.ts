// Turns a model's context window into the two numbers a generation call needs:
// how much assembled input may occupy, and what max_tokens to ask for.
//
// Before this, every provider sent `max_tokens: 4096` regardless of model or
// input size. On an 8K-window model (gpt-4, gemma2-9b-it, gpt-oss-20b) a 6K-token
// prompt plus 4096 requested output exceeds the window and the provider returns
// a hard 400. On a 200K-window model the same 4096 leaves most of the window
// unused. Deriving it from the window fixes both directions.

import { MODEL_META } from '../../config/modelRouting'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  FALLBACK_CONTEXT_WINDOW,
  INPUT_BUDGET_RATIO,
  MAX_OUTPUT_TOKENS_CAP,
  MIN_OUTPUT_TOKENS,
  OUTPUT_HEADROOM_RATIO
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
 * What a provider call should send. An explicit caller value always wins — call
 * sites that already reason about their own output length (scene generation
 * sizes max_tokens from the target word count) know better than the window math.
 */
export function resolveMaxTokens(model: string, inputTokens: number, explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit
  }
  return maxOutputTokensForModel(model, inputTokens)
}

export interface BudgetOverflow {
  model: string
  budget: number
  inputTokens: number
  overflowTokens: number
}

/**
 * Reports whether assembled input exceeds what the model can take. Returns the
 * overflow instead of trimming: only the caller knows which block is safe to
 * drop, and silently truncating prose mid-scene is how context bugs hide.
 */
export function checkInputBudget(model: string, inputTokens: number): BudgetOverflow | null {
  const budget = inputBudgetForModel(model)
  if (inputTokens <= budget) return null
  return { model, budget, inputTokens, overflowTokens: inputTokens - budget }
}
