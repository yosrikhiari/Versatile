import { describe, it, expect } from 'vitest'
import {
  gateDimensionCoverage,
  gateScoreDistribution,
  gateRevisionEffectiveness
} from '../services/evalGates'

function makeCritiqueResult({ score = 7, issues = [] } = {}) {
  return { score, issues, strengths: [] }
}

describe('gateDimensionCoverage', () => {
  it('passes when all creative dimensions have issues', () => {
    const result = makeCritiqueResult({
      issues: [
        { type: 'continuity', severity: 'minor' },
        { type: 'voice', severity: 'minor' },
        { type: 'emotional_goal', severity: 'major' },
        { type: 'show_tell', severity: 'minor' },
        { type: 'pacing', severity: 'major' }
      ]
    })
    const gate = gateDimensionCoverage(result, 'creative')
    expect(gate.pass).toBe(true)
    expect(gate.missing).toEqual([])
  })

  it('reports missing dimensions', () => {
    const result = makeCritiqueResult({
      issues: [
        { type: 'continuity', severity: 'minor' },
        { type: 'voice', severity: 'major' }
      ]
    })
    const gate = gateDimensionCoverage(result, 'creative')
    expect(gate.missing.length).toBe(3)
    expect(gate.missing).toContain('emotional_goal')
    expect(gate.missing).toContain('show_tell')
    expect(gate.missing).toContain('pacing')
  })

  it('generates warnings for missing dimensions', () => {
    const result = makeCritiqueResult({
      issues: [{ type: 'continuity', severity: 'minor' }]
    })
    const gate = gateDimensionCoverage(result, 'creative')
    expect(gate.warnings.length).toBe(4)
    expect(gate.warnings[0]).toContain('Dimension')
    expect(gate.warnings[0]).toContain('no issues')
  })

  it('handles null critique result', () => {
    const gate = gateDimensionCoverage(null, 'creative')
    expect(gate.pass).toBe(true)
    expect(gate.missing.length).toBe(5)
  })

  it('handles undefined issues gracefully', () => {
    const result = makeCritiqueResult()
    const gate = gateDimensionCoverage(result, 'creative')
    expect(gate.missing.length).toBe(5)
  })
})

describe('gateScoreDistribution', () => {
  it('passes on a valid score', () => {
    const result = makeCritiqueResult({
      score: 8,
      issues: [
        { type: 'voice', severity: 'minor' },
        { type: 'pacing', severity: 'minor' }
      ]
    })
    const gate = gateScoreDistribution(result)
    expect(gate.pass).toBe(true)
  })

  it('flags score outside suspectScoreRange', () => {
    const result = makeCritiqueResult({ score: 15 })
    const gate = gateScoreDistribution(result)
    expect(gate.pass).toBe(false)
    expect(gate.flags.length).toBeGreaterThanOrEqual(1)
    expect(gate.flags[0]).toContain('outside expected range')
  })

  it('flags suspect score value', () => {
    const result = makeCritiqueResult({ score: 7 })
    const gate = gateScoreDistribution(result)
    expect(gate.flags.some((f) => f.includes('suspect value'))).toBe(true)
  })

  it('detects high score with major issues mismatch', () => {
    const result = makeCritiqueResult({
      score: 9,
      issues: [
        { type: 'continuity', severity: 'major' },
        { type: 'voice', severity: 'major' },
        { type: 'pacing', severity: 'major' }
      ]
    })
    const gate = gateScoreDistribution(result)
    expect(gate.flags.some((f) => f.includes('possible mismatch'))).toBe(true)
  })

  it('passes high score with few major issues', () => {
    const result = makeCritiqueResult({
      score: 9,
      issues: [{ type: 'voice', severity: 'minor' }]
    })
    const gate = gateScoreDistribution(result)
    expect(gate.pass).toBe(true)
  })

  it('handles null critique result', () => {
    const gate = gateScoreDistribution(null)
    expect(gate.pass).toBe(true)
  })
})

describe('gateRevisionEffectiveness', () => {
  it('passes when score improves', async () => {
    const orig = makeCritiqueResult({ score: 5 })
    const revised = makeCritiqueResult({ score: 8 })
    const gate = await gateRevisionEffectiveness(
      orig,
      'revised draft v2',
      'original draft v1',
      revised
    )
    expect(gate.pass).toBe(true)
    expect(gate.delta).toBe(3)
  })

  it('detects regression when score drops', async () => {
    const orig = makeCritiqueResult({ score: 8 })
    const revised = makeCritiqueResult({ score: 5 })
    const gate = await gateRevisionEffectiveness(orig, 'revised draft', 'original draft', revised)
    expect(gate.pass).toBe(false)
    expect(gate.delta).toBe(-3)
    expect(gate.regressions.length).toBeGreaterThanOrEqual(1)
  })

  it('detects unchanged draft when original had issues', async () => {
    const orig = makeCritiqueResult({ score: 4, issues: [{ type: 'voice', severity: 'major' }] })
    const draft = 'identical text'
    const gate = await gateRevisionEffectiveness(orig, draft, draft)
    expect(gate.pass).toBe(false)
    expect(gate.regressions.some((r) => r.includes('Revision unchanged'))).toBe(true)
  })

  it('passes unchanged draft when original had no issues', async () => {
    const orig = makeCritiqueResult({ score: 9, issues: [] })
    const draft = 'already perfect text'
    const gate = await gateRevisionEffectiveness(orig, draft, draft)
    expect(gate.pass).toBe(true)
    expect(gate.delta).toBe(0)
  })

  it('flags large word count changes', async () => {
    const orig = makeCritiqueResult({ score: 6 })
    const shortDraft = 'a'
    const longDraft = 'a ' + 'word '.repeat(100)
    const gate = await gateRevisionEffectiveness(orig, longDraft, shortDraft)
    expect(gate.regressions.some((r) => r.includes('Word count'))).toBe(true)
  })

  it('handles empty drafts', async () => {
    const orig = makeCritiqueResult({ score: 5 })
    const gate = await gateRevisionEffectiveness(orig, '', '', {
      score: 7,
      issues: [],
      strengths: []
    })
    expect(gate.pass).toBe(true)
  })
})
