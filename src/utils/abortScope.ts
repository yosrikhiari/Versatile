/**
 * Pure utilities for the generation abort/stop lifecycle.
 *
 * Every scope owns its own AbortController, so multiple generation runs don't
 * interfere. (Migrated to TypeScript — M-7.1.)
 */
export interface AbortScope {
  ensure(): AbortController
  renew(): AbortController
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

  /**
   * A controller for a NEW run, guaranteed not already aborted.
   *
   * `ensure()` cannot do this: it keeps whatever controller exists, and after a
   * `cancel()` that controller stays aborted for the life of the scope. A run
   * started after a stop therefore inherited the stop — the first
   * `throwIfAborted()` guard threw before any work began. Only a full `reset()`
   * cleared it, which is why stopping used to mean discarding the run state as
   * well as the run.
   */
  function renew(): AbortController {
    controller = new AbortController()
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

  return { signal, isAborted, throwIfAborted, cancel, reset, ensure, renew }
}

export function isAbortError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null | undefined
  return err?.name === 'AbortError' || /cancel/i.test(err?.message || '')
}
