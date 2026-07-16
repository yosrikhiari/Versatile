import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSemaphore } from '@/services/aiService'

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({ aiProvider: 'ollama', ollamaModel: 'x', aiProviderFallback: 'none' })
}))
vi.mock('@/services/ollamaService', () => ({ decrypt: vi.fn() }))

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createSemaphore', () => {
  it('runs a single task immediately', async () => {
    const slot = createSemaphore(1)
    await expect(slot(async () => 'done')).resolves.toBe('done')
  })

  it('never exceeds the limit, even under a burst', async () => {
    const slot = createSemaphore(1)
    let active = 0
    let peak = 0
    const gates = [deferred(), deferred(), deferred()]

    const runs = gates.map((g) =>
      slot(async () => {
        active++
        peak = Math.max(peak, active)
        await g.promise
        active--
      })
    )

    // Let the first task claim the slot.
    await Promise.resolve()
    expect(peak).toBe(1)

    gates[0].resolve()
    await Promise.resolve()
    await Promise.resolve()
    gates[1].resolve()
    gates[2].resolve()
    await Promise.all(runs)

    expect(peak).toBe(1)
  })

  it('allows exactly `limit` concurrent tasks', async () => {
    const slot = createSemaphore(3)
    let active = 0
    let peak = 0
    const gates = Array.from({ length: 6 }, deferred)

    const runs = gates.map((g) =>
      slot(async () => {
        active++
        peak = Math.max(peak, active)
        await g.promise
        active--
      })
    )

    await Promise.resolve()
    expect(peak).toBe(3)

    gates.forEach((g) => g.resolve())
    await Promise.all(runs)
    expect(peak).toBe(3)
  })

  it('releases the slot when a task throws', async () => {
    // A leaked slot on the error path would deadlock the whole app after one
    // failed generation — the finally block is load-bearing.
    const slot = createSemaphore(1)
    await expect(
      slot(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    await expect(slot(async () => 'still works')).resolves.toBe('still works')
  })

  it('runs queued tasks in FIFO order', async () => {
    const slot = createSemaphore(1)
    const order = []
    const runs = [1, 2, 3].map((n) =>
      slot(async () => {
        order.push(n)
      })
    )
    await Promise.all(runs)
    expect(order).toEqual([1, 2, 3])
  })

  it('survives a task that throws synchronously', async () => {
    const slot = createSemaphore(1)
    await expect(
      slot(() => {
        throw new Error('sync boom')
      })
    ).rejects.toThrow('sync boom')
    await expect(slot(async () => 'ok')).resolves.toBe('ok')
  })

  it('serialises a nested fan-out — the bug this exists to fix', async () => {
    // useVolumeStoryGenerator.js:862 does parallelWithLimit(tasks, 1) and then
    // Promise.all([...]) INSIDE each task. A limit above a fan-out cannot bound
    // what happens below it, so Ollama saw 2 concurrent generations despite the
    // limit of 1. The semaphore sits below the fan-out, so it holds regardless.
    const slot = createSemaphore(1)
    let active = 0
    let peak = 0

    const call = () =>
      slot(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 1))
        active--
      })

    // One "task" that internally fans out to two concurrent calls.
    const task = () => Promise.all([call(), call()])
    await task()

    expect(peak).toBe(1)
  })
})
