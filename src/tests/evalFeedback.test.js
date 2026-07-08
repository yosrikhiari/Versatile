import { describe, it, expect } from 'vitest'
import { formatEvalFeedback } from '../services/evalFeedback'

describe('formatEvalFeedback', () => {
  it('returns empty string for empty input', () => {
    expect(formatEvalFeedback([])).toBe('')
  })

  it('returns empty string for null input', () => {
    expect(formatEvalFeedback(null)).toBe('')
  })

  it('formats a single passing evaluation', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 1, passed: true, score: 8.2, topIssues: [] }
    ])
    expect(result).toContain('Scene 1: Pass (8.2)')
  })

  it('formats a failing evaluation with issues', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 1, passed: false, score: 4.5, topIssues: ['weak pacing', 'dialogue feels flat'] }
    ])
    expect(result).toContain('Scene 1: FAIL (4.5)')
    expect(result).toContain('weak pacing')
    expect(result).toContain('dialogue feels flat')
  })

  it('formats multiple scenes', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 1, passed: true, score: 8, topIssues: [] },
      { sceneIndex: 2, passed: false, score: 5, topIssues: ['character voice inconsistency'] },
      { sceneIndex: 3, passed: true, score: 9, topIssues: [] }
    ])
    expect(result).toContain('Scene 1: Pass (8)')
    expect(result).toContain('Scene 2: FAIL (5)')
    expect(result).toContain('character voice inconsistency')
    expect(result).toContain('Scene 3: Pass (9)')
  })

  it('handles missing score gracefully', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 1, passed: true, topIssues: [] }
    ])
    expect(result).toContain('Scene 1: Pass')
    expect(result).not.toContain('undefined')
  })

  it('uses fallback index when sceneIndex is missing', () => {
    const result = formatEvalFeedback([
      { passed: true, score: 7, topIssues: [] }
    ])
    expect(result).toContain('Scene 1: Pass (7)')
  })

  it('handles undefined topIssues', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 1, passed: false, score: 4 }
    ])
    expect(result).toContain('Scene 1: FAIL (4)')
    expect(result).not.toContain('undefined')
  })

  it('handles null topIssues', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 2, passed: true, score: 8, topIssues: null }
    ])
    expect(result).toContain('Scene 2: Pass (8)')
  })

  it('handles special characters in issue text', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 1, passed: false, score: 3, topIssues: ['**weak pacing**', 'dialogue "feels" flat\n(newline here)'] }
    ])
    expect(result).toContain('**weak pacing**')
    expect(result).toContain('dialogue "feels" flat')
    expect(result).toContain('(newline here)')
  })

  it('handles passed: undefined', () => {
    const result = formatEvalFeedback([
      { sceneIndex: 1, score: 5, topIssues: [] }
    ])
    expect(result).toContain('Scene 1: FAIL')
  })
})
