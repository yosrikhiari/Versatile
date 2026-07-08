import { describe, it, expect } from 'vitest'
import { WORKSPACE_TYPES } from '@/config/workspace'
import {
  EVAL_DIMENSIONS,
  getDimensionsForWorkspace,
  getDimensionNames,
  getDefaultThreshold
} from '@/config/evalDimensions'

describe('EVAL_DIMENSIONS', () => {
  const expectedTypes = ['creative', 'novel', 'legal', 'technical', 'business', 'research']

  it('has entries for all workspace types with eval dimensions', () => {
    for (const type of expectedTypes) {
      expect(EVAL_DIMENSIONS).toHaveProperty(type)
    }
  })

  it('each dimension entry has required properties', () => {
    for (const [type, dims] of Object.entries(EVAL_DIMENSIONS)) {
      for (const [key, dim] of Object.entries(dims)) {
        expect(dim, `${type}.${key}`).toHaveProperty('label')
        expect(dim, `${type}.${key}`).toHaveProperty('description')
        expect(dim, `${type}.${key}`).toHaveProperty('rubric')
        expect(dim, `${type}.${key}`).toHaveProperty('weight')
        expect(dim, `${type}.${key}`).toHaveProperty('defaultThreshold')
        expect(dim.label).toBeTypeOf('string')
        expect(dim.description).toBeTypeOf('string')
        expect(dim.weight).toBeTypeOf('number')
        expect(dim.defaultThreshold).toBeTypeOf('number')
      }
    }
  })

  it('each rubric has scores 1 through 10 with non-trivial descriptions', () => {
    for (const [type, dims] of Object.entries(EVAL_DIMENSIONS)) {
      for (const [key, dim] of Object.entries(dims)) {
        const rubric = dim.rubric
        for (let score = 1; score <= 10; score++) {
          expect(rubric, `${type}.${key} rubric[${score}]`).toHaveProperty(score)
          const desc = rubric[score]
          expect(desc.length, `${type}.${key} rubric[${score}] too short: "${desc}"`).toBeGreaterThan(20)
        }
      }
    }
  })

  it('creative and novel share the same dimensions', () => {
    expect(EVAL_DIMENSIONS.novel).toBe(EVAL_DIMENSIONS.creative)
  })

  it('creative/novel have exactly 5 dimensions', () => {
    expect(Object.keys(EVAL_DIMENSIONS.creative).length).toBe(5)
    expect(Object.keys(EVAL_DIMENSIONS.novel).length).toBe(5)
  })

  it('legal, technical, business, research each have exactly 4 dimensions', () => {
    expect(Object.keys(EVAL_DIMENSIONS.legal).length).toBe(4)
    expect(Object.keys(EVAL_DIMENSIONS.technical).length).toBe(4)
    expect(Object.keys(EVAL_DIMENSIONS.business).length).toBe(4)
    expect(Object.keys(EVAL_DIMENSIONS.research).length).toBe(4)
  })
})

describe('getDimensionsForWorkspace', () => {
  it('returns creative dimensions for unknown workspace type', () => {
    const dims = getDimensionsForWorkspace('unknown')
    expect(dims).toBe(EVAL_DIMENSIONS.creative)
  })

  it('returns legal dimensions for legal', () => {
    const dims = getDimensionsForWorkspace('legal')
    expect(dims).toBe(EVAL_DIMENSIONS.legal)
  })

  it('returns technical dimensions for technical', () => {
    const dims = getDimensionsForWorkspace('technical')
    expect(dims).toBe(EVAL_DIMENSIONS.technical)
  })

  it('returns business dimensions for business', () => {
    const dims = getDimensionsForWorkspace('business')
    expect(dims).toBe(EVAL_DIMENSIONS.business)
  })

  it('returns research dimensions for research', () => {
    const dims = getDimensionsForWorkspace('research')
    expect(dims).toBe(EVAL_DIMENSIONS.research)
  })
})

describe('getDimensionNames', () => {
  it('returns correct dimension names for creative', () => {
    const names = getDimensionNames('creative')
    expect(names).toEqual(['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing'])
  })

  it('returns correct dimension names for legal', () => {
    const names = getDimensionNames('legal')
    expect(names).toEqual(['clarity', 'ambiguity', 'liability', 'missing_provision'])
  })
})

describe('getDefaultThreshold', () => {
  it('returns correct average for creative (all 7)', () => {
    const avg = getDefaultThreshold('creative')
    expect(avg).toBe(7)
  })

  it('returns correct average for legal (all 8)', () => {
    const avg = getDefaultThreshold('legal')
    expect(avg).toBe(8)
  })

  it('returns 7 for unknown workspace type', () => {
    const avg = getDefaultThreshold('unknown')
    expect(avg).toBe(7)
  })
})
