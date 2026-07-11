import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { EVAL_DIMENSIONS } from '../../../src/config/evalDimensions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')
const DIMENSION_MAP_PATH = resolve(__dirname, 'dimension-prompt-map.json')

function die(message) {
  console.error(`[active-learning] ERROR: ${message}`)
  process.exit(1)
}

function log(...args) {
  console.log('[active-learning]', ...args)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = { source: null, thresholdOverride: null, format: 'json' }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      flags.source = resolve(process.cwd(), args[++i])
    } else if (args[i] === '--threshold' && args[i + 1]) {
      flags.thresholdOverride = parseFloat(args[++i])
    } else if (args[i] === '--format' && args[i + 1]) {
      flags.format = args[++i]
    }
  }

  if (!flags.source) die('--source <path> is required (path to eval history JSON snapshot)')
  return flags
}

function loadEvalHistory(flags) {
  if (!existsSync(flags.source)) die(`Eval history not found: ${flags.source}`)
  const data = JSON.parse(readFileSync(flags.source, 'utf-8'))
  if (!Array.isArray(data.evals)) {
    die('Eval history JSON must have an "evals" array at the root')
  }
  return data.evals
}

function loadDimensionMap() {
  return JSON.parse(readFileSync(DIMENSION_MAP_PATH, 'utf-8'))
}

function loadDimensionsForWorkspace(workspaceType) {
  const dims = EVAL_DIMENSIONS[workspaceType]
  if (!dims) return null
  const dimNames = Object.keys(dims)
  const dimValues = Object.values(dims)
  const defaultThreshold = dimValues.length > 0 ? dimValues[0].defaultThreshold : 7
  return { workspaceType, dimensionNames: dimNames, defaultThreshold }
}

function aggregateDimensionScores(evals, workspaceType) {
  const { dimensionNames, defaultThreshold } = loadDimensionsForWorkspace(workspaceType)

  const dimensionAccum = {}
  for (const name of dimensionNames) {
    dimensionAccum[name] = { values: [], workspaceType }
  }

  const matchedEvals = evals.filter((e) => {
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

  const dimensionStats = {}
  for (const [name, acc] of Object.entries(dimensionAccum)) {
    const vals = acc.values
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

    const sum = vals.reduce((a, b) => a + b, 0)
    const avg = sum / vals.length
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const variance = vals.reduce((acc2, v) => acc2 + (v - avg) ** 2, 0) / vals.length
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

function generateRecommendations(aggregated, dimensionMap) {
  const dimMapEntries = dimensionMap.dimensionMap || {}
  const recommendations = []

  for (const [dimName, stats] of Object.entries(aggregated.dimensionStats)) {
    if (stats.count === 0) {
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

    if (!stats.belowThreshold) continue

    const mapping = dimMapEntries[dimName]
    const gap = (aggregated.defaultThreshold - stats.avg).toFixed(1)

    recommendations.push({
      dimension: dimName,
      severity: 'below_threshold',
      avgScore: stats.avg,
      threshold: aggregated.defaultThreshold,
      gap: parseFloat(gap),
      count: stats.count,
      stddev: stats.stddev,
      promptKeywords: mapping?.promptKeywords || [],
      guidance:
        mapping?.improvementGuidance ||
        `Improve "${dimName}" scores from avg ${stats.avg} to >= ${aggregated.defaultThreshold}.`,
      exampleSnippet: mapping?.exampleSnippet || null
    })
  }

  recommendations.sort((a, b) => {
    const severityOrder = { insufficient_data: 0, below_threshold: 1 }
    const sa = severityOrder[a.severity]
    const sb = severityOrder[b.severity]
    if (sa !== sb) return sa - sb
    if (a.gap && b.gap) return b.gap - a.gap
    return 0
  })

  return recommendations
}

function generateReport(aggregatedList, dimensionMap, recommendations) {
  const allBelow = recommendations.filter((r) => r.severity === 'below_threshold')
  const noData = recommendations.filter((r) => r.severity === 'insufficient_data')

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      workspacesAnalyzed: aggregatedList.length,
      totalEvals: aggregatedList.reduce((s, a) => s + a.evalCount, 0),
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

function buildNarrative(belowThreshold, noData) {
  const sections = []

  if (belowThreshold.length > 0) {
    const dimList = belowThreshold
      .map((r) => `${r.dimension} (avg ${r.avgScore}, gap ${r.gap})`)
      .join(', ')
    sections.push(`Dimensions below threshold: ${dimList}.`)
  }

  if (noData.length > 0) {
    const dimList = noData.map((r) => r.dimension).join(', ')
    sections.push(`Insufficient data for: ${dimList}.`)
  }

  return sections.join(' ')
}

function printReport(report) {
  log(`
╔══════════════════════════════════════════╗
║    Active Learning Pipeline Report       ║
╚══════════════════════════════════════════╝
`)
  log(`Generated: ${report.generatedAt}`)
  log(`Workspaces analyzed: ${report.summary.workspacesAnalyzed}`)
  log(`Total evals examined: ${report.summary.totalEvals}`)
  log(`Dimensions flagged: ${report.summary.dimensionsFlagged}`)
  if (report.summary.dimensionsWithNoData > 0) {
    log(`Dimensions with no data: ${report.summary.dimensionsWithNoData}`)
  }
  log(`Active recommendations: ${report.summary.actionableRecommendations}`)
  log('')

  if (report.recommendations.length === 0) {
    log('✅ All dimensions above threshold. No changes needed.')
    return
  }

  for (const rec of report.recommendations) {
    const icon = rec.severity === 'below_threshold' ? '⚠️' : '📭'
    log(`${icon}  ${rec.dimension} (${rec.severity})`)
    log(`   Workspace: ${rec.workspaceType || 'unknown'}`)
    if (rec.avgScore !== null) {
      log(`   Avg: ${rec.avgScore}  |  Threshold: ${rec.threshold}  |  Gap: ${rec.gap}`)
    } else {
      log(`   No data — add ${rec.dimension} test cases`)
    }
    log(`   Guidance: ${rec.guidance}`)
    if (rec.exampleSnippet) {
      log(`   Snippet: "${rec.exampleSnippet}"`)
    }
    log('')
  }

  log(`Full report saved to reports/ directory`)
}

async function main() {
  const flags = parseArgs()
  const evals = loadEvalHistory(flags)
  const dimensionMap = loadDimensionMap()

  log(`Loaded ${evals.length} eval records from ${flags.source}`)

  const workspaceTypes = [
    ...new Set(evals.map((e) => e.workspaceType || 'unknown').filter(Boolean))
  ]
  if (workspaceTypes.length === 0) die('No workspaceType found in eval records')

  log(`Found ${workspaceTypes.length} workspace types: ${workspaceTypes.join(', ')}`)

  const aggregatedList = []
  const allRecommendations = []

  for (const wt of workspaceTypes) {
    const result = aggregateDimensionScores(evals, wt)
    aggregatedList.push(result)
    const recs = generateRecommendations(result, dimensionMap)
    for (const r of recs) {
      r.workspaceType = wt
    }
    allRecommendations.push(...recs)
  }

  const report = generateReport(aggregatedList, dimensionMap, allRecommendations)
  printReport(report)

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  const reportPath = resolve(REPORTS_DIR, 'active-learning-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  log(`Report written to ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
