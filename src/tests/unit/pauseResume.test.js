import { describe, it, expect, vi } from 'vitest'
import { createPauseGate } from '@/utils/pauseGate'
import { createAbortScope } from '@/utils/abortScope'
import { Delegator } from '@/composables/generation/delegator/Delegator'
import { createAgentMemory } from '@/composables/generation/delegator/AgentMemory'

/** Let queued microtasks run so a parked loop has a chance to make progress. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * A stand-in for the scene loop: calls the gate before each item, records what
 * it got through. Exactly the shape `writeNextBatch` uses.
 */
function runLoop(gate, items, onEach) {
  const done = []
  const promise = (async () => {
    for (const item of items) {
      await gate.wait()
      done.push(item)
      if (onEach) await onEach(item)
    }
    return 'finished'
  })()
  return { done, promise }
}

describe('pause gate', () => {
  it('holds a loop at the next boundary and releases it on continue', async () => {
    const gate = createPauseGate()
    const { done, promise } = runLoop(gate, [1, 2, 3, 4])

    // Nothing requested — the loop runs straight through.
    await promise
    expect(done).toEqual([1, 2, 3, 4])
    expect(gate.isPaused.value).toBe(false)
  })

  it('parks the loop mid-way and resumes from exactly where it stopped', async () => {
    const gate = createPauseGate()
    let seen = 0
    const { done, promise } = runLoop(gate, [1, 2, 3, 4], async (item) => {
      seen = item
      // Ask for a pause while item 2 is "in flight".
      if (item === 2) gate.request()
    })

    await settle()
    // Item 2 finished (it was already paid for); the gate held before item 3.
    expect(seen).toBe(2)
    expect(done).toEqual([1, 2])
    expect(gate.isPaused.value).toBe(true)
    expect(gate.waiting()).toBe(1)

    // Still held after more turns of the event loop — this is a real hold, not
    // a slow tick.
    await settle()
    await settle()
    expect(done).toEqual([1, 2])

    gate.release()
    await promise
    expect(done).toEqual([1, 2, 3, 4])
    expect(gate.isPaused.value).toBe(false)
    expect(gate.waiting()).toBe(0)
  })

  it('reports requested before paused, so the UI can say "pausing"', async () => {
    const gate = createPauseGate()
    expect(gate.request()).toBe(true)
    expect(gate.isRequested.value).toBe(true)
    expect(gate.isPaused.value).toBe(false)

    // A second request while one is pending changes nothing.
    expect(gate.request()).toBe(false)

    // `wait()` is not awaited here — it parks by design, which is the thing
    // being asserted.
    const parked = gate.wait()
    await settle()
    expect(gate.isRequested.value).toBe(false)
    expect(gate.isPaused.value).toBe(true)

    gate.release()
    await parked
    expect(gate.isPaused.value).toBe(false)
  })

  it('runs onEngage exactly once, when the hold takes effect', async () => {
    const gate = createPauseGate()
    const onEngage = vi.fn()

    await gate.wait(onEngage)
    expect(onEngage).not.toHaveBeenCalled() // no pause requested

    gate.request()
    const parked = gate.wait(onEngage)
    await settle()
    expect(onEngage).toHaveBeenCalledTimes(1)

    gate.release()
    await parked
    await gate.wait(onEngage)
    expect(onEngage).toHaveBeenCalledTimes(1)
  })

  it('does not strand a loop when release lands during an async onEngage', async () => {
    // The race the re-check exists for: release() fires while onEngage is still
    // awaiting, so its wake() finds an empty waiter list. Without the re-check
    // the loop parks immediately after and nothing ever lifts it.
    const gate = createPauseGate()
    gate.request()

    let releaseDuringEngage
    const parked = gate.wait(async () => {
      releaseDuringEngage = new Promise((resolve) => {
        setTimeout(() => {
          gate.release()
          resolve()
        }, 0)
      })
      await releaseDuringEngage
    })

    await expect(
      Promise.race([
        parked,
        settle()
          .then(() => settle())
          .then(() => 'STRANDED')
      ])
    ).resolves.not.toBe('STRANDED')
    expect(gate.isPaused.value).toBe(false)
  })

  it('clear() wakes every parked loop', async () => {
    const gate = createPauseGate()
    gate.request()
    const a = runLoop(gate, ['a'])
    const b = runLoop(gate, ['b'])
    await settle()
    expect(gate.waiting()).toBe(2)

    gate.clear()
    await Promise.all([a.promise, b.promise])
    expect(a.done).toEqual(['a'])
    expect(b.done).toEqual(['b'])
    expect(gate.waiting()).toBe(0)
  })

  it('release() reports whether there was anything to release', () => {
    const gate = createPauseGate()
    expect(gate.release()).toBe(false)
    gate.request()
    expect(gate.release()).toBe(true)
    expect(gate.isRequested.value).toBe(false)
  })
})

describe('abort scope renewal', () => {
  it('renew() gives a run that follows a stop a clean controller', () => {
    const scope = createAbortScope()
    scope.ensure()
    scope.cancel()
    expect(scope.isAborted()).toBe(true)

    // The old behaviour: ensure() hands back the aborted controller, so the
    // next run threw at its first guard.
    scope.ensure()
    expect(scope.isAborted()).toBe(true)

    scope.renew()
    expect(scope.isAborted()).toBe(false)
    expect(() => scope.throwIfAborted()).not.toThrow()
  })

  it('a stop after a renew still stops the new run', () => {
    const scope = createAbortScope()
    scope.renew()
    expect(scope.cancel()).toBe(true)
    expect(() => scope.throwIfAborted()).toThrow(/cancel/i)
  })
})

describe('delegator: paused phase', () => {
  function writingMachine() {
    const memory = createAgentMemory()
    const delegator = new Delegator(memory)
    memory.setPhase('writing')
    return { memory, delegator }
  }

  it('routes writing → paused → writing', async () => {
    const { delegator } = writingMachine()
    expect(delegator.canDispatch('PAUSED')).toBe(true)

    await delegator.dispatch('PAUSED', { sceneIndex: 4 })
    expect(delegator.phase).toBe('paused')

    expect(delegator.canDispatch('RESUMED')).toBe(true)
    await delegator.dispatch('RESUMED', { sceneIndex: 4 })
    expect(delegator.phase).toBe('writing')
  })

  it('gives writing events no route out of paused', async () => {
    const { delegator } = writingMachine()
    await delegator.dispatch('PAUSED', {})

    // The point of the hold: a scene finishing behind the pause cannot advance
    // the machine past it.
    expect(delegator.canDispatch('SCENE_WRITTEN')).toBe(false)
    expect(delegator.canDispatch('BATCH_COMPLETE')).toBe(false)
    expect(delegator.canDispatch('ALL_WRITTEN')).toBe(false)
    await expect(delegator.dispatch('SCENE_WRITTEN', {})).rejects.toThrow(/no route/)
  })

  it('lets a stop and a teardown out of paused', async () => {
    const { delegator } = writingMachine()
    await delegator.dispatch('PAUSED', {})
    await delegator.dispatch('ERROR', { message: 'stopped' })
    expect(delegator.phase).toBe('error')

    const second = writingMachine()
    await second.delegator.dispatch('PAUSED', {})
    await second.delegator.dispatch('RESET', {})
    expect(second.delegator.phase).toBe('idle')
  })

  it('cannot be paused from a phase that is not writing', async () => {
    const memory = createAgentMemory()
    const delegator = new Delegator(memory)
    for (const phase of ['idle', 'planning', 'plan-preview', 'scene-review', 'complete']) {
      memory.setPhase(phase)
      expect(delegator.canDispatch('PAUSED')).toBe(false)
    }
  })
})
