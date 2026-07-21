import { describe, it, expect } from 'vitest'
import { autoAdjustPrompt } from '../../evaluation/autoPromptAdjuster'

function makeEval(dimensionScores) {
  return { passed: true, score: 8, dimensionScores }
}

describe('autoAdjustPrompt', () => {
  it('returns empty instructions for empty history', () => {
    const result = autoAdjustPrompt([])
    expect(result.focusInstructions).toBe('')
    expect(result.givenHints).toEqual([])
  })

  it('returns empty instructions when no dimensionScores present', () => {
    const result = autoAdjustPrompt([{ passed: true, score: 8 }])
    expect(result.focusInstructions).toBe('')
    expect(result.givenHints).toEqual([])
  })

  it('returns empty when all dimensions above threshold', () => {
    const evals = [makeEval({ continuity: 8, voice: 9, pacing: 7 })]
    const result = autoAdjustPrompt(evals)
    expect(result.focusInstructions).toBe('')
    expect(result.givenHints).toEqual([])
  })

  it('identifies weakest dimension below threshold', () => {
    const evals = [makeEval({ continuity: 4, voice: 9, pacing: 8 })]
    const result = autoAdjustPrompt(evals, { workspaceType: 'creative' })
    expect(result.focusInstructions).toContain('Continuity')
    expect(result.focusInstructions).toContain('(4.0/10)')
    expect(result.givenHints).toHaveLength(1)
    expect(result.givenHints[0].dimension).toBe('continuity')
  })

  it('uses dimensionPromptMap snippet when available', () => {
    const evals = [makeEval({ show_tell: 3, continuity: 9, voice: 8 })]
    const result = autoAdjustPrompt(evals, { workspaceType: 'creative' })
    expect(result.focusInstructions).toContain('Show vs Tell')
    expect(result.focusInstructions).toContain('Dramatize')
    expect(result.givenHints[0].hint).toContain('Dramatize')
  })

  it('limits focus areas to maxFocusAreas', () => {
    const evals = [makeEval({ continuity: 3, voice: 4, pacing: 5, show_tell: 6 })]
    const result = autoAdjustPrompt(evals, { threshold: 7, maxFocusAreas: 2 })
    const lines = result.focusInstructions.split('\n').filter((l) => l.startsWith('- '))
    expect(lines).toHaveLength(2)
    expect(result.givenHints).toHaveLength(2)
  })

  it('averages scores across multiple evals', () => {
    const evals = [
      makeEval({ continuity: 4, voice: 9 }),
      makeEval({ continuity: 6, voice: 8 })
    ]
    const result = autoAdjustPrompt(evals)
    expect(result.focusInstructions).toContain('Continuity')
    expect(result.focusInstructions).toContain('(5.0/10)')
  })

  it('dampens repeated dimensions via pastGivenHints', () => {
    const evals = [makeEval({ continuity: 4, voice: 5 })]
    const pastHints = [
      { dimension: 'continuity', hint: 'fix continuity' },
      { dimension: 'continuity', hint: 'fix continuity again' }
    ]
    const result = autoAdjustPrompt(evals, {
      pastGivenHints: pastHints,
      dampenRepeats: true,
      repeatWeight: 1.5
    })
    expect(result.givenHints[0].dimension).toBe('voice')
  })

  it('returns hints array for downstream tracking', () => {
    const evals = [makeEval({ continuity: 3, pacing: 8 })]
    const result = autoAdjustPrompt(evals)
    expect(result.givenHints).toHaveLength(1)
    expect(result.givenHints[0]).toHaveProperty('dimension', 'continuity')
    expect(result.givenHints[0]).toHaveProperty('hint')
    expect(result.givenHints[0]).toHaveProperty('avg', 3)
    expect(result.givenHints[0]).toHaveProperty('count', 1)
    expect(result.givenHints[0]).toHaveProperty('label')
  })

  it('handles multiple workspace types (legal)', () => {
    const evals = [makeEval({ clarity: 3, liability: 9, missing_provision: 8 })]
    const result = autoAdjustPrompt(evals, { workspaceType: 'legal' })
    expect(result.focusInstructions).toContain('Clarity')
    expect(result.givenHints[0].dimension).toBe('clarity')
  })

  it('falls back to generic instruction when dimension not in prompt map', () => {
    const evals = [makeEval({ unknown_dim: 3 })]
    const result = autoAdjustPrompt(evals, { workspaceType: 'creative' })
    expect(result.focusInstructions).toContain('unknown dim')
    expect(result.givenHints[0].hint).toContain('Prioritize improving')
  })
})
