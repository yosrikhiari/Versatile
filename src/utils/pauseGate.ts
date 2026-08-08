import { ref, type Ref } from 'vue'

/**
 * Cooperative pause for long-running loops.
 *
 * The sibling of `abortScope`, and deliberately shaped like it: a loop calls
 * `wait()` at a boundary it considers safe, and carries straight on unless a
 * pause is in effect — in which case it parks there until something calls
 * `release()`. Nothing is thrown and nothing is torn down. That is the whole
 * difference between pausing and aborting: an abort ends the loop and loses
 * everything it was holding, a pause holds the loop exactly where it is.
 *
 * `request()` and the actual hold are separate on purpose. A click arrives
 * mid-scene; the hold has to happen at the boundary, because that is the only
 * place the loop's state is coherent. Between the two the gate reports
 * `isRequested` so the UI can say "pausing" rather than lying about "paused".
 */
export interface PauseGate {
  /** Held right now — a loop is parked, or would park on its next `wait()`. */
  isPaused: Ref<boolean>
  /** A hold was asked for but the loop has not reached a boundary yet. */
  isRequested: Ref<boolean>
  /** Ask for a hold. False if one is already pending or in effect. */
  request(): boolean
  /**
   * The gate itself. Engages a pending request (running `onEngage` once, at the
   * moment the hold takes effect), then parks until released.
   */
  wait(onEngage?: () => void | Promise<void>): Promise<void>
  /** Let a held loop continue. False if there was nothing to release. */
  release(): boolean
  /** Drop any hold and wake every parked loop, without ceremony. */
  clear(): void
  /** How many loops are parked. Diagnostics and tests. */
  waiting(): number
}

export function createPauseGate(): PauseGate {
  const isPaused = ref(false)
  const isRequested = ref(false)
  let waiters: Array<() => void> = []

  function wake() {
    const pending = waiters
    waiters = []
    for (const resolve of pending) resolve()
  }

  function request(): boolean {
    if (isPaused.value || isRequested.value) return false
    isRequested.value = true
    return true
  }

  async function wait(onEngage?: () => void | Promise<void>): Promise<void> {
    if (isRequested.value && !isPaused.value) {
      isRequested.value = false
      isPaused.value = true
      if (onEngage) await onEngage()
    }
    // Re-checked after `onEngage`, which is async and therefore a window in
    // which a release can land. Without this the release would wake an empty
    // waiter list and the loop would park immediately afterwards, held by a
    // pause nobody could see and nothing would ever lift.
    if (!isPaused.value) return
    await new Promise<void>((resolve) => waiters.push(resolve))
  }

  function release(): boolean {
    if (!isPaused.value && !isRequested.value) return false
    isRequested.value = false
    isPaused.value = false
    wake()
    return true
  }

  function clear(): void {
    isRequested.value = false
    isPaused.value = false
    wake()
  }

  return { isPaused, isRequested, request, wait, release, clear, waiting: () => waiters.length }
}
