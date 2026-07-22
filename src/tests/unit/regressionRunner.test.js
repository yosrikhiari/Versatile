import { describe, it, expect } from 'vitest'
import baseline from '../fixtures/eval-baselines/creative-baseline.json'
import { runRegressionCheck, assertNoRegressions } from '../../evaluation/regressionRunner.js'

function cloneScores(scores) {
  return Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v]))
}

describe('runRegressionCheck', () => {
  it('passes when current scores match baseline exactly', () => {
    const current = baseline.scenes.map(s => ({
      sceneId: s.sceneId,
      dimensionScores: cloneScores(s.dimensionScores),
      score: 7
    }))
    const report = runRegressionCheck(current, baseline)
    expect(report.summary.totalScenes).toBe(3)
    expect(report.summary.dimensionsWithRegression).toBe(0)
    expect(report.summary.dimensionsWithMajorRegression).toBe(0)
    expect(report.failures).toHaveLength(0)

    const check = assertNoRegressions(report)
    expect(check.passed).toBe(true)
  })

  it('detects major regressions when scores drop significantly', () => {
    const current = baseline.scenes.map(s => ({
      sceneId: s.sceneId,
      dimensionScores: Object.fromEntries(
        Object.entries(s.dimensionScores).map(([k, v]) => [k, Math.max(1, v - 3)])
      ),
      score: 4
    }))
    const report = runRegressionCheck(current, baseline)
    expect(report.summary.dimensionsWithMajorRegression).toBeGreaterThan(0)
    expect(report.failures.length).toBeGreaterThan(0)
    expect(report.failures[0].severity).toBe('high')

    const check = assertNoRegressions(report)
    expect(check.passed).toBe(false)
    expect(check.violations.length).toBeGreaterThan(0)
  })

  it('passes when scores improve', () => {
    const current = baseline.scenes.map(s => ({
      sceneId: s.sceneId,
      dimensionScores: Object.fromEntries(
        Object.entries(s.dimensionScores).map(([k, v]) => [k, Math.min(10, v + 1)])
      ),
      score: 9
    }))
    const report = runRegressionCheck(current, baseline)
    expect(report.summary.dimensionsWithRegression).toBe(0)
    expect(report.summary.dimensionsWithMajorRegression).toBe(0)
    expect(report.summary.dimensionsWithImprovement).toBeGreaterThan(0)

    const check = assertNoRegressions(report)
    expect(check.passed).toBe(true)
  })

  it('reports new scenes not present in baseline', () => {
    const current = [
      {
        sceneId: 'new-scene-unseen',
        dimensionScores: { continuity: 7, voice: 7, emotional_goal: 7, show_tell: 7, pacing: 7 },
        score: 7
      }
    ]
    const report = runRegressionCheck(current, baseline)
    expect(report.summary.newScenes).toBe(1)
    expect(report.sceneResults[0].status).toBe('new')
    expect(report.summary.scenesCompared).toBe(0)
  })

  it('reports missing scenes from baseline', () => {
    const current = baseline.scenes.slice(0, 1).map(s => ({
      sceneId: s.sceneId,
      dimensionScores: cloneScores(s.dimensionScores),
      score: 8
    }))
    const report = runRegressionCheck(current, baseline)
    expect(report.summary.missingBaselineScenes).toBe(2)
    expect(report.missingScenes).toHaveLength(2)
    expect(report.missingScenes).toContain('scene-confrontation')
    expect(report.missingScenes).toContain('scene-resolution')
  })

  it('respects failOnRegression option for minor regressions', () => {
    const current = baseline.scenes.map(s => ({
      sceneId: s.sceneId,
      dimensionScores: Object.fromEntries(
        Object.entries(s.dimensionScores).map(([k, v]) => [k, Math.max(1, v - 1)])
      ),
      score: 6
    }))
    const report = runRegressionCheck(current, baseline)

    const looseCheck = assertNoRegressions(report, { failOnMajor: true, failOnRegression: false })
    expect(looseCheck.passed).toBe(true)

    const strictCheck = assertNoRegressions(report, { failOnMajor: true, failOnRegression: true })
    expect(strictCheck.passed).toBe(false)
    expect(strictCheck.violations.length).toBeGreaterThan(0)
    expect(strictCheck.violations[0].severity).toBe('medium')
  })

  it('handles empty current results', () => {
    const report = runRegressionCheck([], baseline)
    expect(report.summary.totalScenes).toBe(0)
    expect(report.summary.scenesCompared).toBe(0)
    expect(report.summary.missingBaselineScenes).toBe(3)
    expect(report.missingScenes).toHaveLength(3)
  })

  it('produces report with correct structure', () => {
    const current = baseline.scenes.map(s => ({
      sceneId: s.sceneId,
      dimensionScores: cloneScores(s.dimensionScores),
      score: 7
    }))
    const report = runRegressionCheck(current, baseline)

    expect(report).toHaveProperty('generatedAt')
    expect(report).toHaveProperty('baseline')
    expect(report).toHaveProperty('config')
    expect(report).toHaveProperty('summary')
    expect(report).toHaveProperty('sceneResults')
    expect(report).toHaveProperty('missingScenes')
    expect(report).toHaveProperty('failures')
    expect(report.sceneResults).toHaveLength(3)
    expect(report.sceneResults[0]).toHaveProperty('sceneId')
    expect(report.sceneResults[0]).toHaveProperty('status')
    expect(report.sceneResults[0]).toHaveProperty('degradation')
    expect(report.sceneResults[0]).toHaveProperty('summary')
  })

  it('handles mixed scenarios — some stable, some regressed', () => {
    const current = baseline.scenes.map((s, i) => ({
      sceneId: s.sceneId,
      dimensionScores: i === 1
        ? Object.fromEntries(Object.entries(s.dimensionScores).map(([k, v]) => [k, Math.max(1, v - 3)]))
        : cloneScores(s.dimensionScores),
      score: i === 1 ? 4 : 7
    }))
    const report = runRegressionCheck(current, baseline)

    expect(report.sceneResults[0].status).toBe('stable')
    expect(report.sceneResults[1].status).toBe('regression')
    expect(report.sceneResults[2].status).toBe('stable')

    const check = assertNoRegressions(report)
    expect(check.passed).toBe(false)
  })
})
