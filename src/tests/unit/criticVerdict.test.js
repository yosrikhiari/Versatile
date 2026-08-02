/**
 * The verdict derivation, checked against the real recorded corpus.
 *
 * The fixture dimension scores below are the actual values from
 * corpus/__snapshots__/, recorded on ollama/qwen3:8b — not invented. The whole
 * point of this module is that all three fixtures scored 8/10 and the old
 * `score >= threshold` rule therefore passed a deliberately broken scene.
 */
import { describe, it, expect } from 'vitest'
import { deriveVerdict, CRITIC_VERDICT_CONFIG } from '@/services/criticVerdict'

const THRESHOLD = 7

// Recorded 2026-08-02, ollama/qwen3:8b.
const GOOD_PASS = {
  score: 8,
  dimensionScores: { continuity: 9, voice: 9, emotional_goal: 10, show_tell: 8, pacing: 9 },
  issues: [{ severity: 'minor', type: 'show_tell' }]
}
const BORDERLINE = {
  score: 8,
  dimensionScores: { continuity: 9, voice: 8, emotional_goal: 9, show_tell: 8, pacing: 8 },
  issues: [{ severity: 'minor', type: 'show_tell' }]
}
const CLEAR_FAIL = {
  score: 8,
  dimensionScores: { continuity: 7, voice: 6, emotional_goal: 9, show_tell: 7, pacing: 8 },
  issues: [
    { severity: 'major', type: 'continuity' },
    { severity: 'minor', type: 'voice' },
    { severity: 'minor', type: 'show_tell' }
  ]
}

describe('the corpus, which the old rule could not separate', () => {
  it('all three fixtures report the same self-reported score', () => {
    // This is the defect in one line. Any verdict derived from `score` alone
    // must give these three the same answer.
    expect(GOOD_PASS.score).toBe(CLEAR_FAIL.score)
    expect(BORDERLINE.score).toBe(CLEAR_FAIL.score)
  })

  it('passes good-pass', () => {
    expect(deriveVerdict(GOOD_PASS, THRESHOLD).pass).toBe(true)
  })

  it('passes borderline', () => {
    expect(deriveVerdict(BORDERLINE, THRESHOLD).pass).toBe(true)
  })

  it('FAILS clear-fail — the whole reason this module exists', () => {
    const v = deriveVerdict(CLEAR_FAIL, THRESHOLD)
    expect(v.pass).toBe(false)
    expect(v.weakestDimension).toEqual({ name: 'voice', score: 6 })
    expect(v.reason).toMatch(/voice scored 6/)
  })

  it('would still pass clear-fail on the mean alone', () => {
    // Documents why the MINIMUM carries the decision rather than the mean:
    // 7.4 clears a threshold of 7. A scene is not good because it averages well.
    const mean = deriveVerdict(CLEAR_FAIL, THRESHOLD).dimensionMean
    expect(mean).toBeGreaterThan(THRESHOLD)
  })
})

describe('rules', () => {
  const strong = { continuity: 9, voice: 9, emotional_goal: 9, show_tell: 9, pacing: 9 }

  it('fails on a single weak dimension even when everything else is perfect', () => {
    const v = deriveVerdict(
      {
        score: 10,
        dimensionScores: { ...strong, voice: CRITIC_VERDICT_CONFIG.minDimensionScore - 1 },
        issues: []
      },
      THRESHOLD
    )
    expect(v.pass).toBe(false)
    expect(v.weakestDimension.name).toBe('voice')
  })

  it('fails on too many major issues despite strong dimensions', () => {
    const issues = Array.from({ length: CRITIC_VERDICT_CONFIG.maxMajorIssues }, () => ({
      severity: 'major'
    }))
    const v = deriveVerdict({ score: 10, dimensionScores: strong, issues }, THRESHOLD)
    expect(v.pass).toBe(false)
    expect(v.reason).toMatch(/major issues/)
  })

  it('does not count minor issues toward the major-issue rule', () => {
    const issues = Array.from({ length: 6 }, () => ({ severity: 'minor' }))
    expect(deriveVerdict({ score: 10, dimensionScores: strong, issues }, THRESHOLD).pass).toBe(true)
  })

  it('fails when the mean is below the workspace threshold', () => {
    const atMin = CRITIC_VERDICT_CONFIG.minDimensionScore
    // Every dimension clears the minimum, so only the mean rule can fail this.
    const v = deriveVerdict(
      { score: 8, dimensionScores: { a: atMin, b: atMin, c: atMin }, issues: [] },
      atMin + 1
    )
    expect(v.pass).toBe(false)
    expect(v.reason).toMatch(/mean/)
  })

  it('ignores null dimension entries rather than treating them as zero', () => {
    const v = deriveVerdict(
      { score: 8, dimensionScores: { continuity: 9, voice: null, pacing: 9 }, issues: [] },
      THRESHOLD
    )
    expect(v.pass).toBe(true)
    expect(v.dimensionMean).toBe(9)
  })
})

describe('fallback when no dimensions are available', () => {
  it('uses the self-reported score and flags that it did', () => {
    const v = deriveVerdict({ score: 9, dimensionScores: null, issues: [] }, THRESHOLD)
    expect(v.pass).toBe(true)
    expect(v.usedScoreFallback).toBe(true)
    expect(v.reason).toMatch(/self-reported/)
  })

  it('fails a below-threshold score on the fallback path', () => {
    expect(deriveVerdict({ score: 3, dimensionScores: {}, issues: [] }, THRESHOLD).pass).toBe(false)
  })

  it('fails when there is neither a score nor dimensions', () => {
    const v = deriveVerdict({ score: null, dimensionScores: null, issues: [] }, THRESHOLD)
    expect(v.pass).toBe(false)
    expect(v.reason).toMatch(/no verdict|no score/)
  })

  it('still applies the major-issue rule on the fallback path', () => {
    const issues = Array.from({ length: CRITIC_VERDICT_CONFIG.maxMajorIssues }, () => ({
      severity: 'major'
    }))
    expect(deriveVerdict({ score: 10, dimensionScores: null, issues }, THRESHOLD).pass).toBe(false)
  })
})

describe('robustness', () => {
  it('survives malformed critiques', () => {
    for (const bad of [{}, { issues: null }, { dimensionScores: 'nope' }, { score: NaN }]) {
      expect(() => deriveVerdict(bad, THRESHOLD)).not.toThrow()
    }
  })

  it('treats NaN as absent rather than as a number', () => {
    const v = deriveVerdict({ score: 8, dimensionScores: { a: NaN, b: 9 }, issues: [] }, THRESHOLD)
    expect(v.dimensionMean).toBe(9)
  })
})
