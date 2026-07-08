import { describe, it, expect } from 'vitest'
import { computeDegradation } from '../services/degradation'

const originalCritique = {
  score: 7,
  dimensionScores: { continuity: 8, voice: 7, pacing: 6, show_tell: 9 }
}

describe('computeDegradation', () => {
  it('returns empty result when either critique is null', () => {
    const result = computeDegradation(null, originalCritique)
    expect(result.hasRegressions).toBe(false)
    expect(result.hasMajorRegressions).toBe(false)
    expect(result.dimensions).toEqual({})
  })

  it('returns empty result when both critiques are null', () => {
    const result = computeDegradation(null, null)
    expect(result.hasRegressions).toBe(false)
    expect(result.dimensions).toEqual({})
  })

  it('classifies improved dimensions correctly', () => {
    const revisedCritique = {
      score: 9,
      dimensionScores: { continuity: 9, voice: 8, pacing: 8, show_tell: 9 }
    }
    const result = computeDegradation(originalCritique, revisedCritique)

    expect(result.dimensions.continuity.status).toBe('improved')
    expect(result.dimensions.continuity.delta).toBe(1)
    expect(result.dimensions.voice.status).toBe('improved')
    expect(result.dimensions.voice.delta).toBe(1)
    expect(result.dimensions.pacing.status).toBe('improved')
    expect(result.dimensions.pacing.delta).toBe(2)
    expect(result.hasRegressions).toBe(false)
    expect(result.hasMajorRegressions).toBe(false)
  })

  it('classifies regressed dimensions correctly', () => {
    const revisedCritique = {
      score: 5,
      dimensionScores: { continuity: 7, voice: 6, pacing: 5, show_tell: 8 }
    }
    const result = computeDegradation(originalCritique, revisedCritique)

    expect(result.dimensions.continuity.status).toBe('regressed')
    expect(result.dimensions.continuity.delta).toBe(-1)
    expect(result.dimensions.pacing.status).toBe('regressed')
    expect(result.dimensions.pacing.delta).toBe(-1)
    expect(result.hasRegressions).toBe(true)
    expect(result.hasMajorRegressions).toBe(false)
  })

  it('classifies major regressions when delta <= -2', () => {
    const revisedCritique = {
      score: 4,
      dimensionScores: { continuity: 5, voice: 7, pacing: 3, show_tell: 9 }
    }
    const result = computeDegradation(originalCritique, revisedCritique)

    expect(result.dimensions.continuity.status).toBe('major_regression')
    expect(result.dimensions.continuity.delta).toBe(-3)
    expect(result.dimensions.pacing.status).toBe('major_regression')
    expect(result.dimensions.pacing.delta).toBe(-3)
    expect(result.hasRegressions).toBe(true)
    expect(result.hasMajorRegressions).toBe(true)
  })

  it('classifies unchanged dimensions correctly', () => {
    const revisedCritique = {
      score: 7,
      dimensionScores: { continuity: 8, voice: 7, pacing: 6, show_tell: 9 }
    }
    const result = computeDegradation(originalCritique, revisedCritique)

    expect(result.dimensions.continuity.status).toBe('unchanged')
    expect(result.dimensions.continuity.delta).toBe(0)
    expect(result.hasRegressions).toBe(false)
    expect(result.hasMajorRegressions).toBe(false)
  })

  it('handles missing dimensionScores gracefully', () => {
    const missing = { score: 7 }
    const result = computeDegradation(missing, originalCritique)
    expect(result.hasRegressions).toBe(false)
  })

  it('handles new dimensions in revised critique', () => {
    const revised = {
      score: 8,
      dimensionScores: { continuity: 8, voice: 7, pacing: 6, show_tell: 9, new_dim: 8 }
    }
    const result = computeDegradation(originalCritique, revised)
    expect(result.dimensions.new_dim).toBeDefined()
  })
})
