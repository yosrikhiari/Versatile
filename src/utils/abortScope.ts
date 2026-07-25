/**
 * Pure utilities for the generation abort/stop lifecycle.
 *
 * Every scope owns its own AbortController, so multiple generation runs don't
 * interfere. (Migrated to TypeScript — M-7.1.)
 */
export interface AbortScope {
  ensure(): AbortController
  signal(): AbortSignal | undefined
  isAborted(): boolean
  throwIfAborted(): void
  cancel(): boolean
  reset(): void
}

export function createAbortScope(): AbortScope {
  let controller: AbortController | null = null

  function ensure(): AbortController {
    if (!controller) controller = new AbortController()
    return controller
  }

  function signal(): AbortSignal | undefined {
    return controller?.signal
  }

  function isAborted(): boolean {
    return !!controller?.signal.aborted
  }

  function throwIfAborted(): void {
    if (isAborted()) {
      const err = new Error('Generation cancelled')
      err.name = 'AbortError'
      throw err
    }
  }

  function cancel(): boolean {
    if (!controller || controller.signal.aborted) return false
    controller.abort()
    return true
  }

  function reset(): void {
    controller = null
  }

  return { signal, isAborted, throwIfAborted, cancel, reset, ensure }
}

export function isAbortError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null | undefined
  return err?.name === 'AbortError' || /cancel/i.test(err?.message || '')
}
