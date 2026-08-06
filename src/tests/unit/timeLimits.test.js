import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/db-core', () => ({
  db: {
    genRuns: {
      where: () => ({ equals: () => ({ first: async () => null, toArray: async () => [] }) }),
      add: async () => 1,
      update: async () => 1
    }
  }
}))

/**
 * The switch ships OFF: a generation runs until it finishes, fails for a
 * non-time reason, or the user presses Stop. These tests pin that default —
 * the suites that cover the timers themselves re-arm the switch explicitly,
 * so without this file a regression flipping it back on would go unnoticed.
 */
describe('time limits (shipped default: disabled)', () => {
  let timeLimits
  beforeEach(async () => {
    vi.resetModules()
    timeLimits = await import('@/config/timeLimits')
  })

  it('ships disabled', () => {
    expect(timeLimits.TIME_LIMITS_ENABLED).toBe(false)
  })

  it('resolves every configured budget to 0, however large or explicit', () => {
    // 0 is the disabled sentinel every consumer checks with `> 0`.
    expect(timeLimits.resolveTimeLimit(900_000)).toBe(0)
    expect(timeLimits.resolveTimeLimit(1)).toBe(0)
    expect(timeLimits.resolveTimeLimit(undefined)).toBe(0)
  })

  it('never arms a timer, and returns a handle clearTimeout still accepts', async () => {
    const onExpire = vi.fn()
    const handle = timeLimits.armTimeLimit(5, onExpire)

    expect(handle).toBeUndefined()
    expect(() => clearTimeout(handle)).not.toThrow()
    await new Promise((r) => setTimeout(r, 40))
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('re-arms everything from the one switch, with the budget intact', async () => {
    timeLimits.__setTimeLimitsEnabled(true)
    expect(timeLimits.resolveTimeLimit(900_000)).toBe(900_000)

    const onExpire = vi.fn()
    timeLimits.armTimeLimit(5, onExpire)
    await new Promise((r) => setTimeout(r, 40))
    expect(onExpire).toHaveBeenCalledWith(5)

    timeLimits.__resetTimeLimits()
    expect(timeLimits.resolveTimeLimit(900_000)).toBe(0)
  })

  it('lets a stage that reports no progress at all keep running', async () => {
    // Same shape as stageHeartbeat's "still bounds a stage that never reports
    // progress" — with limits off it must NOT be bounded. A 26k-char prompt is
    // legitimately silent for minutes during prompt evaluation, which is what
    // used to kill the structure stage at exactly its 480s budget.
    const mod = await import('@/services/db-generation')
    let finished = false
    const stage = mod
      .runStageWithHeartbeat(
        'p1',
        'structure',
        async () => {
          await new Promise((r) => setTimeout(r, 60))
          finished = true
          return 'done'
        },
        10
      )
      .catch((e) => e)

    await expect(stage).resolves.toBe('done')
    expect(finished).toBe(true)
  })

  it('still honours the run-level stop, which is now the only way out', async () => {
    const mod = await import('@/services/db-generation')
    const controller = new AbortController()
    let observed
    const stage = mod
      .runStageWithHeartbeat(
        'p1',
        'structure',
        (_heartbeat, signal) =>
          new Promise((resolve) => {
            observed = signal
            // Checked before subscribing, the way the provider does it: the stop
            // can land while the stage is still awaiting its own bookkeeping, and
            // an already-aborted signal never emits the event again.
            if (signal.aborted) return resolve('stopped')
            signal.addEventListener('abort', () => resolve('stopped'), { once: true })
          }),
        10,
        controller.signal
      )
      .catch((e) => e)

    controller.abort(new Error('user pressed Stop'))
    await expect(stage).resolves.toBe('stopped')
    expect(observed.aborted).toBe(true)
  })
})
