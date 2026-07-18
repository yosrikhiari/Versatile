/**
 * Pure utilities for the generation abort/stop lifecycle.
 *
 * Every function is bound to its own AbortController, so multiple
 * generation runs don't interfere.
 */
export function createAbortScope() {
  let controller = null

  function ensure() {
    if (!controller) controller = new AbortController()
    return controller
  }

  function signal() {
    return controller?.signal
  }

  function isAborted() {
    return !!controller?.signal.aborted
  }

  function throwIfAborted() {
    if (isAborted()) {
      const err = new Error('Generation cancelled')
      err.name = 'AbortError'
      throw err
    }
  }

  function cancel() {
    if (!controller || controller.signal.aborted) return false
    controller.abort()
    return true
  }

  function reset() {
    controller = null
  }

  return { signal, isAborted, throwIfAborted, cancel, reset, ensure }
}

export function isAbortError(e) {
  return e?.name === 'AbortError' || /cancel/i.test(e?.message || '')
}
