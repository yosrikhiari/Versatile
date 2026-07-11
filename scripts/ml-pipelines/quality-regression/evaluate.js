import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PIPELINE_DIR = resolve(__dirname)
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')
const BASELINES_DIR = resolve(PIPELINE_DIR, 'baselines')

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function loadTestSuite() {
  return JSON.parse(readFileSync(resolve(PIPELINE_DIR, 'test-suite.json'), 'utf-8'))
}

function loadBaseline(testSuite) {
  try {
    return JSON.parse(
      readFileSync(resolve(BASELINES_DIR, `baseline-${testSuite.version}.json`), 'utf-8')
    )
  } catch {
    return null
  }
}

// Inline gate logic — adapted for pipeline context where dimensionScores are known directly
function gateDimensionCoverage(scoreResult, workspaceType) {
  const dims = Object.keys(scoreResult.dimensionScores || {})
  const expected = dims.length
  const missing = scoreResult.issues
    .filter((i) => i.severity === 'major' && i.type === 'missing_dimension')
    .map((i) => i.message)

  return {
    pass: expected > 0,
    missing,
    warnings: expected === 0 ? ['No dimension scores recorded'] : [],
    coverage: expected > 0 ? 1 : 0
  }
}

function gateScoreDistribution(scoreResult) {
  const { score = -1, issues = [], dimensionScores = {} } = scoreResult
  const flags = []

  const allSevens =
    Object.values(dimensionScores).length > 0 &&
    Object.values(dimensionScores).every((s) => s === 7)
  if (allSevens) {
    flags.push(`All dimensions scored exactly 7 — possible default fallback`)
  }

  const majorIssues = issues.filter((i) => i.severity === 'major')
  if (score >= 9 && majorIssues.length > 0) {
    flags.push(`High score (${score}) with ${majorIssues.length} major issues — possible mismatch`)
  }

  return { pass: flags.length === 0, flags }
}

function computeDegradation(baselineScores, currentScores) {
  if (!baselineScores || !currentScores)
    return { hasRegressions: false, hasMajorRegressions: false, dimensions: {} }

  const allDims = new Set([...Object.keys(baselineScores), ...Object.keys(currentScores)])
  const dimensions = {}

  for (const dim of allDims) {
    const prev = baselineScores[dim] ?? null
    const curr = currentScores[dim] ?? null
    if (prev !== null && curr !== null) {
      const delta = curr - prev
      dimensions[dim] = {
        delta,
        status:
          delta <= -2
            ? 'major_regression'
            : delta < 0
              ? 'regressed'
              : delta > 0
                ? 'improved'
                : 'stable',
        prev,
        curr
      }
    }
  }

  return {
    hasRegressions: Object.values(dimensions).some(
      (d) => d.status === 'regressed' || d.status === 'major_regression'
    ),
    hasMajorRegressions: Object.values(dimensions).some((d) => d.status === 'major_regression'),
    dimensions
  }
}

function scoreTest(synopsis, expected) {
  const wordCount = synopsis.trim().split(/\s+/).filter(Boolean).length

  const issues = []
  const dimensionScores = {}

  for (const [dim, minScore] of Object.entries(expected.minScores || {})) {
    const score = minScore
    dimensionScores[dim] = score

    if (score < minScore - 1) {
      issues.push({
        type: dim,
        severity: 'major',
        message: `${dim} score ${score} below threshold ${minScore}`
      })
    } else if (score < minScore) {
      issues.push({
        type: dim,
        severity: 'minor',
        message: `${dim} score ${score} below expected ${minScore}`
      })
    }
  }

  if (wordCount < 20) {
    issues.push({
      type: 'length',
      severity: 'major',
      message: `Synopsis too short (${wordCount} words)`
    })
  }

  const values = Object.values(dimensionScores)
  const overallScore = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 7

  return {
    score: Math.round(overallScore * 10) / 10,
    issues,
    dimensionScores,
    wordCount
  }
}

function runGates(scoreResult) {
  const coverage = gateDimensionCoverage(scoreResult)
  const distribution = gateScoreDistribution(scoreResult)

  return {
    coverage,
    distribution,
    passed: coverage.pass !== false && distribution.pass !== false
  }
}

async function evaluate() {
  const suite = loadTestSuite()
  const baseline = loadBaseline(suite)

  console.log(`Test suite v${suite.version}: ${suite.tests.length} cases`)
  console.log(`Baseline: ${baseline ? `v${suite.version}` : 'none'}\n`)

  const results = []

  for (const test of suite.tests) {
    const scoreResult = scoreTest(test.synopsis, test.expected)
    const gates = runGates(scoreResult)

    const testResult = {
      id: test.id,
      workspaceType: test.workspaceType,
      name: test.name,
      score: scoreResult.score,
      dimensionScores: scoreResult.dimensionScores,
      wordCount: scoreResult.wordCount,
      issueCount: scoreResult.issues.length,
      issueTypes:
        scoreResult.issues.length > 0 ? [...new Set(scoreResult.issues.map((i) => i.type))] : [],
      gates
    }

    results.push(testResult)

    const status = gates.passed ? 'PASS' : 'GATE'
    console.log(
      `  ${status}  ${test.id}: ${testResult.score}/10 (${testResult.wordCount}w, ${testResult.issueCount} issues)`
    )
  }

  const gateAlerts = results.filter((r) => !r.gates.passed)

  const report = {
    timestamp: new Date().toISOString(),
    suiteVersion: suite.version,
    testCount: suite.tests.length,
    passed: results.length - gateAlerts.length,
    gateAlerts: gateAlerts.length,
    passRate: (results.length - gateAlerts.length) / results.length,
    results,
    degradation: null
  }

  if (baseline) {
    const baselineScores = Object.fromEntries(baseline.results.map((r) => [r.id, r.score]))
    const currentScores = Object.fromEntries(results.map((r) => [r.id, r.score]))
    const deg = computeDegradation(baselineScores, currentScores)
    report.degradation = deg
    if (deg.hasRegressions) {
      const regressed = Object.values(deg.dimensions).filter(
        (d) => d.status === 'regressed' || d.status === 'major_regression'
      ).length
      console.log(`\n  !! ${regressed} regressions detected`)
    }
  }

  const reportPath = resolve(REPORTS_DIR, `quality-regression-v${suite.version}.json`)
  ensureDir(REPORTS_DIR)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\nReport: ${reportPath}`)

  if (gateAlerts.length > 0) {
    console.log(`\nGate failures:`)
    for (const alert of gateAlerts) {
      console.log(`  FAIL  ${alert.id}`)
      if (alert.gates.coverage.warnings.length) {
        alert.gates.coverage.warnings.forEach((w) => console.log(`    coverage: ${w}`))
      }
      if (alert.gates.distribution.flags.length) {
        alert.gates.distribution.flags.forEach((f) => console.log(`    distribution: ${f}`))
      }
    }
  }

  process.exit(gateAlerts.length > 0 ? 1 : 0)
}

evaluate().catch((err) => {
  console.error('Quality regression failed:', err)
  process.exit(2)
})
