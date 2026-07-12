import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args)
}))

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: vi.fn(() => ({
    activeWorkspaceType: 'creative'
  }))
}))

vi.mock('../../config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: {
    creative: {
      critic: 'mock critic prompt',
      revisor: 'mock revisor prompt'
    }
  }
}))

vi.mock('../../config/ai', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, FEATURES: { STORY_GENERATION: 'story_generation' } }
})

const mockAiGenerate = vi.fn()


describe('gateDimensionCoverage', () => {
  let gateDimensionCoverage

  beforeAll(async () => {
    const mod = await import('../../services/evalGates')
    gateDimensionCoverage = mod.gateDimensionCoverage
  })

  it('passes when all expected dimensions are covered', () => {
    const critiqueResult = {
      score: 7,
      issues: [
        { type: 'continuity', description: 'x', severity: 'minor' },
        { type: 'voice', description: 'x', severity: 'minor' },
        { type: 'emotional_goal', description: 'x', severity: 'minor' },
        { type: 'show_tell', description: 'x', severity: 'minor' },
        { type: 'pacing', description: 'x', severity: 'minor' }
      ],
      strengths: [],
      pass: true
    }
    const result = gateDimensionCoverage(critiqueResult, 'creative')
    expect(result.pass).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('warns on partial coverage (soft gate)', () => {
    const critiqueResult = {
      score: 6,
      issues: [
        { type: 'continuity', description: 'x', severity: 'major' },
        { type: 'voice', description: 'x', severity: 'major' }
      ],
      strengths: [],
      pass: false
    }
    const result = gateDimensionCoverage(critiqueResult, 'creative')
    expect(result.pass).toBe(true)
    expect(result.missing.length).toBe(3)
    expect(result.missing).toContain('emotional_goal')
    expect(result.missing).toContain('show_tell')
    expect(result.missing).toContain('pacing')
    expect(result.warnings.length).toBe(3)
  })

  it('passes with no issues when strict=false', () => {
    const result = gateDimensionCoverage(
      { score: 10, issues: [], strengths: [], pass: true },
      'creative'
    )
    expect(result.pass).toBe(true)
    expect(result.missing.length).toBe(5)
  })

  it('returns pass=true for null critiqueResult', () => {
    const result = gateDimensionCoverage(null, 'creative')
    expect(result.pass).toBe(true)
  })

  it('returns expected names for legal workspace type', () => {
    const critiqueResult = {
      score: 8,
      issues: [
        { type: 'clarity', description: 'x', severity: 'minor' },
        { type: 'ambiguity', description: 'x', severity: 'minor' },
        { type: 'liability', description: 'x', severity: 'minor' },
        { type: 'missing_provision', description: 'x', severity: 'minor' }
      ],
      strengths: [],
      pass: true
    }
    const result = gateDimensionCoverage(critiqueResult, 'legal')
    expect(result.pass).toBe(true)
    expect(result.missing).toEqual([])
  })
})

describe('gateScoreDistribution', () => {
  let gateScoreDistribution

  beforeAll(async () => {
    const mod = await import('../../services/evalGates')
    gateScoreDistribution = mod.gateScoreDistribution
  })

  it('passes for valid score 8 with issues', () => {
    const result = gateScoreDistribution({
      score: 8,
      issues: [{ type: 'pacing', description: 'x', severity: 'minor' }],
      strengths: [],
      pass: true
    })
    expect(result.pass).toBe(true)
    expect(result.flags).toEqual([])
  })

  it('flags score=7 as suspect', () => {
    const result = gateScoreDistribution({
      score: 7,
      issues: [{ type: 'pacing', description: 'x', severity: 'minor' }],
      strengths: [],
      pass: true
    })
    expect(result.pass).toBe(false)
    expect(result.flags.some((f) => f.includes('suspect'))).toBe(true)
  })

  it('flags score outside range', () => {
    const result = gateScoreDistribution({
      score: 0,
      issues: [],
      strengths: [],
      pass: true
    })
    expect(result.pass).toBe(false)
    expect(result.flags.some((f) => f.includes('outside expected range'))).toBe(true)
  })

  it('flags high score with major issues', () => {
    const result = gateScoreDistribution({
      score: 10,
      issues: [
        { type: 'continuity', description: 'x', severity: 'major' },
        { type: 'voice', description: 'x', severity: 'major' },
        { type: 'emotional_goal', description: 'x', severity: 'major' }
      ],
      strengths: [],
      pass: true
    })
    expect(result.pass).toBe(false)
    expect(result.flags.some((f) => f.includes('mismatch'))).toBe(true)
  })

  it('flags score>=7 with zero issues', () => {
    const result = gateScoreDistribution({
      score: 8,
      issues: [],
      strengths: [],
      pass: true
    })
    expect(result.pass).toBe(false)
    expect(result.flags.some((f) => f.includes('degenerate'))).toBe(true)
  })

  it('passes for null critiqueResult', () => {
    const result = gateScoreDistribution(null)
    expect(result.pass).toBe(true)
  })
})

describe('gateRevisionEffectiveness', () => {
  let gateRevisionEffectiveness

  beforeAll(async () => {
    const mod = await import('../../services/evalGates')
    gateRevisionEffectiveness = mod.gateRevisionEffectiveness
  })

  it('detects identical drafts when issues existed', async () => {
    const critique = {
      score: 5,
      issues: [{ type: 'pacing', description: 'Too slow', severity: 'major' }],
      strengths: [],
      pass: false
    }
    const result = await gateRevisionEffectiveness(critique, 'same draft', 'same draft')
    expect(result.pass).toBe(false)
    expect(result.regressions.some((r) => r.includes('unchanged'))).toBe(true)
    expect(result.delta).toBe(0)
  })

  it('passes when revision is different and score improves', async () => {
    const critique = {
      score: 5,
      issues: [{ type: 'pacing', description: 'Too slow', severity: 'major' }],
      strengths: [],
      pass: false
    }
    const revisionResult = { score: 8, issues: [], strengths: ['Improved'], pass: true }
    const result = await gateRevisionEffectiveness(
      critique,
      'improved draft text here',
      'original draft text here',
      revisionResult
    )
    expect(result.delta).toBe(3)
    expect(result.pass).toBe(true)
  })

  it('flags score decrease after revision', async () => {
    const critique = {
      score: 6,
      issues: [{ type: 'pacing', description: 'Too slow', severity: 'minor' }],
      strengths: [],
      pass: true
    }
    const revisionResult = {
      score: 3,
      issues: [{ type: 'voice', description: 'Flat', severity: 'major' }],
      strengths: [],
      pass: false
    }
    const result = await gateRevisionEffectiveness(
      critique,
      'worse draft',
      'original draft',
      revisionResult
    )
    expect(result.delta).toBe(-3)
    expect(result.pass).toBe(false)
    expect(result.regressions.some((r) => r.includes('decreased'))).toBe(true)
  })

  it('passes with identical draft and no issues', async () => {
    const critique = { score: 8, issues: [], strengths: [], pass: true }
    const result = await gateRevisionEffectiveness(critique, 'same good draft', 'same good draft')
    expect(result.pass).toBe(true)
    expect(result.delta).toBe(0)
  })

  it('flags excessive word count change', async () => {
    const longDraft = Array(200).fill('word').join(' ')
    const shortDraft = Array(10).fill('word').join(' ')

    const critique = {
      score: 7,
      issues: [{ type: 'pacing', description: 'Too long', severity: 'minor' }],
      strengths: [],
      pass: true
    }
    const revisionResult = { score: 7, issues: [], strengths: [], pass: true }
    const result = await gateRevisionEffectiveness(critique, shortDraft, longDraft, revisionResult)
    expect(result.regressions.some((r) => r.includes('Word count') && r.includes('95%'))).toBe(true)
  })
})
