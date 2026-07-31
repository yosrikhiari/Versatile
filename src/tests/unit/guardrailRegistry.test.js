import { describe, it, expect, beforeEach } from 'vitest'
import { GuardrailRegistry } from '../../guardrails/registry'

function pass(kind, layer) {
  return { kind, passed: true, severity: 'detective', message: 'ok', layer, timestamp: Date.now() }
}

function fail(kind, layer, severity = 'blocking') {
  return { kind, passed: false, severity, message: `${kind} failed`, layer, timestamp: Date.now() }
}

describe('GuardrailRegistry', () => {
  beforeEach(() => {
    GuardrailRegistry.clear()
    // clear() intentionally keeps subscribers; tests want a clean listener set.
    GuardrailRegistry.clearListeners()
  })

  describe('layer routing', () => {
    it('only runs guards registered for the context layer', async () => {
      const calls = []
      // entity defaults to ai_output + user_edit; integrity to storage_write + sync.
      GuardrailRegistry.register('entity', (ctx) => {
        calls.push('entity')
        return [pass('entity', ctx.layer)]
      })
      GuardrailRegistry.register('integrity', (ctx) => {
        calls.push('integrity')
        return [pass('integrity', ctx.layer)]
      })

      await GuardrailRegistry.run({ layer: 'sync', data: {} })

      // This is the bug the routing fixes: without layers, a sync push would
      // also be run through the entity guard.
      expect(calls).toEqual(['integrity'])
    })

    it('narrows further when context.kinds is supplied', async () => {
      const calls = []
      GuardrailRegistry.register('entity', () => {
        calls.push('entity')
        return []
      })
      GuardrailRegistry.register('pii_leakage', () => {
        calls.push('pii_leakage')
        return []
      })

      await GuardrailRegistry.run({ layer: 'ai_output', data: {}, kinds: ['pii_leakage'] })

      expect(calls).toEqual(['pii_leakage'])
    })
  })

  describe('result aggregation', () => {
    it('separates blocking from detective and fails only on blocking', async () => {
      GuardrailRegistry.register('entity', (ctx) => [fail('entity', ctx.layer, 'blocking')])
      GuardrailRegistry.register('quality', (ctx) => [fail('quality', ctx.layer, 'detective')])

      const result = await GuardrailRegistry.run({ layer: 'ai_output', data: {} })

      expect(result.passed).toBe(false)
      expect(result.blocking).toHaveLength(1)
      expect(result.detective).toHaveLength(1)
    })

    it('passes when only detective guards fail', async () => {
      GuardrailRegistry.register('quality', (ctx) => [fail('quality', ctx.layer, 'detective')])

      const result = await GuardrailRegistry.run({ layer: 'ai_output', data: {} })

      expect(result.passed).toBe(true)
      expect(result.detective).toHaveLength(1)
    })

    it('stamps category, durationMs and entryPoint onto each result', async () => {
      GuardrailRegistry.register('entity', (ctx) => [fail('entity', ctx.layer)])

      const result = await GuardrailRegistry.run({
        layer: 'ai_output',
        data: {},
        entryPoint: 'useStoryWriter.writeScene'
      })

      expect(result.results[0].category).toBe('structural')
      expect(result.results[0].entryPoint).toBe('useStoryWriter.writeScene')
      expect(typeof result.results[0].durationMs).toBe('number')
    })
  })

  describe('async guards', () => {
    it('awaits promise-returning guards', async () => {
      GuardrailRegistry.register('fact_canon', async (ctx) => {
        await Promise.resolve()
        return [fail('fact_canon', ctx.layer, 'detective')]
      })

      const result = await GuardrailRegistry.run({ layer: 'ai_output', data: {} })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].kind).toBe('fact_canon')
    })

    it('runSync skips a guard that unexpectedly returns a promise rather than dropping it', () => {
      GuardrailRegistry.register('entity', async () => [])

      const result = GuardrailRegistry.runSync({ layer: 'ai_output', data: {} })

      expect(result.skipped).toContain('entity')
    })
  })

  describe('error isolation', () => {
    it('converts a throwing guard into a detective result instead of propagating', async () => {
      GuardrailRegistry.register('entity', () => {
        throw new Error('grounding unavailable')
      })
      GuardrailRegistry.register('quality', (ctx) => [pass('quality', ctx.layer)])

      const result = await GuardrailRegistry.run({ layer: 'ai_output', data: {} })

      // A broken guard must not block generation, and must not hide the guards after it.
      expect(result.passed).toBe(true)
      expect(result.detective[0].message).toContain('grounding unavailable')
      expect(result.results).toHaveLength(2)
    })
  })

  describe('llm cost budget', () => {
    it('meters llm-cost guards and skips them once the budget is spent', async () => {
      let invocations = 0
      GuardrailRegistry.setLlmBudget(2)
      GuardrailRegistry.register(
        'fact_canon',
        () => {
          invocations++
          return []
        },
        { cost: 'llm' }
      )

      await GuardrailRegistry.run({ layer: 'ai_output', data: {} })
      await GuardrailRegistry.run({ layer: 'ai_output', data: {} })
      const third = await GuardrailRegistry.run({ layer: 'ai_output', data: {} })

      expect(invocations).toBe(2)
      expect(third.skipped).toContain('fact_canon')
      expect(GuardrailRegistry.getSessionCost().fact_canon).toBe(2)
      expect(GuardrailRegistry.hasBudgetRemaining('fact_canon')).toBe(false)
    })

    it('does not meter cheap guards', async () => {
      GuardrailRegistry.setLlmBudget(1)
      GuardrailRegistry.register('entity', () => [])

      await GuardrailRegistry.run({ layer: 'ai_output', data: {} })
      await GuardrailRegistry.run({ layer: 'ai_output', data: {} })

      expect(GuardrailRegistry.getSessionCost().entity).toBeUndefined()
      expect(GuardrailRegistry.hasBudgetRemaining('entity')).toBe(true)
    })

    it('resetSessionCost restores budget for a new session', async () => {
      GuardrailRegistry.setLlmBudget(1)
      GuardrailRegistry.register('fact_canon', () => [], { cost: 'llm' })

      await GuardrailRegistry.run({ layer: 'ai_output', data: {} })
      expect(GuardrailRegistry.hasBudgetRemaining('fact_canon')).toBe(false)

      GuardrailRegistry.resetSessionCost()
      expect(GuardrailRegistry.hasBudgetRemaining('fact_canon')).toBe(true)
    })

    it('runSync always skips llm guards', () => {
      GuardrailRegistry.register('fact_canon', () => [], { cost: 'llm' })

      const result = GuardrailRegistry.runSync({ layer: 'ai_output', data: {} })

      expect(result.skipped).toContain('fact_canon')
    })
  })

  describe('events', () => {
    it('emits one event per failed result and none for passes', async () => {
      const events = []
      GuardrailRegistry.onEvent((e) => events.push(e))
      GuardrailRegistry.register('entity', (ctx) => [
        fail('entity', ctx.layer),
        pass('entity', ctx.layer)
      ])

      await GuardrailRegistry.run({ layer: 'ai_output', data: {} })

      expect(events).toHaveLength(1)
      expect(events[0].kind).toBe('entity')
      expect(events[0].resolved).toBe(false)
    })

    it('a throwing listener does not break the run', async () => {
      GuardrailRegistry.onEvent(() => {
        throw new Error('listener exploded')
      })
      GuardrailRegistry.register('entity', (ctx) => [fail('entity', ctx.layer)])

      await expect(GuardrailRegistry.run({ layer: 'ai_output', data: {} })).resolves.toBeDefined()
    })
  })
})
