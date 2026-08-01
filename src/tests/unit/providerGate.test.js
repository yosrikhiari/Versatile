import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  slotFor,
  foregroundSlot,
  beginForegroundWork,
  awaitForegroundIdle,
  isForegroundBusy,
  resetForegroundWork,
  resetSemaphores
} from '@/services/providerGate'

const deferred = () => {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const flush = async (times = 4) => {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

beforeEach(() => {
  resetForegroundWork()
  resetSemaphores()
})

describe('slotFor', () => {
  it('serialises Ollama callers, whatever they are', async () => {
    // The bug this module exists for: embeddings and generation each held their
    // own idea of concurrency, so both ran at once on a one-GPU server.
    let active = 0
    let peak = 0
    const gates = [deferred(), deferred()]

    const runs = gates.map((g) =>
      slotFor('ollama')(async () => {
        active++
        peak = Math.max(peak, active)
        await g.promise
        active--
      })
    )

    await flush()
    expect(peak).toBe(1)

    gates[0].resolve()
    await flush()
    gates[1].resolve()
    await Promise.all(runs)

    expect(peak).toBe(1)
  })

  it('hands generation and embedding calls slots from the same semaphore', async () => {
    let active = 0
    let peak = 0
    const gates = [deferred(), deferred()]

    // foregroundSlot (generation) and slotFor (embeddings) must contend.
    const generation = foregroundSlot('ollama')(async () => {
      active++
      peak = Math.max(peak, active)
      await gates[0].promise
      active--
    })
    const embedding = slotFor('ollama')(async () => {
      active++
      peak = Math.max(peak, active)
      await gates[1].promise
      active--
    })

    await flush()
    gates[0].resolve()
    await flush()
    gates[1].resolve()
    await Promise.all([generation, embedding])

    expect(peak).toBe(1)
  })

  it('lets hosted providers overlap', async () => {
    let active = 0
    let peak = 0
    const gates = Array.from({ length: 3 }, deferred)

    const runs = gates.map((g) =>
      slotFor('openai')(async () => {
        active++
        peak = Math.max(peak, active)
        await g.promise
        active--
      })
    )

    await flush()
    expect(peak).toBe(3)

    gates.forEach((g) => g.resolve())
    await Promise.all(runs)
  })
})

describe('foreground priority', () => {
  it('reports idle when nothing is running', async () => {
    expect(isForegroundBusy()).toBe(false)
    await expect(awaitForegroundIdle()).resolves.toBeUndefined()
  })

  it('blocks background work until the foreground releases', async () => {
    const release = beginForegroundWork()
    expect(isForegroundBusy()).toBe(true)

    let resumed = false
    const waiter = awaitForegroundIdle().then(() => {
      resumed = true
    })

    await flush()
    expect(resumed).toBe(false)

    release()
    await waiter
    expect(resumed).toBe(true)
  })

  it('stays busy until every nested run releases', async () => {
    // A scene write spawns a critic call which spawns metadata extraction; one
    // of them finishing must not read as "the run is over".
    const outer = beginForegroundWork()
    const inner = beginForegroundWork()

    let resumed = false
    awaitForegroundIdle().then(() => {
      resumed = true
    })

    inner()
    await flush()
    expect(isForegroundBusy()).toBe(true)
    expect(resumed).toBe(false)

    outer()
    await flush()
    expect(isForegroundBusy()).toBe(false)
    expect(resumed).toBe(true)
  })

  it('ignores a double release', async () => {
    const release = beginForegroundWork()
    release()
    release()
    expect(isForegroundBusy()).toBe(false)
  })

  it('is scoped per provider', async () => {
    // Generating against a cloud provider contends with nothing on the local
    // GPU, so it must not pause local indexing.
    const release = beginForegroundWork('openai')
    expect(isForegroundBusy('openai')).toBe(true)
    expect(isForegroundBusy('ollama')).toBe(false)

    let resumed = false
    await awaitForegroundIdle('ollama').then(() => {
      resumed = true
    })
    expect(resumed).toBe(true)

    release()
  })

  it('wakes a waiter whose signal aborts, so nothing hangs on cancel', async () => {
    beginForegroundWork()
    const controller = new AbortController()
    const waiter = awaitForegroundIdle('ollama', controller.signal)
    controller.abort()
    await expect(waiter).resolves.toBeUndefined()
  })
})

describe('foregroundSlot', () => {
  it('claims priority before waiting for the slot', async () => {
    // Claiming after acquisition would let a queued batch start first and make
    // the generation call wait for it — exactly what the gate is here to avoid.
    const gate = deferred()
    const occupied = slotFor('ollama')(() => gate.promise)

    let busyDuringWait = false
    const generation = foregroundSlot('ollama')(async () => 'done')
    await flush()
    busyDuringWait = isForegroundBusy()

    gate.resolve()
    await occupied
    await expect(generation).resolves.toBe('done')
    expect(busyDuringWait).toBe(true)
  })

  it('holds priority past the end of the call, then lets go', async () => {
    vi.useFakeTimers()
    try {
      const call = foregroundSlot('ollama')(async () => 'ok')
      await call
      // Gaps between a run's calls must not be an opening for background work.
      expect(isForegroundBusy()).toBe(true)

      vi.advanceTimersByTime(30_000)
      expect(isForegroundBusy()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases priority when the call throws', async () => {
    vi.useFakeTimers()
    try {
      await expect(
        foregroundSlot('ollama')(async () => {
          throw new Error('model exploded')
        })
      ).rejects.toThrow('model exploded')

      vi.advanceTimersByTime(30_000)
      expect(isForegroundBusy()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
