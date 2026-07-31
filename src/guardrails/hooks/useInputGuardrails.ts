import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailRunResult } from '../types'

/**
 * Pre-call prompt validation. Synchronous by design: this sits in front of
 * every provider call, and every guard on the `ai_input` layer is cheap.
 */
export function useInputGuardrails() {
  function validateInput(context: Omit<GuardrailContext, 'layer'>): GuardrailRunResult {
    return GuardrailRegistry.runSync({ ...context, layer: 'ai_input' })
  }

  return { validateInput }
}
