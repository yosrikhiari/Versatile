import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('IdempotencyTracker', () => {
  let IdempotencyTracker
  let tracker

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('../../services/aiService')
    IdempotencyTracker = mod.IdempotencyTracker
    tracker = new IdempotencyTracker()
    tracker._hashKey = vi.fn((...args) => {
      const key = args.join('|')
      return Promise.resolve(key)
    })
  })

  it('calls factory once for concurrent identical requests', async () => {
    const factory = vi.fn().mockResolvedValue('result')

    const [r1, r2] = await Promise.all([
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory),
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory)
    ])

    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('calls factory separately for different prompts', async () => {
    const factory = vi.fn().mockResolvedValue('result')

    const [r1, r2] = await Promise.all([
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt-a', factory),
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt-b', factory)
    ])

    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('calls factory separately for different providers', async () => {
    const factory = vi.fn().mockResolvedValue('result')

    const [r1, r2] = await Promise.all([
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory),
      tracker.dedup('openai', 'gpt4', 0.7, 'writer.scene', 'sys', 'prompt', factory)
    ])

    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('calls factory separately for different temperatures', async () => {
    const factory = vi.fn().mockResolvedValue('result')

    const [r1, r2] = await Promise.all([
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory),
      tracker.dedup('ollama', 'llama3', 0.2, 'writer.scene', 'sys', 'prompt', factory)
    ])

    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('computes different keys for different system prompts', async () => {
    const factory = vi.fn().mockResolvedValue('result')

    const [r1, r2] = await Promise.all([
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys-a', 'prompt', factory),
      tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys-b', 'prompt', factory)
    ])

    expect(r1).toBe('result')
    expect(r2).toBe('result')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('starts new call after previous one settles', async () => {
    const factory = vi.fn().mockResolvedValue('result')

    await tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory)
    await tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory)

    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('tracks size as number of in-flight entries', async () => {
    let slowResolve, fastResolve
    const slow = vi.fn().mockReturnValue(
      new Promise((r) => {
        slowResolve = r
      })
    )
    const fast = vi.fn().mockReturnValue(
      new Promise((r) => {
        fastResolve = r
      })
    )

    const p1 = tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'slow', slow)
    await new Promise((r) => setTimeout(r, 0))
    expect(tracker.size).toBe(1)

    const p2 = tracker.dedup('ollama', 'gpt4', 0.7, 'writer.scene', 'sys', 'fast', fast)
    await new Promise((r) => setTimeout(r, 0))
    expect(tracker.size).toBe(2)

    slowResolve('done')
    fastResolve('done')
    await new Promise((r) => setTimeout(r, 0))
    expect(tracker.size).toBe(0)
  })

  it('returns factory result on first call', async () => {
    const factory = vi.fn().mockResolvedValue('hello-world')

    const result = await tracker.dedup(
      'ollama',
      'llama3',
      0.7,
      'writer.scene',
      'sys',
      'prompt',
      factory
    )
    expect(result).toBe('hello-world')
  })

  it('forwards factory rejection to all duplicate callers', async () => {
    const factory = vi.fn().mockRejectedValue(new Error('provider error'))

    const p1 = tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory)
    const p2 = tracker.dedup('ollama', 'llama3', 0.7, 'writer.scene', 'sys', 'prompt', factory)

    await expect(p1).rejects.toThrow('provider error')
    await expect(p2).rejects.toThrow('provider error')
    expect(factory).toHaveBeenCalledTimes(1)
  })
})
