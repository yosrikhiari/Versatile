import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailRunResult } from '../types'

/**
 * Pre-push validation for the sync layer.
 */
export function useSyncGuardrails() {
  function validateSync(context: Omit<GuardrailContext, 'layer'>): GuardrailRunResult {
    return GuardrailRegistry.runSync({ ...context, layer: 'sync' })
  }

  return { validateSync }
}
