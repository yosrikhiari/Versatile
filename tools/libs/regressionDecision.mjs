import { runRegressionCheck, assertNoRegressions } from '../../src/evaluation/regressionRunner.ts'

/**
 * Decides whether a set of freshly-run critic results constitutes a regression
 * against the stored baseline.
 *
 * Two independent failure conditions — both are required, because they catch
 * different things:
 *
 *  1. **Dimension regression** — a dimension dropped ≥2 points versus baseline.
 *     Catches "this used to be good and got worse", even at a healthy score.
 *  2. **Threshold breach** — the overall score fell below the fixture's own
 *     pass threshold. Catches "this was always mediocre and still is", which a
 *     delta comparison alone reports as `unchanged`.
 *
 * Kept free of I/O so it can be tested without spending an API call.
 */
export function decideRegression({ current, baseline, failOnMinor = false, workspaceType = 'creative' }) {
  const report = runRegressionCheck(current, baseline, { workspaceType })

  const { passed, violations } = assertNoRegressions(report, {
    failOnMajor: true,
    failOnRegression: failOnMinor
  })

  const belowThreshold = current.filter(
    (r) => typeof r.score === 'number' && typeof r.threshold === 'number' && r.score < r.threshold
  )

  return {
    ok: passed && belowThreshold.length === 0,
    report,
    violations,
    belowThreshold
  }
}
