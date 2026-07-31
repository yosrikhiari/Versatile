import { describe, it, expect } from 'vitest'
import { decideRegression } from '../../../tools/libs/regressionDecision.mjs'

const DIMS = ['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing']

function scores(value, overrides = {}) {
  return Object.fromEntries(DIMS.map((d) => [d, overrides[d] ?? value]))
}

function baselineOf(entries) {
  return {
    meta: { workspaceType: 'creative' },
    scenes: entries.map((e) => ({
      sceneId: e.sceneId,
      dimensionScores: e.dimensionScores,
      score: e.score ?? null
    }))
  }
}

describe('eval regression decision', () => {
  it('passes when scores are unchanged', () => {
    const current = [{ sceneId: 'good-pass', score: 8, threshold: 7, dimensionScores: scores(8) }]
    const baseline = baselineOf([{ sceneId: 'good-pass', dimensionScores: scores(8) }])

    const result = decideRegression({ current, baseline })

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.belowThreshold).toHaveLength(0)
  })

  it('passes when scores improve', () => {
    const current = [{ sceneId: 'good-pass', score: 9, threshold: 7, dimensionScores: scores(9) }]
    const baseline = baselineOf([{ sceneId: 'good-pass', dimensionScores: scores(7) }])

    expect(decideRegression({ current, baseline }).ok).toBe(true)
  })

  it('fails when a dimension drops two or more points', () => {
    const current = [
      { sceneId: 'good-pass', score: 8, threshold: 7, dimensionScores: scores(8, { pacing: 5 }) }
    ]
    const baseline = baselineOf([{ sceneId: 'good-pass', dimensionScores: scores(8) }])

    const result = decideRegression({ current, baseline })

    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].dimension).toBe('pacing')
  })

  it('tolerates a one-point dip by default but fails it when asked', () => {
    const current = [
      { sceneId: 'good-pass', score: 8, threshold: 7, dimensionScores: scores(8, { voice: 7 }) }
    ]
    const baseline = baselineOf([{ sceneId: 'good-pass', dimensionScores: scores(8) }])

    expect(decideRegression({ current, baseline }).ok).toBe(true)
    expect(decideRegression({ current, baseline, failOnMinor: true }).ok).toBe(false)
  })

  it('fails when the overall score drops below its threshold', () => {
    // The plan's success criterion for Phase 4. Note no dimension moved by 2+,
    // so a delta-only comparison would call this clean — the threshold check is
    // what catches it.
    const current = [{ sceneId: 'good-pass', score: 6, threshold: 7, dimensionScores: scores(6) }]
    const baseline = baselineOf([{ sceneId: 'good-pass', dimensionScores: scores(7) }])

    const result = decideRegression({ current, baseline })

    expect(result.ok).toBe(false)
    expect(result.belowThreshold).toHaveLength(1)
    expect(result.belowThreshold[0].sceneId).toBe('good-pass')
  })

  it('does not flag a fixture that is meant to score low, as long as it holds steady', () => {
    // clear-fail.json is expected to fail; its threshold is what matters, and
    // the harness should only complain if it gets *worse*.
    const current = [
      { sceneId: 'clear-fail', score: 3, threshold: null, dimensionScores: scores(3) }
    ]
    const baseline = baselineOf([{ sceneId: 'clear-fail', dimensionScores: scores(3) }])

    expect(decideRegression({ current, baseline }).ok).toBe(true)
  })

  it('treats a fixture with no baseline as new rather than regressed', () => {
    const current = [{ sceneId: 'brand-new', score: 8, threshold: 7, dimensionScores: scores(8) }]
    const baseline = baselineOf([])

    const result = decideRegression({ current, baseline })

    expect(result.ok).toBe(true)
    expect(result.report.summary.newScenes).toBe(1)
  })

  it('reports a baseline scene that disappeared from the corpus', () => {
    const current = [{ sceneId: 'good-pass', score: 8, threshold: 7, dimensionScores: scores(8) }]
    const baseline = baselineOf([
      { sceneId: 'good-pass', dimensionScores: scores(8) },
      { sceneId: 'deleted-fixture', dimensionScores: scores(8) }
    ])

    const result = decideRegression({ current, baseline })

    expect(result.report.missingScenes).toContain('deleted-fixture')
  })

  it('aggregates across multiple fixtures and fails if any one regresses', () => {
    const current = [
      { sceneId: 'a', score: 8, threshold: 7, dimensionScores: scores(8) },
      { sceneId: 'b', score: 8, threshold: 7, dimensionScores: scores(8, { continuity: 4 }) }
    ]
    const baseline = baselineOf([
      { sceneId: 'a', dimensionScores: scores(8) },
      { sceneId: 'b', dimensionScores: scores(8) }
    ])

    const result = decideRegression({ current, baseline })

    expect(result.ok).toBe(false)
    expect(result.report.summary.scenesCompared).toBe(2)
  })
})
