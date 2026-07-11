import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { analyzeWorkspace, generateReport, DEFAULTS } from '../../../src/evaluation/driftAnalyzer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')

function die(message) {
  console.error(`[drift] ERROR: ${message}`)
  process.exit(1)
}

function log(...args) {
  console.log('[drift]', ...args)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    source: null,
    recentWindow: DEFAULTS.recentWindow,
    threshold: DEFAULTS.driftThreshold,
    minData: DEFAULTS.minDataPoints,
    format: 'json'
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      flags.source = resolve(process.cwd(), args[++i])
    } else if (args[i] === '--window' && args[i + 1]) {
      flags.recentWindow = parseFloat(args[++i])
    } else if (args[i] === '--threshold' && args[i + 1]) {
      flags.threshold = parseFloat(args[++i])
    } else if (args[i] === '--min-data' && args[i + 1]) {
      flags.minData = parseInt(args[++i], 10)
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

function printReport(report) {
  log(`
╔══════════════════════════════════════════╗
║        Drift Monitor Report              ║
╚══════════════════════════════════════════╝
`)
  log(`Generated: ${report.generatedAt}`)
  log(`Total evals: ${report.summary.totalEvals}`)
  log(`Workspaces analyzed: ${report.summary.workspacesAnalyzed}`)
  log(`Workspaces with drift: ${report.summary.workspacesWithDrift}`)
  log(`Regressions: ${report.summary.dimensionsWithRegression}`)
  log(`Improvements: ${report.summary.dimensionsWithImprovement}`)
  log(`Volatility increases: ${report.summary.dimensionsWithVolatility}`)
  log('')

  if (report.summary.dimensionsWithRegression === 0 && report.summary.dimensionsWithImprovement === 0) {
    log('✅ No significant drift detected across any workspace.')
  }

  for (const r of report.flaggedItems.regressions) {
    const sev = r.severity === 'high' ? '!!' : '!'
    log(`${sev} REGRESSION: ${r.workspaceType}/${r.dimension}`)
    log(`   Delta: ${r.delta}  |  Baseline: ${r.baseline.mean} → Recent: ${r.recent.mean}`)
    log(`   ${r.recommendation}`)
    log('')
  }

  for (const r of report.flaggedItems.improvements) {
    log(`↑ IMPROVEMENT: ${r.workspaceType}/${r.dimension}`)
    log(`   Delta: +${Math.abs(r.delta)}  |  Baseline: ${r.baseline.mean} → Recent: ${r.recent.mean}`)
    log(`   ${r.recommendation}`)
    log('')
  }

  for (const r of report.flaggedItems.volatilityIncreases) {
    log(`~ VOLATILITY: ${r.workspaceType}/${r.dimension}`)
    log(`   Variance ratio: ${r.varianceRatio}x  |  σ ${r.baseline.stddev} → ${r.recent.stddev}`)
    log(`   ${r.recommendation}`)
    log('')
  }

  if (report.summary.dimensionsWithRegression > 0 || report.summary.dimensionsWithVolatility > 0) {
    log('Recommendations:')
    if (report.summary.dimensionsWithRegression > 0) {
      log('  - Review recent prompt or model changes for flagged regressions')
    }
    if (report.summary.dimensionsWithVolatility > 0) {
      log('  - Monitor volatile dimensions — they may precede regressions')
    }
    log('')
  }

  log('Full report saved to reports/')
}

async function main() {
  const flags = parseArgs()
  const evals = loadEvalHistory(flags)

  const options = {
    recentWindow: flags.recentWindow,
    threshold: flags.threshold,
    minData: flags.minData
  }

  log(`Loaded ${evals.length} eval records from ${flags.source}`)

  const workspaceTypes = [
    ...new Set(evals.map((e) => e.workspaceType || 'unknown').filter(Boolean))
  ]
  if (workspaceTypes.length === 0) die('No workspaceType found in eval records')

  log(`Found ${workspaceTypes.length} workspace types: ${workspaceTypes.join(', ')}`)

  const results = workspaceTypes.map((wt) => {
    log(`Analyzing workspace: ${wt}`)
    return analyzeWorkspace(evals, wt, options)
  })

  const report = generateReport(results, options)
  printReport(report)

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  const reportPath = resolve(REPORTS_DIR, 'drift-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  log(`Report written to ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
