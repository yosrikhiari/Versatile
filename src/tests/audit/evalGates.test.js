import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EVAL_GATE_CONFIG } from '../../config/evalGateConfig'

const { mockEvaluateScene } = vi.hoisted(() => ({
  mockEvaluateScene: vi.fn()
}))

vi.mock('../../composables/useStoryCritic', () => ({
  useStoryCritic: vi.fn(() => ({
    evaluateScene: (...args) => mockEvaluateScene(...args)
  }))
}))

describe('GATE-04: Eval Gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    EVAL_GATE_CONFIG.dimensionCoverage.enabled = true
    EVAL_GATE_CONFIG.dimensionCoverage.strict = false
    EVAL_GATE_CONFIG.scoreDistribution.enabled = true
    EVAL_GATE_CONFIG.scoreDistribution.suspectScore = 7
    EVAL_GATE_CONFIG.scoreDistribution.suspectScoreRange = [1, 10]
    EVAL_GATE_CONFIG.revisionEffectiveness.enabled = true
  })

  describe('gateDimensionCoverage', () => {
    it('all dims covered returns pass with no warnings', async () => {
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage(
        {
          issues: [
            { type: 'continuity', severity: 'major', description: 'a' },
            { type: 'voice', severity: 'minor', description: 'b' },
            { type: 'emotional_goal', severity: 'major', description: 'c' },
            { type: 'show_tell', severity: 'minor', description: 'd' },
            { type: 'pacing', severity: 'major', description: 'e' }
          ]
        },
        'creative'
      )
      expect(result.pass).toBe(true)
      expect(result.missing).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('reports missing dims as warnings when strict=false (default)', async () => {
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage(
        {
          issues: [{ type: 'continuity', severity: 'major', description: 'a' }]
        },
        'creative'
      )
      expect(result.pass).toBe(true)
      expect(result.missing).toEqual(['voice', 'emotional_goal', 'show_tell', 'pacing'])
      expect(result.warnings.length).toBe(4)
    })

    it('fails on missing dims when strict=true', async () => {
      EVAL_GATE_CONFIG.dimensionCoverage.strict = true
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage(
        {
          issues: [{ type: 'continuity', severity: 'major', description: 'a' }]
        },
        'creative'
      )
      expect(result.pass).toBe(false)
    })

    it('returns pass when config disabled', async () => {
      EVAL_GATE_CONFIG.dimensionCoverage.enabled = false
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage(null, 'creative')
      expect(result.pass).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('returns pass for unknown workspace type (defaults to creative dims)', async () => {
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage({ issues: [] }, 'unknown')
      expect(result.pass).toBe(true)
      expect(result.missing).toEqual([
        'continuity',
        'voice',
        'emotional_goal',
        'show_tell',
        'pacing'
      ])
    })

    it('handles null critiqueResult gracefully', async () => {
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage(null, 'creative')
      expect(result.pass).toBe(true)
      expect(result.missing.length).toBe(5)
    })

    it('uses correct dims for legal workspace', async () => {
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage(
        {
          issues: [
            { type: 'clarity', severity: 'minor', description: 'a' },
            { type: 'ambiguity', severity: 'minor', description: 'b' },
            { type: 'liability', severity: 'major', description: 'c' },
            { type: 'missing_provision', severity: 'major', description: 'd' }
          ]
        },
        'legal'
      )
      expect(result.pass).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('uses correct dims for technical workspace', async () => {
      const { gateDimensionCoverage } = await import('../../services/evalGates')
      const result = gateDimensionCoverage(
        {
          issues: [{ type: 'architecture', severity: 'major', description: 'a' }]
        },
        'technical'
      )
      expect(result.missing).toEqual(['interface', 'security', 'validation'])
    })
  })

  describe('gateScoreDistribution', () => {
    it('flags suspect score 7', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({
        score: 7,
        issues: [{ type: 'voice', severity: 'minor', description: 'test' }],
        strengths: []
      })
      expect(result.pass).toBe(false)
      expect(result.flags.some((f) => f.includes('suspect value 7'))).toBe(true)
    })

    it('flags score below min range', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({ score: 0, issues: [], strengths: [] })
      expect(result.pass).toBe(false)
      expect(result.flags.some((f) => f.includes('outside expected range'))).toBe(true)
    })

    it('flags score above max range', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({ score: 11, issues: [], strengths: [] })
      expect(result.pass).toBe(false)
      expect(result.flags.some((f) => f.includes('outside expected range'))).toBe(true)
    })

    it('flags high score with 3+ major issues as possible mismatch', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({
        score: 10,
        issues: [
          { type: 'continuity', severity: 'major', description: 'a' },
          { type: 'voice', severity: 'major', description: 'b' },
          { type: 'pacing', severity: 'major', description: 'c' }
        ],
        strengths: ['good']
      })
      expect(result.pass).toBe(false)
      expect(result.flags.some((f) => f.includes('mismatch'))).toBe(true)
    })

    it('does not flag high score with fewer major issues', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({
        score: 9,
        issues: [
          { type: 'voice', severity: 'minor', description: 'a' },
          { type: 'pacing', severity: 'major', description: 'b' }
        ],
        strengths: ['good']
      })
      const mismatchFlag = result.flags.some((f) => f.includes('mismatch'))
      expect(mismatchFlag).toBe(false)
    })

    it('flags passing score with zero issues as degenerate', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({ score: 8, issues: [], strengths: ['great'] })
      expect(result.pass).toBe(false)
      expect(result.flags.some((f) => f.includes('degenerate'))).toBe(true)
    })

    it('returns pass with no flags for valid critique', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({
        score: 8,
        issues: [{ type: 'voice', severity: 'minor', description: 'test' }],
        strengths: ['good']
      })
      expect(result.pass).toBe(true)
      expect(result.flags).toEqual([])
    })

    it('returns pass when config disabled', async () => {
      EVAL_GATE_CONFIG.scoreDistribution.enabled = false
      const { gateScoreDistribution } = await import('../../services/evalGates')
      const result = gateScoreDistribution({ score: 7, issues: [] })
      expect(result.pass).toBe(true)
    })

    it('returns pass for null critiqueResult', async () => {
      const { gateScoreDistribution } = await import('../../services/evalGates')
      expect(gateScoreDistribution(null).pass).toBe(true)
      expect(gateScoreDistribution(undefined).pass).toBe(true)
    })
  })

  describe('gateRevisionEffectiveness', () => {
    it('flags identical draft when issues existed', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      const original = {
        score: 5,
        issues: [{ type: 'voice', severity: 'major', description: 'test' }],
        strengths: []
      }
      const draft = 'This is the exact same draft content.'
      const result = await gateRevisionEffectiveness(original, draft, draft)
      expect(result.pass).toBe(false)
      expect(result.regressions.some((r) => r.includes('Revision unchanged'))).toBe(true)
      expect(result.delta).toBe(0)
    })

    it('passes identical draft when no issues existed', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      const original = { score: 8, issues: [], strengths: ['good'] }
      const draft = 'This is the exact same draft content.'
      const result = await gateRevisionEffectiveness(original, draft, draft)
      expect(result.pass).toBe(true)
      expect(result.regressions).toEqual([])
    })

    it('passes when revision improves score', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      const result = await gateRevisionEffectiveness(
        {
          score: 6,
          issues: [{ type: 'voice', severity: 'major', description: 'test' }],
          strengths: []
        },
        'The improved rewrite.',
        'The short draft.',
        { score: 8, issues: [], strengths: ['improved'] }
      )
      expect(result.pass).toBe(true)
      expect(result.delta).toBe(2)
    })

    it('flags when score decreases after revision', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      const result = await gateRevisionEffectiveness(
        { score: 8, issues: [], strengths: [] },
        'Modified version of the draft that is different.',
        'Original short draft.',
        {
          score: 5,
          issues: [{ type: 'pacing', severity: 'major', description: 'worse' }],
          strengths: []
        }
      )
      expect(result.pass).toBe(false)
      expect(result.delta).toBe(-3)
      expect(result.regressions.some((r) => r.includes('Score decreased'))).toBe(true)
    })

    it('flags word count change over 15%', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      const result = await gateRevisionEffectiveness(
        { score: 7, issues: [], strengths: [] },
        'word '.repeat(30),
        'word '.repeat(20),
        { score: 7, issues: [], strengths: [] }
      )
      expect(result.regressions.some((r) => r.includes('Word count'))).toBe(true)
    })

    it('passes with small word count change within tolerance', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      const result = await gateRevisionEffectiveness(
        { score: 7, issues: [], strengths: [] },
        'word '.repeat(22),
        'word '.repeat(20),
        { score: 7, issues: [], strengths: [] }
      )
      const wcFlag = result.regressions.some((r) => r.includes('Word count'))
      expect(wcFlag).toBe(false)
    })

    it('calls useStoryCritic when no revisionCritiqueResult provided', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      mockEvaluateScene.mockResolvedValueOnce({
        score: 8,
        pass: true,
        issues: [],
        strengths: ['improved']
      })
      const result = await gateRevisionEffectiveness(
        { score: 7, issues: [], strengths: [] },
        'Revised draft that is different from the original.',
        'Original draft.'
      )
      expect(mockEvaluateScene).toHaveBeenCalledTimes(1)
      expect(result.delta).toBe(1)
    })

    it('handles useStoryCritic error gracefully with fallback', async () => {
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      mockEvaluateScene.mockRejectedValueOnce(new Error('API error'))
      const result = await gateRevisionEffectiveness(
        { score: 7, issues: [], strengths: [] },
        'Revised draft that is different.',
        'Original draft.'
      )
      expect(result.delta).toBe(0)
    })

    it('returns pass when config disabled', async () => {
      EVAL_GATE_CONFIG.revisionEffectiveness.enabled = false
      const { gateRevisionEffectiveness } = await import('../../services/evalGates')
      const result = await gateRevisionEffectiveness(null, null, null)
      expect(result.pass).toBe(true)
      expect(result.delta).toBe(0)
    })
  })
})
