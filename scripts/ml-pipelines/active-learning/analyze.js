import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { aggregateDimensionScores, generateRecommendations, generateReport } from '../../../src/evaluation/activeLearningAnalyzer.js'

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

  log('Full report saved to reports/ directory')
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

  const report = generateReport(aggregatedList, allRecommendations)
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
