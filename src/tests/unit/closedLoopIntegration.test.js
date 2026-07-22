import { describe, it, expect } from 'vitest'
import { autoAdjustPrompt } from '../../evaluation/autoPromptAdjuster'
import { computeDegradation } from '../../services/degradation'
import {
  gateDimensionCoverage,
  gateScoreDistribution,
  gateRevisionEffectiveness
} from '../../services/evalGates'

function makeCritique(score, dimensionScores) {
  return {
    pass: true,
    score,
    dimensionScores,
    issues: [
      { type: Object.keys(dimensionScores)[0], severity: 'minor', text: 'issue' }
    ],
    strengths: ['coherent']
  }
}

describe('closed-loop generate → eval → adjust → re-eval → verify', () => {
  it('full flow: low scores trigger focus, revision improves, degradation confirms gain', () => {
    const evalHistory = [
      {
        sceneIdx: 0,
        dimensionScores: { continuity: 4, voice: 8, pacing: 7, show_tell: 5, emotional_goal: 9 },
        issues: [{ type: 'continuity', severity: 'major', text: 'Timeline contradiction' }],
        strengths: ['Strong voice']
      }
    ]

    const adjustment = autoAdjustPrompt(evalHistory, { threshold: 7, maxFocusAreas: 2 })
    expect(adjustment.focusInstructions).toContain('Continuity')
    expect(adjustment.focusInstructions).toContain('Show vs Tell')
    expect(adjustment.givenHints).toHaveLength(2)
    expect(adjustment.givenHints[0].dimension).toBe('continuity')
    expect(adjustment.givenHints[0].avg).toBe(4)

    const originalCritique = makeCritique(6, { continuity: 4, voice: 8, pacing: 7, show_tell: 5, emotional_goal: 9 })
    const revisedCritique = makeCritique(8, { continuity: 7, voice: 8, pacing: 7, show_tell: 7, emotional_goal: 9 })

    const degradation = computeDegradation(originalCritique, revisedCritique)
    expect(degradation.hasRegressions).toBe(false)
    expect(degradation.hasMajorRegressions).toBe(false)
    expect(degradation.dimensions.continuity.delta).toBe(3)
    expect(degradation.dimensions.continuity.status).toBe('improved')
    expect(degradation.dimensions.show_tell.delta).toBe(2)
    expect(degradation.dimensions.show_tell.status).toBe('improved')
    expect(degradation.dimensions.voice.delta).toBe(0)
    expect(degradation.dimensions.voice.status).toBe('unchanged')
  })

  it('gateRevisionEffectiveness detects score improvement when revisionCritiqueResult provided', async () => {
    const originalCritique = makeCritique(5, { continuity: 3, voice: 6, pacing: 5 })
    const revisedCritique = makeCritique(8, { continuity: 7, voice: 7, pacing: 7 })
    const originalProse = 'A draft that needs some changes to improve and polish'
    const revisedProse = 'A better draft after revision and careful editing now'
    const result = await gateRevisionEffectiveness(
      originalCritique,
      revisedProse,
      originalProse,
      revisedCritique
    )
    expect(result.delta).toBe(3)
    expect(result.pass).toBe(true)
    expect(result.regressions).toEqual([])
  })

  it('gateRevisionEffectiveness flags regression when score drops', async () => {
    const originalCritique = makeCritique(8, { continuity: 8, voice: 8, pacing: 8 })
    const revisedCritique = makeCritique(5, { continuity: 4, voice: 6, pacing: 5 })
    const originalProse = 'A strong draft with good prose here and there now'
    const revisedProse = 'A weaker draft with problems and issues creeping in'
    const result = await gateRevisionEffectiveness(
      originalCritique,
      revisedProse,
      originalProse,
      revisedCritique
    )
    expect(result.delta).toBe(-3)
    expect(result.pass).toBe(false)
    expect(result.regressions).toHaveLength(1)
    expect(result.regressions[0]).toMatch(/Score decreased/)
  })

  it('gateRevisionEffectiveness warns when revision unchanged from original despite issues', async () => {
    const originalCritique = makeCritique(5, { continuity: 3 })
    const prose = 'Unchanged draft.'

    const result = await gateRevisionEffectiveness(
      originalCritique,
      prose,
      prose,
      originalCritique
    )

    expect(result.pass).toBe(false)
    expect(result.regressions).toHaveLength(1)
    expect(result.regressions[0]).toMatch(/Revision unchanged/)
  })

  it('gateDimensionCoverage validates coverage for workspace type', () => {
    const critique = {
      issues: [
        { type: 'continuity', severity: 'minor', text: 'gap' },
        { type: 'voice', severity: 'minor', text: 'inconsistency' },
        { type: 'pacing', severity: 'minor', text: 'slow' },
        { type: 'show_tell', severity: 'minor', text: 'telling' },
        { type: 'emotional_goal', severity: 'minor', text: 'missed' }
      ]
    }

    const result = gateDimensionCoverage(critique, 'creative')
    expect(result.missing).toEqual([])
    expect(result.pass).toBe(true)
  })

  it('gateDimensionCoverage flags missing dimensions', () => {
    const critique = { issues: [{ type: 'continuity', severity: 'minor', text: 'gap' }] }

    const result = gateDimensionCoverage(critique, 'creative')
    expect(result.missing).toContain('voice')
    expect(result.missing).toContain('pacing')
    expect(result.warnings.length).toBeGreaterThanOrEqual(4)
  })

  it('gateScoreDistribution flags score equal to suspect value', () => {
    const critique = makeCritique(7, { continuity: 7 })
    const result = gateScoreDistribution(critique)
    expect(result.pass).toBe(false)
    expect(result.flags[0]).toMatch(/suspect/)
  })

  it('gateScoreDistribution passes normal scores', () => {
    const critique = makeCritique(8, { continuity: 8 })
    const result = gateScoreDistribution(critique)
    expect(result.pass).toBe(true)
  })

  describe('dampening across multiple rounds (simulating iterated closed-loop)', () => {
    it('auto-adjust shifts focus when a weak dimension was already hinted in a prior round', () => {
      const round1Evals = [
        { sceneIdx: 0, dimensionScores: { continuity: 3, voice: 9, pacing: 8 } }
      ]
      const round1 = autoAdjustPrompt(round1Evals, { threshold: 7 })
      expect(round1.givenHints[0].dimension).toBe('continuity')

      const round2Evals = [
        { sceneIdx: 0, dimensionScores: { continuity: 5, voice: 9, pacing: 8 } },
        { sceneIdx: 1, dimensionScores: { continuity: 4, voice: 8, show_tell: 4 } }
      ]
      const round2 = autoAdjustPrompt(round2Evals, {
        threshold: 7,
        pastGivenHints: round1.givenHints,
        dampenRepeats: true
      })

      expect(round2.givenHints[0].dimension).toBe('show_tell')
    })

    it('cumulative hints array enables downstream tracking across rounds', () => {
      let allHints = []
      const evalsRound1 = [
        { sceneIdx: 0, dimensionScores: { continuity: 3, voice: 9, pacing: 8 } }
      ]
      const r1 = autoAdjustPrompt(evalsRound1, { threshold: 7 })
      allHints = [...allHints, ...r1.givenHints]
      expect(allHints).toHaveLength(1)

      const evalsRound2 = [
        { sceneIdx: 0, dimensionScores: { continuity: 5, voice: 9, pacing: 8 } },
        { sceneIdx: 1, dimensionScores: { continuity: 4, voice: 8, show_tell: 4 } }
      ]
      const r2 = autoAdjustPrompt(evalsRound2, { threshold: 7, pastGivenHints: allHints })
      allHints = [...allHints, ...r2.givenHints]
      expect(allHints).toHaveLength(3)
      expect(r2.givenHints[0].dimension).toBe('show_tell')
    })
  })
})
