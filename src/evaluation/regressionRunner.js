import { computeDegradation } from '../services/degradation.js'

/**
 * Runs a regression check comparing current eval results against a stored baseline.
 *
 * @param {Array}   currentResults — array of { sceneId, dimensionScores, score }
 * @param {Object}  baseline       — { meta, scenes: [{ sceneId, dimensionScores }] }
 * @param {Object}  options
 * @param {number}  options.regressionThreshold — max allowed negative delta before flagging (default 2, unused directly, classification lives in computeDegradation)
 * @param {string}  options.workspaceType       — for report metadata (default 'creative')
 * @returns {Object} report
 */
export function runRegressionCheck(currentResults, baseline, options = {}) {
  const threshold = options.regressionThreshold ?? 2
  const workspaceType = options.workspaceType ?? 'creative'

  const baselineMap = {}
  for (const scene of baseline.scenes) {
    baselineMap[scene.sceneId] = scene
  }

  const sceneResults = []
  const failures = []
  let totalRegressions = 0
  let totalMajorRegressions = 0
  let totalImprovements = 0
  const missingScenes = []

  for (const current of currentResults) {
    const baselineScene = baselineMap[current.sceneId]

    if (!baselineScene) {
      sceneResults.push({
        sceneId: current.sceneId,
        status: 'new',
        baseline: null,
        current: current.dimensionScores,
        degradation: null,
        hasRegressions: false,
        hasMajorRegressions: false,
        summary: { unchanged: [], improved: [], regressed: [], majorRegressions: [] }
      })
      continue
    }

    const degradation = computeDegradation(baselineScene, current)
    const dims = degradation.dimensions
    let sceneRegressions = 0
    let sceneMajorRegressions = 0
    let sceneImprovements = 0

    for (const [dimName, info] of Object.entries(dims)) {
      if (info.status === 'regressed') sceneRegressions++
      if (info.status === 'major_regression') {
        sceneMajorRegressions++
        failures.push({
          sceneId: current.sceneId,
          dimension: dimName,
          baseline: info.before,
          current: info.after,
          delta: info.delta,
          severity: 'high',
          message: `${dimName} dropped from ${info.before} to ${info.after} (delta ${info.delta})`
        })
      }
      if (info.status === 'improved') sceneImprovements++
    }

    totalRegressions += sceneRegressions
    totalMajorRegressions += sceneMajorRegressions
    totalImprovements += sceneImprovements

    const summary = {
      unchanged: Object.entries(dims).filter(([, v]) => v.status === 'unchanged').map(([k]) => k),
      improved: Object.entries(dims).filter(([, v]) => v.status === 'improved').map(([k]) => k),
      regressed: Object.entries(dims).filter(([, v]) => v.status === 'regressed').map(([k]) => k),
      majorRegressions: Object.entries(dims).filter(([, v]) => v.status === 'major_regression').map(([k]) => k)
    }

    let status = 'stable'
    if (sceneMajorRegressions > 0) status = 'regression'
    else if (sceneRegressions > 0) status = 'minor_degradation'

    sceneResults.push({
      sceneId: current.sceneId,
      status,
      baseline: baselineScene.dimensionScores,
      current: current.dimensionScores,
      degradation: dims,
      summary,
      hasRegressions: degradation.hasRegressions,
      hasMajorRegressions: degradation.hasMajorRegressions
    })
  }

  for (const scene of baseline.scenes) {
    if (!currentResults.find(c => c.sceneId === scene.sceneId)) {
      missingScenes.push(scene.sceneId)
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    baseline: {
      generatedAt: baseline.meta?.generatedAt,
      workspaceType: baseline.meta?.workspaceType || workspaceType,
      description: baseline.meta?.description
    },
    config: { regressionThreshold: threshold, workspaceType },
    summary: {
      totalScenes: currentResults.length,
      scenesCompared: sceneResults.filter(s => s.degradation).length,
      newScenes: sceneResults.filter(s => s.status === 'new').length,
      missingBaselineScenes: missingScenes.length,
      dimensionsWithRegression: totalRegressions,
      dimensionsWithMajorRegression: totalMajorRegressions,
      dimensionsWithImprovement: totalImprovements
    },
    sceneResults,
    missingScenes,
    failures
  }
}

/**
 * Asserts the report has no regressions above the configured severity.
 *
 * @param {Object}  report                   — result from runRegressionCheck
 * @param {Object}  options
 * @param {boolean} options.failOnMajor       — report major_regression as violations (default true)
 * @param {boolean} options.failOnRegression  — report regressed as violations (default false)
 * @returns {{ passed: boolean, violations: Array }}
 */
export function assertNoRegressions(report, options = {}) {
  const failOnMajor = options.failOnMajor ?? true
  const failOnRegression = options.failOnRegression ?? false
  const violations = []

  for (const sr of report.sceneResults) {
    if (!sr.degradation) continue
    for (const [dimName, info] of Object.entries(sr.degradation)) {
      if (info.status === 'major_regression' && failOnMajor) {
        violations.push({
          sceneId: sr.sceneId,
          dimension: dimName,
          ...info,
          severity: 'high'
        })
      }
      if (info.status === 'regressed' && failOnRegression) {
        violations.push({
          sceneId: sr.sceneId,
          dimension: dimName,
          ...info,
          severity: 'medium'
        })
      }
    }
  }

  return { passed: violations.length === 0, violations }
}
