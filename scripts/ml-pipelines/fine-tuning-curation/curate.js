import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { EVAL_DIMENSIONS } from '../../../src/config/evalDimensions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')

const DEFAULTS = {
  topK: 20,
  qualityFloor: 5,
  minEvalSamples: 3,
  curationWeights: {
    overallScore: 0.5,
    dimensionCoverage: 0.25,
    reliability: 0.15,
    diversity: 0.1
  }
}

function die(message) {
  console.error(`[curation] ERROR: ${message}`)
  process.exit(1)
}

function log(...args) {
  console.log('[curation]', ...args)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    source: null,
    content: null,
    topK: DEFAULTS.topK,
    floor: DEFAULTS.qualityFloor,
    format: 'json'
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      flags.source = resolve(process.cwd(), args[++i])
    } else if (args[i] === '--content' && args[i + 1]) {
      flags.content = resolve(process.cwd(), args[++i])
    } else if (args[i] === '--top-k' && args[i + 1]) {
      flags.topK = parseInt(args[++i], 10)
    } else if (args[i] === '--floor' && args[i + 1]) {
      flags.floor = parseFloat(args[++i])
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

function loadContentLookup(flags) {
  if (!flags.content) return null
  if (!existsSync(flags.content)) die(`Content file not found: ${flags.content}`)
  return JSON.parse(readFileSync(flags.content, 'utf-8'))
}

function getDimensionNames(workspaceType) {
  const dims = EVAL_DIMENSIONS[workspaceType]
  if (!dims) return null
  return Object.keys(dims)
}

function computeOverallScore(evalRecord) {
  if (typeof evalRecord.score === 'number') return evalRecord.score
  const ds = evalRecord.dimensionScores || {}
  const vals = Object.values(ds).filter((v) => typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function computeDimensionCoverage(evalRecord, dimensionNames) {
  if (!dimensionNames || dimensionNames.length === 0) return 0
  const ds = evalRecord.dimensionScores || {}
  const scored = dimensionNames.filter((n) => typeof ds[n] === 'number').length
  return scored / dimensionNames.length
}

function computeScoreVariance(evalRecord) {
  const ds = evalRecord.dimensionScores || {}
  const vals = Object.values(ds).filter((v) => typeof v === 'number')
  if (vals.length < 2) return 0
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length
}

function computeCandidates(evals, workspaceType, contentLookup, options) {
  const dimensionNames = getDimensionNames(workspaceType)
  const { curationWeights, topK, floor, minEvalSamples } = options

  const matched = evals.filter((e) => {
    const ew = e.workspaceType || (e.projectId && e.projectId.split(':')[0])
    return ew === workspaceType
  })

  log(`  ${matched.length} evals matched workspace "${workspaceType}"`)

  if (matched.length < minEvalSamples) {
    log(`  Skipping: only ${matched.length} evals (need ${minEvalSamples})`)
    return { candidates: [], stats: { total: matched.length, filtered: 0, passed: 0, selected: 0 } }
  }

  const scoredEvals = matched.map((e) => {
    const overall = computeOverallScore(e)
    const coverage = computeDimensionCoverage(e, dimensionNames)
    const variance = computeScoreVariance(e)

    return {
      evalRecord: e,
      overallScore: overall,
      dimensionCoverage: coverage,
      variance,
      hasContent: contentLookup ? !!contentLookup[e.sceneId] : false
    }
  })

  const passed = scoredEvals.filter((s) => s.overallScore !== null && s.overallScore >= floor)
  const filtered = scoredEvals.length - passed.length

  log(`  ${passed.length} passed quality floor (>= ${floor})`)

  const workspaceCount = matched.length
  const reliabilityFactor = Math.min(workspaceCount / 50, 1.0)

  const maxOverall = passed.length > 0 ? Math.max(...passed.map((s) => s.overallScore)) : 1
  const maxCoverage = passed.length > 0 ? Math.max(...passed.map((s) => s.dimensionCoverage)) : 1

  const scored = passed.map((s) => {
    const normalizedScore = maxOverall > 0 ? s.overallScore / maxOverall : 0
    const normalizedCoverage = maxCoverage > 0 ? s.dimensionCoverage / maxCoverage : 0
    const diversityContrib = s.variance < 2.0 ? 0.1 : s.variance > 6.0 ? 0.0 : 0.05

    const curationScore =
      curationWeights.overallScore * normalizedScore +
      curationWeights.dimensionCoverage * normalizedCoverage +
      curationWeights.reliability * reliabilityFactor +
      curationWeights.diversity * diversityContrib

    return {
      sceneId: s.evalRecord.sceneId,
      projectId: s.evalRecord.projectId,
      workspaceType,
      timestamp: s.evalRecord.timestamp,
      overallScore: s.overallScore,
      dimensionCoverage: s.dimensionCoverage,
      variance: parseFloat(s.variance.toFixed(2)),
      curationScore: parseFloat(curationScore.toFixed(4)),
      scoreComponents: {
        overallScoreWeighted: parseFloat(
          (curationWeights.overallScore * normalizedScore).toFixed(4)
        ),
        dimensionCoverageWeighted: parseFloat(
          (curationWeights.dimensionCoverage * normalizedCoverage).toFixed(4)
        ),
        reliabilityWeighted: parseFloat(
          (curationWeights.reliability * reliabilityFactor).toFixed(4)
        ),
        diversityWeighted: parseFloat((curationWeights.diversity * diversityContrib).toFixed(4))
      },
      dimensionScores: s.evalRecord.dimensionScores || {},
      evalType: s.evalRecord.evalType || null,
      hasContent: s.hasContent
    }
  })

  scored.sort((a, b) => b.curationScore - a.curationScore)
  const topCandidates = scored.slice(0, topK)

  return {
    candidates: topCandidates,
    stats: {
      total: matched.length,
      filtered,
      passed: passed.length,
      selected: topCandidates.length,
      reliabilityFactor: parseFloat(reliabilityFactor.toFixed(2)),
      scoreRange:
        passed.length > 0
          ? {
              min: parseFloat(Math.min(...passed.map((s) => s.overallScore)).toFixed(1)),
              max: parseFloat(Math.max(...passed.map((s) => s.overallScore)).toFixed(1))
            }
          : null
    }
  }
}

function buildWorkspaceAnalysis(evals, contentLookup, options) {
  const workspaceTypes = [
    ...new Set(evals.map((e) => e.workspaceType || 'unknown').filter(Boolean))
  ]
  log(`Found ${workspaceTypes.length} workspace types: ${workspaceTypes.join(', ')}`)

  const results = {}
  for (const wt of workspaceTypes) {
    log(`Processing workspace: ${wt}`)
    results[wt] = computeCandidates(evals, wt, contentLookup, options)
  }

  return results
}

function generateReport(workspaceResults, options, contentAvailable) {
  const allCandidates = []
  const workspaceSummaries = {}

  for (const [wt, result] of Object.entries(workspaceResults)) {
    workspaceSummaries[wt] = result.stats
    allCandidates.push(...result.candidates.map((c) => ({ ...c, workspaceType: wt })))
  }

  allCandidates.sort((a, b) => b.curationScore - a.curationScore)
  const globalTop = allCandidates.slice(0, options.topK)

  const totalEvals = Object.values(workspaceResults).reduce((s, r) => s + r.stats.total, 0)
  const totalPassed = Object.values(workspaceResults).reduce((s, r) => s + r.stats.passed, 0)
  const totalSelected = Object.values(workspaceResults).reduce((s, r) => s + r.stats.selected, 0)

  return {
    generatedAt: new Date().toISOString(),
    pipeline: 'fine-tuning-curation',
    config: {
      topK: options.topK,
      qualityFloor: options.floor,
      minEvalSamples: options.minEvalSamples,
      curationWeights: options.curationWeights,
      contentAvailable
    },
    summary: {
      totalEvals,
      totalPassed,
      totalFiltered: totalEvals - totalPassed,
      totalSelected,
      workspacesWithData: Object.entries(workspaceSummaries).filter(
        ([, s]) => s.passed >= options.minEvalSamples
      ).length,
      bestCuratedCandidates: globalTop.slice(0, 5).map((c) => ({
        sceneId: c.sceneId,
        workspaceType: c.workspaceType,
        curationScore: c.curationScore,
        overallScore: c.overallScore,
        dimensionCoverage: c.dimensionCoverage
      }))
    },
    workspaceResults,
    globalTopCandidates: globalTop,
    recommendations: buildRecommendations(workspaceResults, workspaceSummaries, options)
  }
}

function buildRecommendations(workspaceResults, workspaceSummaries, options) {
  const recs = []

  for (const [wt, summary] of Object.entries(workspaceSummaries)) {
    if (summary.total < options.minEvalSamples) {
      recs.push({
        workspaceType: wt,
        type: 'insufficient_data',
        severity: 'low',
        message: `Only ${summary.total} eval(s) for "${wt}". Collect more evals before curating fine-tuning data.`
      })
      continue
    }

    const result = workspaceResults[wt]
    if (result.candidates.length > 0) {
      recs.push({
        workspaceType: wt,
        type: 'curation_ready',
        severity: 'info',
        message: `${result.candidates.length} candidate(s) selected from ${summary.passed} qualifying evals. Curation score range: ${result.candidates[result.candidates.length - 1].curationScore.toFixed(3)} – ${result.candidates[0].curationScore.toFixed(3)}.`
      })
    }

    const highVariance = result.candidates.filter((c) => c.variance > 5.0)
    if (highVariance.length >= 3) {
      recs.push({
        workspaceType: wt,
        type: 'high_variance',
        severity: 'medium',
        message: `${highVariance.length} candidates have high dimension-score variance (>5.0), suggesting inconsistent quality. Review manually before including in fine-tuning set.`
      })
    }
  }

  return recs
}

function printReport(report) {
  log(`
╔══════════════════════════════════════════╗
║   Fine-tuning Curation Report           ║
╚══════════════════════════════════════════╝
`)
  log(`Generated: ${report.generatedAt}`)
  log(`Total evals scanned: ${report.summary.totalEvals}`)
  log(`Passed quality floor: ${report.summary.totalPassed}`)
  log(`Filtered out: ${report.summary.totalFiltered}`)
  log(`Total candidates selected: ${report.summary.totalSelected}`)
  log(`Workspaces with curated data: ${report.summary.workspacesWithData}`)
  log('')

  if (report.globalTopCandidates.length === 0) {
    log('No candidates passed the quality floor. Try lowering --floor.')
    return
  }

  log('Top global candidates:')
  log('')
  for (let i = 0; i < Math.min(10, report.globalTopCandidates.length); i++) {
    const c = report.globalTopCandidates[i]
    log(`  #${i + 1}  [${c.workspaceType}]  scene:${String(c.sceneId).slice(0, 8)}…`)
    log(
      `      Curation: ${c.curationScore.toFixed(4)}  |  Overall: ${c.overallScore}/10  |  Coverage: ${(c.dimensionCoverage * 100).toFixed(0)}%`
    )
    log(
      `      Composed: ${c.scoreComponents.overallScoreWeighted} + ${c.scoreComponents.dimensionCoverageWeighted} + ${c.scoreComponents.reliabilityWeighted} + ${c.scoreComponents.diversityWeighted}`
    )
    log('')
  }

  if (report.config.contentAvailable) {
    const withContent = report.globalTopCandidates.filter((c) => c.hasContent).length
    log(`Content available for ${withContent}/${report.globalTopCandidates.length} top candidates`)
  } else {
    log('No content lookup provided. Use --content <file> to attach generation text.')
  }

  log('')
  if (report.recommendations.length > 0) {
    log('Recommendations:')
    for (const r of report.recommendations) {
      log(`  [${r.severity}] ${r.message}`)
    }
  }

  log('')
  log(`Full report saved to reports/`)
}

async function main() {
  const flags = parseArgs()
  const evals = loadEvalHistory(flags)
  const contentLookup = loadContentLookup(flags)

  const options = {
    topK: flags.topK,
    floor: flags.floor,
    minEvalSamples: DEFAULTS.minEvalSamples,
    curationWeights: DEFAULTS.curationWeights
  }

  log(`Loaded ${evals.length} eval records from ${flags.source}`)
  if (contentLookup) log(`Content lookup loaded: ${Object.keys(contentLookup).length} entries`)

  const workspaceResults = buildWorkspaceAnalysis(evals, contentLookup, options)
  const report = generateReport(workspaceResults, options, !!contentLookup)

  printReport(report)

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  const reportPath = resolve(REPORTS_DIR, 'curation-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  log(`Report written to ${reportPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
