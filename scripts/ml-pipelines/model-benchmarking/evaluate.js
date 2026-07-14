import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getAvailableProviders, expandModelVariants, runTest } from './providers.js'
import { judgeOutput } from './judge.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PIPELINE_DIR = resolve(__dirname)
const REPORTS_DIR = resolve(PIPELINE_DIR, '..', '..', '..', 'reports')
const QR_SUITE_PATH = resolve(PIPELINE_DIR, '..', 'quality-regression', 'test-suite.json')
const TASK_SUITE_PATH = resolve(PIPELINE_DIR, 'task-suite.json')

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

function loadTestSuite() {
  const testSuites = [{ path: QR_SUITE_PATH, label: 'quality-regression' }]

  if (existsSync(TASK_SUITE_PATH)) {
    testSuites.push({ path: TASK_SUITE_PATH, label: 'task-suite' })
  }

  const additionalPath = resolve(PIPELINE_DIR, 'test-suite.json')
  if (existsSync(additionalPath)) {
    testSuites.push({ path: additionalPath, label: 'custom' })
  }

  return testSuites.map((s) => {
    const data = JSON.parse(readFileSync(s.path, 'utf-8'))
    return {
      label: s.label,
      version: data.version,
      description: data.description,
      tests: data.tests
    }
  })
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

function scoreOutput(output, expected) {
  const wordCount = output.trim().split(/\s+/).filter(Boolean).length
  const issues = []
  const dimensionScores = {}

  for (const [dim, minScore] of Object.entries(expected.minScores || {})) {
    dimensionScores[dim] = minScore
  }

  if (wordCount < 20) {
    issues.push({
      type: 'length',
      severity: 'major',
      message: `Output too short (${wordCount} words)`
    })
  }

  const values = Object.values(dimensionScores)
  const overallScore =
    values.length > 0
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : null

  return { score: overallScore, issues, dimensionScores, wordCount }
}

function buildComparisonMatrix(resultsByProvider) {
  const providerIds = Object.keys(resultsByProvider)
  const testIds = new Set()
  for (const results of Object.values(resultsByProvider)) {
    for (const r of results) testIds.add(r.testId)
  }

  const rows = []
  for (const testId of [...testIds].sort()) {
    const row = { testId }
    for (const pid of providerIds) {
      const found = (resultsByProvider[pid] || []).find((r) => r.testId === testId)
      row[pid] = found || { status: 'skipped' }
    }
    rows.push(row)
  }
  return rows
}

function computeAggregates(resultsByProvider) {
  const aggregates = {}
  for (const [pid, results] of Object.entries(resultsByProvider)) {
    const completed = results.filter((r) => r.status === 'completed')
    const errors = results.filter((r) => r.status === 'error')

    if (completed.length === 0) {
      aggregates[pid] = { status: 'all_errors', errorCount: errors.length }
      continue
    }

    const latencies = completed.map((r) => r.latencyMs)
    const scores = completed.map((r) => r.score).filter((s) => s !== null)
    const wordCounts = completed.map((r) => r.wordCount)
    const costs = completed.map((r) => r.estimatedCost || 0)

    aggregates[pid] = {
      status: 'ok',
      completedCount: completed.length,
      errorCount: errors.length,
      reliability: +((completed.length / (completed.length + errors.length)) * 100).toFixed(1),
      avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      avgScore:
        scores.length > 0 ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null,
      avgWordCount: Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length),
      estimatedTotalCost: +costs.reduce((a, b) => a + b, 0).toFixed(4)
    }
  }
  return aggregates
}

function computeRankings(aggregates) {
  const pids = Object.keys(aggregates).filter((pid) => aggregates[pid].status === 'ok')
  if (pids.length < 2) return null

  const byLatency = [...pids].sort(
    (a, b) => aggregates[a].avgLatencyMs - aggregates[b].avgLatencyMs
  )
  const byScore = [...pids].sort(
    (a, b) => (aggregates[b].avgScore || 0) - (aggregates[a].avgScore || 0)
  )
  const byReliability = [...pids].sort(
    (a, b) => aggregates[b].reliability - aggregates[a].reliability
  )

  return {
    fastest: byLatency[0],
    bestScore: byScore[0] || null,
    mostReliable: byReliability[0],
    breakdown: Object.fromEntries(
      pids.map((pid) => [
        pid,
        {
          latencyRank: byLatency.indexOf(pid) + 1,
          scoreRank: byScore.indexOf(pid) + 1,
          reliabilityRank: byReliability.indexOf(pid) + 1
        }
      ])
    )
  }
}

function computeTaskTypeAggregates(resultsByProvider, suiteTests) {
  const taskTypeMap = {}
  for (const test of suiteTests) {
    if (test.taskType) {
      if (!taskTypeMap[test.taskType]) taskTypeMap[test.taskType] = new Set()
      taskTypeMap[test.taskType].add(test.id)
    }
  }

  const taskTypes = Object.keys(taskTypeMap)
  if (taskTypes.length === 0) return null

  const breakdown = {}
  for (const tt of taskTypes) {
    const testIds = taskTypeMap[tt]
    breakdown[tt] = {}
    for (const [pid, results] of Object.entries(resultsByProvider)) {
      const byType = results.filter((r) => testIds.has(r.testId))
      const completed = byType.filter((r) => r.status === 'completed')
      const errors = byType.filter((r) => r.status === 'error')

      if (completed.length === 0) {
        breakdown[tt][pid] = {
          status: 'all_errors',
          errorCount: errors.length,
          testCount: byType.length
        }
        continue
      }

      breakdown[tt][pid] = {
        status: 'ok',
        completedCount: completed.length,
        errorCount: errors.length,
        testCount: byType.length,
        reliability: +((completed.length / (completed.length + errors.length)) * 100).toFixed(1),
        avgLatencyMs: Math.round(completed.reduce((a, r) => a + r.latencyMs, 0) / completed.length),
        avgScore: (() => {
          const scores = completed.map((r) => r.score).filter((s) => s !== null)
          return scores.length > 0
            ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
            : null
        })(),
        avgWordCount: Math.round(completed.reduce((a, r) => a + r.wordCount, 0) / completed.length),
        estimatedTotalCost: +completed.reduce((a, r) => a + (r.estimatedCost || 0), 0).toFixed(4)
      }
    }
  }

  const rankings = {}
  for (const tt of taskTypes) {
    const pids = Object.keys(breakdown[tt]).filter((pid) => breakdown[tt][pid].status === 'ok')
    if (pids.length < 2) {
      rankings[tt] = null
      continue
    }
    const byScore = [...pids].sort(
      (a, b) => (breakdown[tt][b].avgScore || 0) - (breakdown[tt][a].avgScore || 0)
    )
    const byLatency = [...pids].sort(
      (a, b) => breakdown[tt][a].avgLatencyMs - breakdown[tt][b].avgLatencyMs
    )
    rankings[tt] = { bestScore: byScore[0] || null, fastest: byLatency[0] }
  }

  return { taskTypes: Object.keys(taskTypeMap), breakdown, rankings }
}

function printResults(providerConfigs, resultsByProvider, aggregates, rankings) {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║            Model Benchmarking Pipeline Results              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  for (const cfg of providerConfigs) {
    const agg = aggregates[cfg.id]
    if (!agg) {
      console.log(`  ${cfg.label.padEnd(16)} — skipped (no API key)`)
      continue
    }
    if (agg.status === 'all_errors') {
      console.log(`  ${cfg.label.padEnd(16)} — ${agg.errorCount} error(s), all failed`)
      continue
    }

    console.log(`  ${cfg.label.padEnd(16)}  model: ${cfg.model}`)
    console.log(`  ${''.padEnd(16)}  completed: ${agg.completedCount} | errors: ${agg.errorCount}`)
    console.log(`  ${''.padEnd(16)}  reliability: ${agg.reliability}%`)
    console.log(
      `  ${''.padEnd(16)}  avg latency: ${agg.avgLatencyMs}ms  (min: ${agg.minLatencyMs}ms / max: ${agg.maxLatencyMs}ms)`
    )
    console.log(
      `  ${''.padEnd(16)}  avg score: ${agg.avgScore !== null ? agg.avgScore + '/10' : 'N/A'}`
    )
    console.log(`  ${''.padEnd(16)}  avg output: ${agg.avgWordCount} words`)
    if (agg.estimatedTotalCost > 0) {
      console.log(`  ${''.padEnd(16)}  estimated cost: $${agg.estimatedTotalCost}`)
    }
    console.log()
  }

  if (rankings) {
    console.log('  Rankings:')
    console.log(`    Fastest:       ${rankings.fastest}`)
    console.log(`    Best score:    ${rankings.bestScore || 'N/A'}`)
    console.log(`    Most reliable: ${rankings.mostReliable}`)
    console.log()
  }
}

async function evaluate() {
  const available = expandModelVariants(getAvailableProviders())
  const suites = loadTestSuite()

  if (available.length === 0) {
    console.log('No providers available. Set at least one API key:')
    console.log('  set OPENAI_API_KEY=sk-...')
    console.log('  set ANTHROPIC_API_KEY=sk-ant-...')
    console.log('  set GEMINI_API_KEY=...')
    console.log('  set GROQ_API_KEY=gsk_...')
    console.log('  (Ollama is always checked at http://localhost:11434)')
    process.exit(0)
  }

  for (const suite of suites) {
    const resultsByProvider = {}

    console.log(`Suite: ${suite.label} v${suite.version} — ${suite.tests.length} test cases`)
    console.log(`Providers: ${available.map((p) => `${p.label} (${p.model})`).join(', ')}`)
    console.log()

    for (const cfg of available) {
      resultsByProvider[cfg.id] = []
      console.log(`  ${cfg.label}…`)

      const TASK_PROMPTS = {
        SPARK: {
          system:
            'You are a creative brainstorming assistant. Generate original ideas, concepts, or angles. Be specific and imaginative.',
          user: (test) =>
            `Brainstorm ideas for the following:\n\nTopic: ${test.name}\n\nContext: ${test.synopsis}\n\n${test.prompt || ''}`
        },
        STORY: {
          system:
            'You are a narrative writing assistant. Continue the story with vivid detail, consistent voice, and logical continuity.',
          user: (test) =>
            `Continue the narrative based on this context:\n\nTitle: ${test.name}\n\nSynopsis: ${test.synopsis}\n\n${test.prompt || ''}`
        },
        POLISH: {
          system:
            'You are a text refinement assistant. Polish and improve the provided text while preserving all meaning and key details.',
          user: (test) =>
            `Polish and improve the following text. Preserve the original meaning but improve clarity, concision, and impact:\n\n${test.prompt || test.synopsis}`
        }
      }

      for (const test of suite.tests) {
        const taskTemplate = test.taskType ? TASK_PROMPTS[test.taskType] : null
        const systemPrompt = taskTemplate
          ? taskTemplate.system
          : `You are an expert writing assistant working in ${test.workspaceType || 'creative'} mode. Respond with the requested output only.`
        const prompt = taskTemplate
          ? taskTemplate.user(test)
          : `Generate a ${test.workspaceType || 'creative'} text for the following context:\n\n${test.name}\n\n${test.synopsis}`

        process.stdout.write(`    ${test.id.padEnd(40)} `)
        const result = await runTest(cfg.id, prompt, systemPrompt, cfg.model)

        if (result.error) {
          // runTest returns latencyMs (not elapsedMs); reading elapsedMs here
          // printed/stored `undefined` for every errored call.
          process.stdout.write(`ERROR ${result.latencyMs}ms\n`)
          resultsByProvider[cfg.id].push({
            testId: test.id,
            taskType: test.taskType || null,
            status: 'error',
            error: result.error,
            latencyMs: result.latencyMs,
            score: null,
            wordCount: 0
          })
        } else {
          const scored = await judgeOutput(result.output, test, prompt)
          const costStr = result.estimatedCost !== null ? ` $${result.estimatedCost}` : ''
          process.stdout.write(
            `${String(result.latencyMs).padStart(7)}ms  ${scored.score}/10  ${result.wordCount}w${costStr}\n`
          )
          resultsByProvider[cfg.id].push({
            testId: test.id,
            taskType: test.taskType || null,
            status: 'completed',
            model: result.model,
            latencyMs: result.latencyMs,
            score: scored.score,
            wordCount: result.wordCount,
            charCount: result.charCount,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCost: result.estimatedCost,
            output: result.output,
            dimensionScores: scored.dimensionScores,
            issues: scored.issues
          })
        }
      }
      console.log()
    }

    const aggregates = computeAggregates(resultsByProvider)
    const rankings = computeRankings(aggregates)
    const matrix = buildComparisonMatrix(resultsByProvider)
    const taskTypeAggs = computeTaskTypeAggregates(resultsByProvider, suite.tests)

    printResults(available, resultsByProvider, aggregates, rankings)

    const report = {
      timestamp: new Date().toISOString(),
      pipeline: 'model-benchmarking',
      suite: suite.label,
      suiteVersion: suite.version,
      testCount: suite.tests.length,
      providers: available.map((c) => ({ id: c.id, label: c.label, model: c.model })),
      aggregates,
      rankings,
      comparisonMatrix: matrix,
      taskTypeBreakdown: taskTypeAggs,
      detailedResults: resultsByProvider
    }

    ensureDir(REPORTS_DIR)
    const reportPath = resolve(
      REPORTS_DIR,
      `model-benchmarking-${suite.label}-v${suite.version}.json`
    )
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    console.log(`Report: ${reportPath}`)
  }
}

evaluate().catch((err) => {
  console.error('Model benchmarking failed:', err)
  process.exit(2)
})
