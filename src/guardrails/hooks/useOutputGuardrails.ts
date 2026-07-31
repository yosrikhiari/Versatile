import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailRunResult } from '../types'

/**
 * Generic AI-output guardrails. Prefer the flow-specific hooks
 * (`useProseGuardrails`, `useEntityGuardrails`, `useEvalGuardrails`) — they
 * pin the right kind set per entry point. Use this when the caller needs to
 * choose kinds itself, or wants every output guard to run.
 */
export function useOutputGuardrails() {
  /** Runs every guard registered for `ai_output`, including metered LLM guards. */
  function validateOutput(context: Omit<GuardrailContext, 'layer'>): Promise<GuardrailRunResult> {
    return GuardrailRegistry.run({ ...context, layer: 'ai_output' })
  }

  /** Non-awaiting variant; `llm`-cost guards are skipped and reported in `skipped`. */
  function validateOutputSync(context: Omit<GuardrailContext, 'layer'>): GuardrailRunResult {
    return GuardrailRegistry.runSync({ ...context, layer: 'ai_output' })
  }

  return { validateOutput, validateOutputSync }
}
