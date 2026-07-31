import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailRunResult } from '../types'

/**
 * Pre-write validation for the persistence layer. Synchronous — a DB write
 * path must not gain an await boundary it did not already have.
 */
export function useStorageGuardrails() {
  function validateStorageWrite(context: Omit<GuardrailContext, 'layer'>): GuardrailRunResult {
    return GuardrailRegistry.runSync({ ...context, layer: 'storage_write' })
  }

  return { validateStorageWrite }
}
