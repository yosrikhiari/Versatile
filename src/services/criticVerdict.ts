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

/**
 * Dimensions the focused critic still judges and reports, but that do not fail
 * a scene (§31). On 78 real scenes labelled by two independent reviewers and 12
 * public-domain masterpieces:
 *
 *   show_tell       caught 0 of the reviewers' problems; failed 11/12 masterpieces
 *   pacing          scored the reviewers' 22 pacing problems 7-8 (all pass) and
 *                   failed 6/12 masterpieces (Wells 1, Joyce/Doyle/Chekhov 3)
 *   emotional_goal  failed 8 of the pipeline's current 48 scenes, none of which
 *                   the reviewers faulted on it; failed 3/12 masterpieces
 *
 * They reward LLM house style and punish deliberate narrative summary, so a
 * failure on them buys a rewrite that moves the prose the wrong way. Continuity
 * and voice keep the gate: both were validated on planted defects (§17-§23) and
 * neither fails a masterpiece. A dimension leaves this list only when a
 * replacement judge passes the bench (tools/judge-bench): catches the
 * reviewers' problems AND passes the masterpieces.
 */
export const FOCUSED_ADVISORY_DIMENSIONS: readonly string[] = [
  'show_tell',
  'pacing',
  'emotional_goal'
]

export interface CritiqueLike {
  score?: number | null
  dimensionScores?: Record<string, number | null> | null
  issues?: Array<{ severity?: string; type?: string; description?: string }> | null
  /**
   * Scored and reported, never failing: excluded from the floor, the
   * major-issue count and the mean. Set by the focused critic; a critique
   * without it is judged on every dimension, as before.
   */
  advisoryDimensions?: readonly string[] | null
}

export interface Verdict {
  pass: boolean
  /** Why, in one phrase, for the activity log and the eval record. */
  reason: string
  weakestDimension: { name: string; score: number } | null
  /**
   * Every dimension under the floor, lowest first. `weakestDimension` alone
   * picks one, and on a tie it picked whichever came first in the list: over 30
   * scenes with a faithful show-tell defect, show_tell tied for lowest with
   * emotional_goal on 11 verdicts and lost all 11 on list order (§20). A tie is
   * two failures; the verdict should say so.
   */
  failingDimensions: Array<{ name: string; score: number }>
  /** Advisory dimensions under the floor: reported, not failing (§31). */
  advisoryBelowFloor: Array<{ name: string; score: number }>
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
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])
  )
}

/**
 * Derive the verdict. Pure — no I/O, no config reads beyond the constant above,
 * so it is fully testable against the recorded corpus.
 */
export function deriveVerdict(critique: CritiqueLike, threshold: number): Verdict {
  const advisory = new Set(critique?.advisoryDimensions || [])
  const allDims = numericDimensions(critique?.dimensionScores)
  const dims = allDims.filter(([name]) => !advisory.has(name))
  const advisoryBelowFloor = allDims
    .filter(([name, v]) => advisory.has(name) && v < CRITIC_VERDICT_CONFIG.minDimensionScore)
    .map(([name, score]) => ({ name, score }))
  const issues = Array.isArray(critique?.issues) ? critique.issues : []
  const majorIssueCount = issues.filter(
    (i) => i?.severity === 'major' && !advisory.has(String(i?.type || ''))
  ).length

  if (allDims.length > 0 && dims.length === 0) {
    // Every judged dimension is advisory: nothing here can fail the scene.
    return {
      pass: majorIssueCount < CRITIC_VERDICT_CONFIG.maxMajorIssues,
      reason: 'only advisory dimensions were judged',
      weakestDimension: null,
      failingDimensions: [],
      advisoryBelowFloor,
      dimensionMean: null,
      majorIssueCount,
      usedScoreFallback: false
    }
  }

  if (dims.length === 0) {
    // No dimensional signal. Fall back to the self-reported score, and say so —
    // this is the weak path, not the normal one.
    const score = typeof critique?.score === 'number' ? critique.score : null
    if (score == null) {
      return {
        pass: false,
        reason: 'no score and no dimension scores — the critique carries no verdict',
        weakestDimension: null,
        failingDimensions: [],
        advisoryBelowFloor,
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
      failingDimensions: [],
      advisoryBelowFloor,
      dimensionMean: null,
      majorIssueCount,
      usedScoreFallback: true
    }
  }

  const mean = dims.reduce((sum, [, v]) => sum + v, 0) / dims.length
  const weakest = dims.reduce((lo, cur) => (cur[1] < lo[1] ? cur : lo))
  const weakestDimension = { name: weakest[0], score: weakest[1] }
  // Stable sort: equal scores keep their dimension order, but ALL are listed.
  const failingDimensions = dims
    .filter(([, v]) => v < CRITIC_VERDICT_CONFIG.minDimensionScore)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => a.score - b.score)

  if (failingDimensions.length) {
    return {
      pass: false,
      reason: `${failingDimensions.map((d) => `${d.name} scored ${d.score}`).join(', ')}, below the minimum ${CRITIC_VERDICT_CONFIG.minDimensionScore}`,
      weakestDimension,
      failingDimensions,
      advisoryBelowFloor,
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
      failingDimensions,
      advisoryBelowFloor,
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
      failingDimensions,
      advisoryBelowFloor,
      dimensionMean: mean,
      majorIssueCount,
      usedScoreFallback: false
    }
  }

  return {
    pass: true,
    reason:
      `all dimensions at or above ${CRITIC_VERDICT_CONFIG.minDimensionScore} (weakest: ${weakest[0]} ${weakest[1]})` +
      (advisoryBelowFloor.length
        ? `; advisory, not failing: ${advisoryBelowFloor.map((d) => `${d.name} ${d.score}`).join(', ')}`
        : ''),
    weakestDimension,
    failingDimensions,
    advisoryBelowFloor,
    dimensionMean: mean,
    majorIssueCount,
    usedScoreFallback: false
  }
}
