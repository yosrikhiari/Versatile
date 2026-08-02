/**
 * Turning a critique into a pass/fail verdict.
 *
 * The critic used to answer this with `score >= threshold`, where `score` is the
 * number the model reports about its own evaluation. Measured against the
 * snapshot corpus on ollama/qwen3:8b, that number is saturated:
 *
 *   good-pass   (expects pass, 7-10)  →  8/10  pass
 *   borderline  (expects 4-8)         →  8/10  pass
 *   clear-fail  (expects FAIL, 0-4)   →  8/10  pass   ← deliberately broken prose
 *
 * Three fixtures, one score. A deliberately contradictory, tell-heavy scene
 * scored identically to the well-written one, so the gate the whole generation
 * pipeline rests on could not reject anything.
 *
 * The dimension scores, however, do discriminate:
 *
 *   good-pass   continuity 9, voice 9, emotional_goal 10, show_tell 8, pacing 9  (min 8, 1 issue)
 *   borderline  continuity 9, voice 8, emotional_goal  9, show_tell 8, pacing 8  (min 8, 1 issue)
 *   clear-fail  continuity 7, voice 6, emotional_goal  9, show_tell 7, pacing 8  (min 6, 3 issues)
 *
 * The critic perceives quality perfectly well. It just cannot convert that into
 * a verdict. So the verdict is derived here from the signal that carries
 * information — the weakest dimension and the count of major issues — instead of
 * from the model's self-report.
 *
 * A note on the mean: it does NOT separate these fixtures (7.4 / 8.4 / 9.0
 * against a threshold of 7), which is why the minimum carries the decision. A
 * scene is not good because it averages well; a scene with one badly broken
 * dimension is a scene with a badly broken dimension.
 */

export const CRITIC_VERDICT_CONFIG = {
  /**
   * Any single dimension below this fails the scene.
   *
   * This is the load-bearing threshold, and raising or lowering it is the main
   * lever on how strict generation becomes. Be aware of what turning a working
   * gate on reveals: measured per-dimension averages on real generated prose
   * (reports/active-learning-report.json) put creative `voice` at 5.67 and
   * `show_tell` at 6.83, so a meaningful share of real output sits below 7. That
   * is information about the prose, not a regression in the gate — but it does
   * mean more retries per scene than the always-pass verdict produced.
   */
  minDimensionScore: 7,
  /** This many major issues fails the scene regardless of scores. */
  maxMajorIssues: 2,
  /** Mean across dimensions must also clear the workspace threshold. */
  enforceMean: true
} as const

export interface CritiqueLike {
  score?: number | null
  dimensionScores?: Record<string, number | null> | null
  issues?: Array<{ severity?: string; type?: string; description?: string }> | null
}

export interface Verdict {
  pass: boolean
  /** Why, in one phrase, for the activity log and the eval record. */
  reason: string
  weakestDimension: { name: string; score: number } | null
  dimensionMean: number | null
  majorIssueCount: number
  /**
   * True when no usable dimension scores existed and the self-reported score had
   * to be used. Surfaced rather than hidden: a verdict reached this way carries
   * the saturation problem this module exists to route around.
   */
  usedScoreFallback: boolean
}

function numericDimensions(dimensionScores: Record<string, number | null> | null | undefined) {
  if (!dimensionScores) return [] as Array<[string, number]>
  return Object.entries(dimensionScores).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1])
  )
}

/**
 * Derive the verdict. Pure — no I/O, no config reads beyond the constant above,
 * so it is fully testable against the recorded corpus.
 */
export function deriveVerdict(critique: CritiqueLike, threshold: number): Verdict {
  const dims = numericDimensions(critique?.dimensionScores)
  const issues = Array.isArray(critique?.issues) ? critique.issues : []
  const majorIssueCount = issues.filter((i) => i?.severity === 'major').length

  if (dims.length === 0) {
    // No dimensional signal. Fall back to the self-reported score, and say so —
    // this is the weak path, not the normal one.
    const score = typeof critique?.score === 'number' ? critique.score : null
    if (score == null) {
      return {
        pass: false,
        reason: 'no score and no dimension scores — the critique carries no verdict',
        weakestDimension: null,
        dimensionMean: null,
        majorIssueCount,
        usedScoreFallback: true
      }
    }
    return {
      pass: score >= threshold && majorIssueCount < CRITIC_VERDICT_CONFIG.maxMajorIssues,
      reason:
        score >= threshold
          ? 'passed on self-reported score (no dimension scores available)'
          : `self-reported score ${score} below threshold ${threshold}`,
      weakestDimension: null,
      dimensionMean: null,
      majorIssueCount,
      usedScoreFallback: true
    }
  }

  const mean = dims.reduce((sum, [, v]) => sum + v, 0) / dims.length
  const weakest = dims.reduce((lo, cur) => (cur[1] < lo[1] ? cur : lo))
  const weakestDimension = { name: weakest[0], score: weakest[1] }

  if (weakest[1] < CRITIC_VERDICT_CONFIG.minDimensionScore) {
    return {
      pass: false,
      reason: `${weakest[0]} scored ${weakest[1]}, below the minimum ${CRITIC_VERDICT_CONFIG.minDimensionScore}`,
      weakestDimension,
      dimensionMean: mean,
      majorIssueCount,
      usedScoreFallback: false
    }
  }

  if (majorIssueCount >= CRITIC_VERDICT_CONFIG.maxMajorIssues) {
    return {
      pass: false,
      reason: `${majorIssueCount} major issues (max ${CRITIC_VERDICT_CONFIG.maxMajorIssues - 1})`,
      weakestDimension,
      dimensionMean: mean,
      majorIssueCount,
      usedScoreFallback: false
    }
  }

  if (CRITIC_VERDICT_CONFIG.enforceMean && mean < threshold) {
    return {
      pass: false,
      reason: `dimension mean ${mean.toFixed(1)} below threshold ${threshold}`,
      weakestDimension,
      dimensionMean: mean,
      majorIssueCount,
      usedScoreFallback: false
    }
  }

  return {
    pass: true,
    reason: `all dimensions at or above ${CRITIC_VERDICT_CONFIG.minDimensionScore} (weakest: ${weakest[0]} ${weakest[1]})`,
    weakestDimension,
    dimensionMean: mean,
    majorIssueCount,
    usedScoreFallback: false
  }
}
