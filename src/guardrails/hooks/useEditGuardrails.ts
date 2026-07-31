import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailRunResult } from '../types'

/**
 * User-edit validation. Synchronous so form save handlers can gate on the
 * result without an await boundary.
 */
export function useEditGuardrails() {
  function validateEdit(context: Omit<GuardrailContext, 'layer'>): GuardrailRunResult {
    return GuardrailRegistry.runSync({ ...context, layer: 'user_edit' })
  }

  return { validateEdit }
}
