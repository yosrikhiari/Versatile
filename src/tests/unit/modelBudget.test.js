import { describe, it, expect } from 'vitest'
import {
  checkInputBudget,
  getContextWindow,
  inputBudgetForModel,
  maxOutputTokensForModel,
  resolveMaxTokens
} from '@/services/ai/modelBudget'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_CAP,
  MIN_OUTPUT_TOKENS
} from '@/config/generationLimits'

describe('getContextWindow', () => {
  it('reads the window from MODEL_META', () => {
    expect(getContextWindow('gpt-4o')).toBe(128000)
    expect(getContextWindow('claude-sonnet-4-5')).toBe(200000)
    expect(getContextWindow('gpt-4')).toBe(8192)
  })

  it('returns null for a model it has no data for', () => {
    expect(getContextWindow('some-future-model')).toBe(null)
    expect(getContextWindow('')).toBe(null)
  })
})

describe('inputBudgetForModel', () => {
  it('reserves a share of the window for output and framing', () => {
    expect(inputBudgetForModel('gpt-4o')).toBe(Math.floor(128000 * 0.67))
    expect(inputBudgetForModel('claude-sonnet-4-5')).toBe(Math.floor(200000 * 0.67))
  })

  it('assumes the smallest known window for an unknown model', () => {
    // Under-filling wastes capacity; over-filling fails the call outright.
    expect(inputBudgetForModel('some-future-model')).toBe(Math.floor(8192 * 0.67))
  })
})

describe('maxOutputTokensForModel', () => {
  it('caps output on large-window models', () => {
    expect(maxOutputTokensForModel('claude-sonnet-4-5', 50000)).toBe(MAX_OUTPUT_TOKENS_CAP)
    expect(maxOutputTokensForModel('gemini-2.5-pro', 1000)).toBe(MAX_OUTPUT_TOKENS_CAP)
  })

  it('shrinks output as input consumes the window', () => {
    // 8192-token window, 6000-token prompt: the old flat 4096 would have asked
    // for 10096 tokens against an 8192 window — a hard 400 from the provider.
    const derived = maxOutputTokensForModel('gpt-4', 6000)
    expect(derived).toBeLessThan(DEFAULT_MAX_OUTPUT_TOKENS)
    expect(6000 + derived).toBeLessThanOrEqual(8192)
  })

  it('never asks for so little that output is cut mid-sentence', () => {
    expect(maxOutputTokensForModel('gpt-4', 8000)).toBe(MIN_OUTPUT_TOKENS)
    expect(maxOutputTokensForModel('gpt-4', 999999)).toBe(MIN_OUTPUT_TOKENS)
  })

  it('leaves unknown models on the historical flat default', () => {
    expect(maxOutputTokensForModel('some-future-model', 1000)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
  })
})

describe('resolveMaxTokens', () => {
  it('lets an explicit caller value win', () => {
    // Scene generation sizes its own output from the target word count and knows
    // better than the window math.
    expect(resolveMaxTokens('claude-sonnet-4-5', 1000, 2500)).toBe(2500)
  })

  it('derives a value when the caller has no opinion', () => {
    expect(resolveMaxTokens('claude-sonnet-4-5', 1000, undefined)).toBe(MAX_OUTPUT_TOKENS_CAP)
    expect(resolveMaxTokens('claude-sonnet-4-5', 1000, 0)).toBe(MAX_OUTPUT_TOKENS_CAP)
  })
})

describe('checkInputBudget', () => {
  it('is silent while input fits', () => {
    expect(checkInputBudget('gpt-4o', 1000)).toBe(null)
  })

  it('reports the overflow instead of trimming', () => {
    const budget = inputBudgetForModel('gpt-4')
    const overflow = checkInputBudget('gpt-4', budget + 500)
    expect(overflow).toMatchObject({ model: 'gpt-4', budget, overflowTokens: 500 })
  })
})
