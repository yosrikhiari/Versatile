import { describe, it, expect } from 'vitest'
import { applyTokenBudget } from '@/composables/generation/shaping/tokenBudget'

describe('applyTokenBudget', () => {
  it('returns bundle unchanged when within budget', () => {
    const bundle = { entitiesBlock: 'hello', relationshipBlock: 'world', manuscriptBlock: 'test' }
    const result = applyTokenBudget(bundle, 1000)
    expect(result.entitiesBlock).toBe('hello')
    expect(result.truncated).toBe(false)
    expect(result.totalChars).toBe(14)
  })

  it('truncates blocks when over budget', () => {
    const bundle = {
      entitiesBlock: 'A'.repeat(5000),
      relationshipBlock: 'B'.repeat(5000),
      manuscriptBlock: 'C'.repeat(5000)
    }
    const result = applyTokenBudget(bundle, 8000)
    expect(result.truncated).toBe(true)
    expect(result.totalChars).toBeGreaterThan(0)
    expect(result.totalChars).toBeLessThan(15000)
  })

  it('marks truncated when budget cannot be fully met', () => {
    const bundle = {
      entitiesBlock: 'A'.repeat(5000),
      relationshipBlock: 'B'.repeat(5000),
      manuscriptBlock: 'C'.repeat(5000)
    }
    const result = applyTokenBudget(bundle, 1000)
    expect(result.truncated).toBe(true)
    expect(result.totalChars).toBeGreaterThan(1000)
  })

  it('handles empty blocks', () => {
    const bundle = { entitiesBlock: '', relationshipBlock: '' }
    const result = applyTokenBudget(bundle, 100)
    expect(result.truncated).toBe(false)
    expect(result.totalChars).toBe(0)
  })

  it('ignores totalChars and truncated keys in budget calc', () => {
    const bundle = { entitiesBlock: 'abc', totalChars: 99999, truncated: true }
    const result = applyTokenBudget(bundle, 100)
    expect(result.totalChars).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('uses default budget of 6000', () => {
    const bundle = { entitiesBlock: 'A'.repeat(3000), relationshipBlock: 'B'.repeat(3000) }
    const result = applyTokenBudget(bundle)
    expect(result.truncated).toBe(false)
    expect(result.totalChars).toBe(6000)
  })
})
