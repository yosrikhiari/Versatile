import { describe, it, expect } from 'vitest'
import { computeCost, MODEL_PRICING } from '../../config/modelPricing'

describe('cost accuracy — computeCost()', () => {
  it.each([
    ['gpt-4o', 1000, 200, 0.0045],
    ['gpt-4o', 0, 100, 0.001],
    ['gpt-4o-mini', 1000, 500, 0.00045],
    ['gpt-4-turbo', 500, 100, 0.008],
    ['gpt-4', 100, 50, 0.006],
    ['gpt-3.5-turbo', 2000, 400, 0.0016],
    ['claude-sonnet-4-5', 1500, 300, 0.009],
    ['claude-opus-4-5', 800, 150, 0.02325],
    ['claude-haiku-4-5', 2000, 500, 0.0036],
    ['gemini-2.5-pro', 1000, 200, 0.00225],
    ['gemini-2.5-flash', 3000, 600, 0.00081],
    ['gemini-1.5-pro', 2000, 300, 0.004]
  ])(
    'computes correct cost for %s with %i prompt + %i completion tokens',
    (model, promptTokens, completionTokens, expected) => {
      const cost = computeCost(model, { promptTokens, completionTokens })
      expect(cost).toBe(expected)
    }
  )

  it('returns 0 for null usage', () => {
    expect(computeCost('gpt-4o', null)).toBe(0)
  })

  it('returns 0 for undefined usage', () => {
    expect(computeCost('gpt-4o', undefined)).toBe(0)
  })

  it('returns 0 for unknown model (falls back to DEFAULT_PRICING of 0)', () => {
    const cost = computeCost('nonexistent-model-v1', { promptTokens: 1000, completionTokens: 200 })
    expect(cost).toBe(0)
  })

  it('returns 0 for free/OSS models', () => {
    const freeModels = Object.entries(MODEL_PRICING)
      .filter(([, p]) => p.input === 0 && p.output === 0)
      .map(([name]) => name)
    for (const model of freeModels) {
      expect(computeCost(model, { promptTokens: 5000, completionTokens: 1000 })).toBe(0)
    }
  })

  it('handles very large token counts without floating point issues', () => {
    const cost = computeCost('gpt-4o', { promptTokens: 100_000, completionTokens: 20_000 })
    expect(cost).toBe(0.45)
  })

  it('handles zero tokens', () => {
    const cost = computeCost('gpt-4o', { promptTokens: 0, completionTokens: 0 })
    expect(cost).toBe(0)
  })

  it('partial usage objects produce NaN (caller must provide both token counts)', () => {
    expect(computeCost('gpt-4o', { promptTokens: 1000 })).toBeNaN()
    expect(computeCost('gpt-4o', { completionTokens: 200 })).toBeNaN()
  })
})
