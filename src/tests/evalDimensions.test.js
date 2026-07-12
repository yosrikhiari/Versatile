import { describe, it, expect } from 'vitest'
import {
  EVAL_DIMENSIONS,
  getDimensionsForWorkspace,
  getDimensionNames,
  getDefaultThreshold
} from '../config/evalDimensions'
import { WORKSPACE_TYPES } from '../config/workspace'

describe('evalDimensions', () => {
  it('exports EVAL_DIMENSIONS with all 6 workspace types', () => {
    const keys = Object.keys(EVAL_DIMENSIONS)
    expect(keys).toContain(WORKSPACE_TYPES.CREATIVE)
    expect(keys).toContain(WORKSPACE_TYPES.NOVEL)
    expect(keys).toContain(WORKSPACE_TYPES.LEGAL)
    expect(keys).toContain(WORKSPACE_TYPES.TECHNICAL)
    expect(keys).toContain(WORKSPACE_TYPES.BUSINESS)
    expect(keys).toContain(WORKSPACE_TYPES.RESEARCH)
    expect(keys.length).toBe(6)
  })

  it('CREATIVE has 5 dimensions with correct keys and structure', () => {
    const dims = EVAL_DIMENSIONS[WORKSPACE_TYPES.CREATIVE]
    const keys = Object.keys(dims)
    expect(keys).toEqual(['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing'])

    for (const [, dim] of Object.entries(dims)) {
      expect(dim).toHaveProperty('label')
      expect(dim).toHaveProperty('description')
      expect(dim).toHaveProperty('rubric')
      expect(dim).toHaveProperty('weight')
      expect(dim).toHaveProperty('defaultThreshold')
      expect(typeof dim.label).toBe('string')
      expect(typeof dim.description).toBe('string')
      expect(typeof dim.rubric).toBe('object')
      expect(typeof dim.weight).toBe('number')
      expect(typeof dim.defaultThreshold).toBe('number')
      expect(Object.keys(dim.rubric).length).toBe(10)
    }
  })

  it('NOVEL shares the same dimensions as CREATIVE', () => {
    expect(EVAL_DIMENSIONS[WORKSPACE_TYPES.NOVEL]).toBe(EVAL_DIMENSIONS[WORKSPACE_TYPES.CREATIVE])
  })

  it('LEGAL has 4 dimensions with correct keys', () => {
    const dims = EVAL_DIMENSIONS[WORKSPACE_TYPES.LEGAL]
    expect(Object.keys(dims)).toEqual(['clarity', 'ambiguity', 'liability', 'missing_provision'])
  })

  it('TECHNICAL has 4 dimensions with correct keys', () => {
    const dims = EVAL_DIMENSIONS[WORKSPACE_TYPES.TECHNICAL]
    expect(Object.keys(dims)).toEqual(['architecture', 'interface', 'security', 'validation'])
  })

  it('BUSINESS has 4 dimensions with correct keys', () => {
    const dims = EVAL_DIMENSIONS[WORKSPACE_TYPES.BUSINESS]
    expect(Object.keys(dims)).toEqual(['viability', 'financial', 'assumptions', 'kpi_clarity'])
  })

  it('RESEARCH has 4 dimensions with correct keys', () => {
    const dims = EVAL_DIMENSIONS[WORKSPACE_TYPES.RESEARCH]
    expect(Object.keys(dims)).toEqual(['rigor', 'methodology', 'citations', 'reproducibility'])
  })

  it('getDimensionsForWorkspace returns correct dimensions', () => {
    const creative = getDimensionsForWorkspace(WORKSPACE_TYPES.CREATIVE)
    expect(creative).toBe(EVAL_DIMENSIONS[WORKSPACE_TYPES.CREATIVE])

    const legal = getDimensionsForWorkspace(WORKSPACE_TYPES.LEGAL)
    expect(legal).toBe(EVAL_DIMENSIONS[WORKSPACE_TYPES.LEGAL])
  })

  it('getDimensionsForWorkspace falls back to CREATIVE for unknown type', () => {
    const result = getDimensionsForWorkspace('unknown_type')
    expect(result).toBe(EVAL_DIMENSIONS[WORKSPACE_TYPES.CREATIVE])
  })

  it('getDimensionNames returns correct dimension names', () => {
    const legalNames = getDimensionNames(WORKSPACE_TYPES.LEGAL)
    expect(legalNames).toEqual(['clarity', 'ambiguity', 'liability', 'missing_provision'])

    const creativeNames = getDimensionNames(WORKSPACE_TYPES.CREATIVE)
    expect(creativeNames).toEqual(['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing'])
  })

  it('getDefaultThreshold returns correct average for CREATIVE', () => {
    const threshold = getDefaultThreshold(WORKSPACE_TYPES.CREATIVE)
    expect(threshold).toBe(7)
  })

  it('getDefaultThreshold returns correct average for TECHNICAL', () => {
    const threshold = getDefaultThreshold(WORKSPACE_TYPES.TECHNICAL)
    expect(threshold).toBe(8)
  })

  it('getDefaultThreshold returns 7 for unknown workspace', () => {
    const threshold = getDefaultThreshold('unknown')
    expect(threshold).toBe(7)
  })

  it('every rubric has exactly 10 score levels', () => {
    for (const [, dims] of Object.entries(EVAL_DIMENSIONS)) {
      for (const [, dim] of Object.entries(dims)) {
        expect(Object.keys(dim.rubric).length).toBe(10)
      }
    }
  })

  it('every dimension has weight >= 0', () => {
    for (const dims of Object.values(EVAL_DIMENSIONS)) {
      for (const dim of Object.values(dims)) {
        expect(dim.weight).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('rubric levels are unique per dimension (no duplicate descriptions)', () => {
    for (const [type, dims] of Object.entries(EVAL_DIMENSIONS)) {
      for (const [key, dim] of Object.entries(dims)) {
        const levels = Object.values(dim.rubric)
        const unique = new Set(levels)
        expect(unique.size, `${type}/${key} has duplicate rubric levels`).toBe(levels.length)
      }
    }
  })

  it('rubric levels are monotonic (no identical consecutive levels)', () => {
    for (const [type, dims] of Object.entries(EVAL_DIMENSIONS)) {
      for (const [key, dim] of Object.entries(dims)) {
        const levels = Object.values(dim.rubric)
        for (let i = 1; i < levels.length; i++) {
          expect(levels[i], `${type}/${key} level ${i + 1} is identical to ${i}`).not.toBe(
            levels[i - 1]
          )
        }
      }
    }
  })

  it('rubric keys are strictly sequential 1-10', () => {
    for (const [type, dims] of Object.entries(EVAL_DIMENSIONS)) {
      for (const [key, dim] of Object.entries(dims)) {
        const keys = Object.keys(dim.rubric).map(Number)
        expect(keys, `${type}/${key} rubric keys`).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      }
    }
  })
})
