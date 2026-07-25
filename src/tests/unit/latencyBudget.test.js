import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/ai', () => ({
  FEATURES: {
    SPARK: 'spark',
    POLISH: 'polish',
    CONTENT: 'content',
    WORLDBUILDING: 'worldbuilding',
    COMPACTION: 'compaction',
    STORY_GENERATION: 'story_generation',
    NETWORK: 'network',
    TAGGING: 'tagging',
    CHARACTER_CHAT: 'character_chat',
    POV_WRITING: 'pov_writing',
    SHAPE_ANALYSIS: 'shape_analysis',
    BLURB: 'blurb'
  }
}))

describe('latencyBudget', () => {
  describe('constructor and defaults', () => {
    it('uses DEFAULT_LATENCY_BUDGETS when no custom budgets given', async () => {
      const { LatencyBudget, DEFAULT_LATENCY_BUDGETS } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget()
      expect(lb.budgets).toBe(DEFAULT_LATENCY_BUDGETS)
    })

    it('accepts custom budgets overriding defaults', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({ spark: { warn: 1000, block: 5000 } })
      expect(lb.budgets.spark).toEqual({ warn: 1000, block: 5000 })
      expect(lb.budgets.polish).toBeUndefined()
    })

    it('handles empty budgets', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({})
      expect(lb.budgets).toEqual({})
    })
  })

  describe('check', () => {
    it('returns not exceeded for features without a budget', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({})
      expect(lb.check('unknown', 99999)).toEqual({
        exceeded: false,
        blocked: false,
        elapsedMs: 99999
      })
    })

    it('returns not exceeded when elapsed is under warn threshold', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({ spark: { warn: 10000, block: 30000 } })
      expect(lb.check('spark', 1000)).toEqual({ exceeded: false, blocked: false, elapsedMs: 1000 })
    })

    it('warns when elapsed exceeds warn threshold', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const lb = new LatencyBudget({ spark: { warn: 1000, block: 30000 } })
      const result = lb.check('spark', 5000)
      expect(result.exceeded).toBe(true)
      expect(result.blocked).toBe(false)
      expect(result.elapsedMs).toBe(5000)
      expect(result.warnThreshold).toBe(1000)
      expect(warn).toHaveBeenCalledWith('[latencyBudget] spark took 5000ms (warn threshold 1000ms)')
      warn.mockRestore()
    })

    it('does not warn when elapsed equals warn threshold', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const lb = new LatencyBudget({ spark: { warn: 1000 } })
      lb.check('spark', 1000)
      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('throws LatencyExceededError when elapsed exceeds block threshold', async () => {
      const { LatencyBudget, LatencyExceededError } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({ spark: { warn: 1000, block: 5000 } })
      expect(() => lb.check('spark', 10000)).toThrow(LatencyExceededError)
      expect(() => lb.check('spark', 10000)).toThrow(/spark/)
      expect(() => lb.check('spark', 10000)).toThrow(/Latency budget exceeded/)
      expect(() => lb.check('spark', 10000)).toThrow(/10000ms > 5000ms/)
    })

    it('throws when block threshold exceeded with warn-only config if block is hit', async () => {
      const { LatencyBudget, LatencyExceededError } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({ spark: { block: 3000 } })
      expect(() => lb.check('spark', 5000)).toThrow(LatencyExceededError)
    })
  })

  describe('LatencyExceededError', () => {
    it('sets name, feature, elapsedMs, and limitMs', async () => {
      const { LatencyExceededError } = await import('@/services/latencyBudget')
      const err = new LatencyExceededError('spark', 50000, 30000)
      expect(err.name).toBe('LatencyExceededError')
      expect(err.feature).toBe('spark')
      expect(err.elapsedMs).toBe(50000)
      expect(err.limitMs).toBe(30000)
      expect(err.message).toContain('50000ms > 30000ms')
    })
  })

  describe('wrap', () => {
    it('returns the result of the wrapped function', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({})
      const wrapped = lb.wrap('spark', async () => 'hello')
      await expect(wrapped()).resolves.toBe('hello')
    })

    it('warns when wrapped function exceeds threshold', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const lb = new LatencyBudget({ spark: { warn: 10 } })
      // Artificially delay the inner fn so it exceeds 10ms
      const wrapped = lb.wrap('spark', async () => {
        await new Promise((r) => setTimeout(r, 20))
        return 'slow'
      })
      await expect(wrapped()).resolves.toBe('slow')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[latencyBudget] spark took'))
      warn.mockRestore()
    }, 10000)

    it('does not warn for fast wrapped functions', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const lb = new LatencyBudget({ spark: { warn: 60000 } })
      const wrapped = lb.wrap('spark', async () => 'fast')
      await wrapped()
      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('rethrows errors from the wrapped function', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({})
      const wrapped = lb.wrap('spark', async () => {
        throw new Error('boom')
      })
      await expect(wrapped()).rejects.toThrow('boom')
    })

    it('still logs warn timing when wrapped function throws', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const lb = new LatencyBudget({ spark: { warn: 10 } })
      const wrapped = lb.wrap('spark', async () => {
        await new Promise((r) => setTimeout(r, 20))
        throw new Error('boom')
      })
      await expect(wrapped()).rejects.toThrow('boom')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[latencyBudget] spark took'))
      warn.mockRestore()
    }, 10000)

    it('does not throw LatencyExceededError from wrap (only warns)', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const lb = new LatencyBudget({ spark: { warn: 10, block: 20 } })
      const wrapped = lb.wrap('spark', async () => {
        await new Promise((r) => setTimeout(r, 30))
        return 'too-slow-but-no-block'
      })
      await expect(wrapped()).resolves.toBe('too-slow-but-no-block')
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    }, 10000)
  })

  describe('getThresholds', () => {
    it('returns budget for a known feature', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({ spark: { warn: 1000, block: 5000 } })
      expect(lb.getThresholds('spark')).toEqual({ warn: 1000, block: 5000 })
    })

    it('returns null for unknown feature', async () => {
      const { LatencyBudget } = await import('@/services/latencyBudget')
      const lb = new LatencyBudget({})
      expect(lb.getThresholds('nope')).toBeNull()
    })
  })

  describe('singleton', () => {
    it('exports a default latencyBudget instance', async () => {
      const mod = await import('@/services/latencyBudget')
      expect(mod.latencyBudget).toBeDefined()
      expect(mod.latencyBudget.budgets).toBeDefined()
      expect(typeof mod.latencyBudget.check).toBe('function')
      expect(typeof mod.latencyBudget.wrap).toBe('function')
    })

    it('has default budgets for all features', async () => {
      const mod = await import('@/services/latencyBudget')
      const { FEATURES } = await import('@/config/ai')
      for (const feature of Object.values(FEATURES)) {
        expect(mod.latencyBudget.budgets[feature]).toBeDefined()
        expect(mod.latencyBudget.budgets[feature].warn).toBeGreaterThan(0)
        expect(mod.latencyBudget.budgets[feature].block).toBeGreaterThan(0)
      }
    })

    it('__resetLatencyBudget is callable', async () => {
      const mod = await import('@/services/latencyBudget')
      expect(() => mod.__resetLatencyBudget()).not.toThrow()
    })
  })
})
