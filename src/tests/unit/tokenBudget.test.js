import { describe, it, expect } from 'vitest'
import {
  applyTokenBudget,
  DEFAULT_BUDGET_TOKENS
} from '@/composables/generation/shaping/tokenBudget'

// These exercise the heuristic path deliberately: no tokenizer is preloaded, so
// countTokens falls back to the character ratio. That is the behaviour every
// caller gets before the first generation of a session, and it must stay sane.

describe('applyTokenBudget', () => {
  it('returns bundle unchanged when within budget', () => {
    const bundle = { entitiesBlock: 'hello', relationshipBlock: 'world', manuscriptBlock: 'test' }
    const result = applyTokenBudget(bundle, 1000)
    expect(result.entitiesBlock).toBe('hello')
    expect(result.truncated).toBe(false)
    // 2 + 2 + 1 tokens
    expect(result.totalTokens).toBe(5)
  })

  it('truncates blocks when over budget', () => {
    const bundle = {
      entitiesBlock: 'A'.repeat(5000),
      relationshipBlock: 'B'.repeat(5000),
      manuscriptBlock: 'C'.repeat(5000)
    }
    const result = applyTokenBudget(bundle, 2000)
    expect(result.truncated).toBe(true)
    expect(result.totalTokens).toBeGreaterThan(0)
    expect(result.totalTokens).toBeLessThan(3750)
  })

  it('marks truncated when budget cannot be fully met', () => {
    const bundle = {
      entitiesBlock: 'A'.repeat(5000),
      relationshipBlock: 'B'.repeat(5000),
      manuscriptBlock: 'C'.repeat(5000)
    }
    const result = applyTokenBudget(bundle, 250)
    expect(result.truncated).toBe(true)
    expect(result.totalTokens).toBeGreaterThan(250)
  })

  it('handles empty blocks', () => {
    const bundle = { entitiesBlock: '', relationshipBlock: '' }
    const result = applyTokenBudget(bundle, 100)
    expect(result.truncated).toBe(false)
    expect(result.totalTokens).toBe(0)
  })

  it('ignores totalTokens and truncated keys in budget calc', () => {
    const bundle = { entitiesBlock: 'abc', totalTokens: 99999, truncated: true }
    const result = applyTokenBudget(bundle, 100)
    expect(result.totalTokens).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it('charges the system prompt against the same budget', () => {
    const bundle = { entitiesBlock: 'A'.repeat(4000) }
    const withoutPrompt = applyTokenBudget(bundle, 1200)
    const withPrompt = applyTokenBudget(bundle, 1200, 'S'.repeat(4000))
    expect(withoutPrompt.truncated).toBe(false)
    expect(withPrompt.truncated).toBe(true)
    expect(withPrompt.systemPromptTokens).toBe(1000)
  })

  it('truncates the real shapeContext bundle keys, not a hardcoded subset', () => {
    // Regression: the truncatable-key list used to be hardcoded to
    // entitiesBlock/relationshipBlock and did not match the keys shapeContext
    // actually emits, so entity context was never trimmed.
    const bundle = {
      projectBlock: 'P'.repeat(200),
      charactersBlock: 'C'.repeat(5000),
      locationsBlock: 'L'.repeat(5000),
      plotThreadsBlock: 'T'.repeat(3000),
      relationshipsBlock: 'R'.repeat(3000),
      manuscriptBlock: 'M'.repeat(5000)
    }
    const before = Math.ceil(Object.values(bundle).reduce((n, v) => n + v.length, 0) / 4)
    const result = applyTokenBudget(bundle, 2000)
    expect(result.truncated).toBe(true)
    expect(result.totalTokens).toBeLessThan(before)
  })

  it('defaults to DEFAULT_BUDGET_TOKENS', () => {
    expect(DEFAULT_BUDGET_TOKENS).toBe(1500)
    const bundle = { entitiesBlock: 'A'.repeat(3000), relationshipBlock: 'B'.repeat(3000) }
    const result = applyTokenBudget(bundle)
    expect(result.truncated).toBe(false)
    expect(result.totalTokens).toBe(1500)
  })
})
