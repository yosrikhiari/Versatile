import { EVAL_DIMENSIONS } from '../config/evalDimensions.js'

const DEFAULTS = {
  recentWindow: 0.3,
  driftThreshold: 1.0,
  varianceRatioThreshold: 2.0,
  minDataPoints: 10,
  minRecentPoints: 2
}

export function getDimensionNames(workspaceType) {
  const dims = EVAL_DIMENSIONS[workspaceType]
  if (!dims) return null
  return Object.keys(dims)
}

export function splitByPeriod(evals, recentFraction) {
  const sorted = [...evals].sort((a, b) => {
    const ta = a.timestamp || ''
    const tb = b.timestamp || ''
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })
  const splitIdx = Math.floor(sorted.length * (1 - recentFraction))
  const clampedIdx = Math.max(1, Math.min(sorted.length - 1, splitIdx))
  return {
    baseline: sorted.slice(0, clampedIdx),
    recent: sorted.slice(clampedIdx)
  }
}

export function computeDrift(evals, dimensionNames, options = {}) {
  const {
    recentWindow = DEFAULTS.recentWindow,
    threshold = DEFAULTS.driftThreshold,
    minData = DEFAULTS.minDataPoints
  } = options

  if (evals.length < minData) {
    return {
      driftDetected: false,
      message: `Insufficient data: ${evals.length} evals (need ${minData})`,
      dimensionDrifts: {}
    }
  }

  const { baseline, recent } = splitByPeriod(evals, recentWindow)

  if (baseline.length < 1 || recent.length < DEFAULTS.minRecentPoints) {
    return {
      driftDetected: false,
      message: `Can't split: ${baseline.length} baseline, ${recent.length} recent`,
      dimensionDrifts: {}
    }
  }

  const dimensionDrifts = {}

  for (const dimName of dimensionNames) {
    const baseVals = baseline
      .map((e) => e.dimensionScores?.[dimName])
      .filter((v) => typeof v === 'number')
    const recentVals = recent
      .map((e) => e.dimensionScores?.[dimName])
      .filter((v) => typeof v === 'number')

    if (baseVals.length < 2 || recentVals.length < 2) {
      dimensionDrifts[dimName] = {
        status: 'insufficient_data',
        baselineCount: baseVals.length,
        recentCount: recentVals.length,
        delta: null,
        recommendation: 'Collect more evals for this dimension'
      }
      continue
    }

    const baseMean = baseVals.reduce((a, b) => a + b, 0) / baseVals.length
    const recentMean = recentVals.reduce((a, b) => a + b, 0) / recentVals.length
    const baseVariance = baseVals.reduce((acc, v) => acc + (v - baseMean) ** 2, 0) / baseVals.length
    const recentVariance = recentVals.reduce((acc, v) => acc + (v - recentMean) ** 2, 0) / recentVals.length
    const baseStddev = Math.sqrt(baseVariance)
    const recentStddev = Math.sqrt(recentVariance)

    const delta = parseFloat((recentMean - baseMean).toFixed(2))
    const absDelta = Math.abs(delta)
    const varianceRatio = baseStddev > 0 ? recentStddev / baseStddev : recentStddev > 0 ? Infinity : 1

    let status = 'stable'
    let severity = null
    let recommendation = null

    if (absDelta >= threshold) {
      status = delta < 0 ? 'regression' : 'improvement'
      severity = absDelta >= threshold * 1.5 ? 'high' : 'medium'
      const direction = delta < 0 ? 'dropped' : 'rose'
      recommendation =
        `${dimName} ${direction} by ${absDelta.toFixed(1)} points ` +
        `(baseline ${baseMean.toFixed(1)} → recent ${recentMean.toFixed(1)}). ` +
        (delta < 0 ? 'Investigate possible cause.' : 'No action needed.')
    }

    if (status === 'stable' && varianceRatio >= DEFAULTS.varianceRatioThreshold) {
      status = 'volatility_increase'
      severity = 'low'
      recommendation =
        `${dimName} mean is stable but variance increased ${varianceRatio.toFixed(1)}x ` +
        `(baseline σ=${baseStddev.toFixed(2)}, recent σ=${recentStddev.toFixed(2)}). ` +
        'Monitor for emerging instability.'
    }

    dimensionDrifts[dimName] = {
      status,
      severity,
      delta,
      baseline: {
        count: baseVals.length,
        mean: parseFloat(baseMean.toFixed(2)),
        variance: parseFloat(baseVariance.toFixed(2)),
        stddev: parseFloat(baseStddev.toFixed(2))
      },
      recent: {
        count: recentVals.length,
        mean: parseFloat(recentMean.toFixed(2)),
        variance: parseFloat(recentVariance.toFixed(2)),
        stddev: parseFloat(recentStddev.toFixed(2))
      },
      varianceRatio: parseFloat(varianceRatio.toFixed(2)),
      recommendation
    }
  }

  const hasDrift = Object.values(dimensionDrifts).some(
    (d) => d.status === 'regression' || d.status === 'improvement'
  )

  return {
    driftDetected: hasDrift,
    message: hasDrift
      ? 'Drift detected in one or more dimensions'
      : 'No significant drift detected',
    config: { recentWindow, threshold, baselineEvals: baseline.length, recentEvals: recent.length },
    dimensionDrifts
  }
}

export function computeOverallTrend(evals) {
  const sorted = [...evals].sort((a, b) => {
    const ta = a.timestamp || ''
    const tb = b.timestamp || ''
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })

  const vals = sorted.map((e) => e.score).filter((v) => typeof v === 'number')
  if (vals.length < 3) return null

  const n = vals.length
  const indices = vals.map((_, i) => i)
  const meanX = (n - 1) / 2
  const meanY = vals.reduce((a, b) => a + b, 0) / n
  const num = indices.reduce((s, xi) => s + (xi - meanX) * (vals[xi] - meanY), 0)
  const den = indices.reduce((s, xi) => s + (xi - meanX) ** 2, 0)
  const slope = den !== 0 ? num / den : 0

  return {
    evalCount: vals.length,
    firstScore: vals[0],
    lastScore: vals[vals.length - 1],
    overallDelta: parseFloat((vals[vals.length - 1] - vals[0]).toFixed(2)),
    slope: parseFloat(slope.toFixed(4)),
    direction: slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'stable'
  }
}

export function analyzeWorkspace(evals, workspaceType, options) {
  const dimensionNames = getDimensionNames(workspaceType)
  if (!dimensionNames) {
    return { workspaceType, error: `No dimension config for workspace type: ${workspaceType}` }
  }

  const matched = evals.filter((e) => {
    const ew = e.workspaceType || (e.projectId && e.projectId.split(':')[0])
    return ew === workspaceType
  })

  const overallTrend = computeOverallTrend(matched)
  const drift = computeDrift(matched, dimensionNames, options)
  const dimCoverage = matched.length > 0
    ? parseFloat(
        (matched.filter((e) => e.dimensionScores && Object.keys(e.dimensionScores).length > 0).length / matched.length).toFixed(2)
      )
    : 0

  return {
    workspaceType,
    evalCount: matched.length,
    dimCoverage,
    overallTrend,
    drift
  }
}

export function generateReport(results, options) {
  const totalEvals = results.reduce((s, r) => s + r.evalCount, 0)
  const workspacesWithDrift = results.filter((r) => r.drift?.driftDetected && !r.error)
  const regressions = []
  const improvements = []
  const volatilities = []

  for (const r of results) {
    if (r.error) continue
    for (const [dim, d] of Object.entries(r.drift?.dimensionDrifts || {})) {
      if (d.status === 'regression') regressions.push({ workspaceType: r.workspaceType, dimension: dim, ...d })
      if (d.status === 'improvement') improvements.push({ workspaceType: r.workspaceType, dimension: dim, ...d })
      if (d.status === 'volatility_increase') volatilities.push({ workspaceType: r.workspaceType, dimension: dim, ...d })
    }
  }

  regressions.sort((a, b) => (a.delta || 0) - (b.delta || 0))
  improvements.sort((a, b) => (b.delta || 0) - (a.delta || 0))

  return {
    generatedAt: new Date().toISOString(),
    pipeline: 'drift-monitor',
    config: {
      recentWindow: options.recentWindow,
      driftThreshold: options.threshold,
      minDataPoints: options.minData
    },
    summary: {
      totalEvals,
      workspacesAnalyzed: results.length,
      workspacesWithDrift: workspacesWithDrift.length,
      dimensionsWithRegression: regressions.length,
      dimensionsWithImprovement: improvements.length,
      dimensionsWithVolatility: volatilities.length
    },
    workspaceResults: results,
    flaggedItems: {
      regressions,
      improvements,
      volatilityIncreases: volatilities
    }
  }
}

export { DEFAULTS }
