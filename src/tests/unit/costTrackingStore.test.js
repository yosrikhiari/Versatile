import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCostTrackingStore } from '../../stores/costTrackingStore'

describe('costTrackingStore', () => {
  beforeEach(() => {
    const store = useCostTrackingStore()
    store.clearSession()
  })

  it('starts with zero totals', () => {
    const store = useCostTrackingStore()
    expect(store.sessionTotal).toBe(0)
    expect(store.totalTokens).toBe(0)
    expect(store.breakdownByModel).toEqual({})
    expect(store.breakdownByProvider).toEqual({})
  })

  it('accumulates costs across multiple log entries', () => {
    const store = useCostTrackingStore()
    store.logCost({
      model: 'gpt-4o',
      provider: 'openai',
      cost: 0.005,
      promptTokens: 1000,
      completionTokens: 200,
      totalTokens: 1200,
      feature: 'write'
    })
    store.logCost({
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      cost: 0.012,
      promptTokens: 2000,
      completionTokens: 300,
      totalTokens: 2300,
      feature: 'revise'
    })

    expect(store.sessionTotal).toBeCloseTo(0.017)
    expect(store.totalPromptTokens).toBe(3000)
    expect(store.totalCompletionTokens).toBe(500)
    expect(store.totalTokens).toBe(3500)
  })

  it('builds breakdownByModel correctly', () => {
    const store = useCostTrackingStore()
    store.logCost({
      model: 'gpt-4o',
      provider: 'openai',
      cost: 0.005,
      promptTokens: 1000,
      completionTokens: 200,
      totalTokens: 1200,
      feature: 'write'
    })
    store.logCost({
      model: 'gpt-4o',
      provider: 'openai',
      cost: 0.003,
      promptTokens: 500,
      completionTokens: 100,
      totalTokens: 600,
      feature: 'edit'
    })
    store.logCost({
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      cost: 0.01,
      promptTokens: 1500,
      completionTokens: 250,
      totalTokens: 1750,
      feature: 'revise'
    })

    const byModel = store.breakdownByModel
    expect(byModel['gpt-4o'].count).toBe(2)
    expect(byModel['gpt-4o'].totalCost).toBeCloseTo(0.008)
    expect(byModel['gpt-4o'].totalTokens).toBe(1800)
    expect(byModel['claude-sonnet-4-5'].count).toBe(1)
    expect(byModel['claude-sonnet-4-5'].totalCost).toBeCloseTo(0.01)
  })

  it('builds breakdownByProvider correctly', () => {
    const store = useCostTrackingStore()
    store.logCost({
      model: 'gpt-4o',
      provider: 'openai',
      cost: 0.005,
      promptTokens: 1000,
      completionTokens: 200,
      totalTokens: 1200,
      feature: 'write'
    })
    store.logCost({
      model: 'gpt-4o-mini',
      provider: 'openai',
      cost: 0.001,
      promptTokens: 800,
      completionTokens: 150,
      totalTokens: 950,
      feature: 'write'
    })
    store.logCost({
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      cost: 0.01,
      promptTokens: 1500,
      completionTokens: 250,
      totalTokens: 1750,
      feature: 'revise'
    })

    const byProvider = store.breakdownByProvider
    expect(byProvider['openai'].count).toBe(2)
    expect(byProvider['openai'].totalCost).toBeCloseTo(0.006)
    expect(byProvider['anthropic'].count).toBe(1)
    expect(byProvider['anthropic'].totalCost).toBeCloseTo(0.01)
  })

  it('clearSession resets all state', () => {
    const store = useCostTrackingStore()
    store.logCost({
      model: 'gpt-4o',
      provider: 'openai',
      cost: 0.005,
      promptTokens: 1000,
      completionTokens: 200,
      totalTokens: 1200,
      feature: 'write'
    })
    expect(store.sessionTotal).toBeGreaterThan(0)

    store.clearSession()
    expect(store.sessionTotal).toBe(0)
    expect(store.sessionLog).toEqual([])
    expect(store.breakdownByModel).toEqual({})
  })

  it('handles unknown model gracefully in breakdownByModel', () => {
    const store = useCostTrackingStore()
    store.logCost({ cost: 0.01, totalTokens: 500, feature: 'test' })

    const byModel = store.breakdownByModel
    expect(byModel['unknown'].count).toBe(1)
    expect(byModel['unknown'].totalCost).toBeCloseTo(0.01)
  })
})
