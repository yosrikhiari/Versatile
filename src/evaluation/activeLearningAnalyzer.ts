import { EVAL_DIMENSIONS } from '../config/evalDimensions'

export function loadDimensionsForWorkspace(workspaceType: any) {
  const dims = EVAL_DIMENSIONS[workspaceType]
  if (!dims) return null
  const dimNames = Object.keys(dims)
  const dimValues = Object.values(dims)
  const defaultThreshold = dimValues.length > 0 ? dimValues[0].defaultThreshold : 7
  return { workspaceType, dimensionNames: dimNames, defaultThreshold }
}

export function aggregateDimensionScores(evals: any, workspaceType: any) {
  const dimConfig = loadDimensionsForWorkspace(workspaceType)
  if (!dimConfig) return null
  const { dimensionNames, defaultThreshold } = dimConfig

  const dimensionAccum: any = {}
  for (const name of dimensionNames) {
    dimensionAccum[name] = { values: [], workspaceType }
  }

  const matchedEvals = evals.filter((e: any) => {
    const ew = e.workspaceType || (e.projectId && e.projectId.split(':')[0])
    return ew === workspaceType
  })

  for (const e of matchedEvals) {
    const ds = e.dimensionScores || {}
    for (const name of dimensionNames) {
      if (typeof ds[name] === 'number') {
        dimensionAccum[name].values.push(ds[name])
      }
    }
  }

  const dimensionStats: any = {}
  for (const [name, acc] of Object.entries(dimensionAccum)) {
    const acc2: any = acc
    const vals = acc2.values
    if (vals.length === 0) {
      dimensionStats[name] = {
        count: 0,
        avg: null,
        min: null,
        max: null,
        stddev: null,
        belowThreshold: false,
        workspaceType
      }
      continue
    }

    const sum = vals.reduce((a: any, b: any) => a + b, 0)
    const avg = sum / vals.length
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const variance = vals.reduce((s: any, v: any) => s + (v - avg) ** 2, 0) / vals.length
    const stddev = Math.sqrt(variance)

    dimensionStats[name] = {
      count: vals.length,
      avg: parseFloat(avg.toFixed(2)),
      min,
      max,
      stddev: parseFloat(stddev.toFixed(2)),
      belowThreshold: avg < defaultThreshold,
      workspaceType
    }
  }

  return {
    workspaceType,
    evalCount: matchedEvals.length,
    dimensionCount: dimensionNames.length,
    defaultThreshold,
    dimensionStats
  }
}

export function generateRecommendations(aggregated: any, dimensionMap: any) {
  const dimMapEntries = dimensionMap.dimensionMap || {}
  const recommendations = []

  for (const [dimName, stats] of Object.entries(aggregated.dimensionStats)) {
    const stats2: any = stats
    if (stats2.count === 0) {
      recommendations.push({
        dimension: dimName,
        severity: 'insufficient_data',
        avgScore: null,
        threshold: aggregated.defaultThreshold,
        count: 0,
        guidance:
          `No eval data found for dimension "${dimName}" in workspace "${aggregated.workspaceType}". ` +
          `Add test cases that exercise this dimension.`
      })
      continue
    }

    if (!stats2.belowThreshold) continue

    const mapping = dimMapEntries[dimName]
    const gap = (aggregated.defaultThreshold - stats2.avg).toFixed(1)

    recommendations.push({
      dimension: dimName,
      severity: 'below_threshold',
      avgScore: stats2.avg,
      threshold: aggregated.defaultThreshold,
      gap: parseFloat(gap),
      count: stats2.count,
      stddev: stats2.stddev,
      promptKeywords: mapping?.promptKeywords || [],
      guidance:
        mapping?.improvementGuidance ||
        `Improve "${dimName}" scores from avg ${stats2.avg} to >= ${aggregated.defaultThreshold}.`,
      exampleSnippet: mapping?.exampleSnippet || null
    })
  }

  recommendations.sort((a, b) => {
    const severityOrder: { [key: string]: number } = { insufficient_data: 0, below_threshold: 1 }
    const sa = severityOrder[a.severity]
    const sb = severityOrder[b.severity]
    if (sa !== sb) return sa - sb
    if (a.gap && b.gap) return b.gap - a.gap
    return 0
  })

  return recommendations
}

export function buildNarrative(belowThreshold: any, noData: any) {
  const sections = []

  if (belowThreshold.length > 0) {
    const dimList = belowThreshold
      .map((r: any) => `${r.dimension} (avg ${r.avgScore}, gap ${r.gap})`)
      .join(', ')
    sections.push(`Dimensions below threshold: ${dimList}.`)
  }

  if (noData.length > 0) {
    const dimList = noData.map((r: any) => r.dimension).join(', ')
    sections.push(`Insufficient data for: ${dimList}.`)
  }

  return sections.join(' ')
}

export function generateReport(aggregatedList: any, recommendations: any) {
  const allBelow = recommendations.filter((r: any) => r.severity === 'below_threshold')
  const noData = recommendations.filter((r: any) => r.severity === 'insufficient_data')

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      workspacesAnalyzed: aggregatedList.length,
      totalEvals: aggregatedList.reduce((s: any, a: any) => s + a.evalCount, 0),
      dimensionsFlagged: allBelow.length,
      dimensionsWithNoData: noData.length,
      actionableRecommendations: allBelow.length + noData.length
    },
    workspaceResults: aggregatedList,
    recommendations,
    overview:
      allBelow.length > 0 || noData.length > 0
        ? buildNarrative(allBelow, noData)
        : 'All dimensions are above threshold. No prompt changes recommended.'
  }

  return report
}
