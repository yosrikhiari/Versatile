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

let mod
beforeEach(async () => {
  vi.resetModules()
  mod = await import('@/services/db-generation')
})

describe('runStageWithHeartbeat', () => {
  it('lets work run far past the idle budget as long as it reports progress', async () => {
    // The regression this exists to prevent: a 6-hour prose stage was killed by a
    // 30-minute absolute budget even though every scene was landing on time.
    const result = await mod.runStageWithHeartbeat(
      'p1',
      'prose',
      async (heartbeat) => {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 12))
          heartbeat(`scene ${i + 1}`)
        }
        return 'done'
      },
      40 // total elapsed (~96ms) far exceeds this; no single gap does
    )
    expect(result).toBe('done')
  })

  it('fails once progress actually stops', async () => {
    const err = await mod
      .runStageWithHeartbeat(
        'p1',
        'prose',
        async (heartbeat) => {
          heartbeat('scene 1')
          await new Promise(() => {}) // wedged
        },
        30
      )
      .catch((e) => e)

    expect(err.message).toMatch(/no progress/i)
    expect(err.message).toMatch(/scene 1/)
  })

  it('still bounds a stage that never reports progress', async () => {
    const err = await mod
      .runStageWithHeartbeat('p1', 'network', () => new Promise(() => {}), 25)
      .catch((e) => e)
    expect(err.message).toMatch(/no progress/i)
  })

  it('propagates a real failure without relabelling it a timeout', async () => {
    const err = await mod
      .runStageWithHeartbeat('p1', 'bible', async () => {
        throw new Error('model refused')
      })
      .catch((e) => e)
    expect(err.message).toBe('model refused')
  })

  it('runStageWithTimeout keeps working for single-call stages', async () => {
    const result = await mod.runStageWithTimeout('p1', 'network', async () => 'ok', 500)
    expect(result).toBe('ok')
  })
})

describe('withTimeout', () => {
  it('is gone, so no caller can silently inherit its 5-minute wall-clock default', () => {
    // Both of its call sites passed no budget and so capped the structure and
    // prose stages at five minutes — far below what they cost on a local model.
    expect(mod.withTimeout).toBeUndefined()
  })
})
