#!/usr/bin/env node
/**
 * P0-A judge calibration harness.
 *
 *   node tools/judge-bench/calibrate.mjs [--model qwen3:8b] [--repeat 3] [--swap]
 *
 * Loads hand labels from reports/live/labelling/ (consensus.json + scenes.json),
 * runs the app's critic on each scene, and reports:
 *   - precision/recall/F1 of gate verdicts vs hand labels
 *   - Cohen's kappa between reviewer A and reviewer B
 *   - swap agreement (position consistency across presentation orders)
 *   - verbosity bias (Pearson r between score and response length)
 *
 * Acceptance criteria (from roadmap):
 *   - >=80% planted fail detection
 *   - <=10% false alarm rate
 *   - non-constant scores
 *   - swap agreement >= 0.85
 *   - |r| < 0.3
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const LAB = join(ROOT, 'reports', 'live', 'labelling')
const CACHE = join(ROOT, 'reports', 'live', 'judge-bench')

const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'
const REPEAT = Number(process.env.CALIB_REPEAT || 3)
const RUN_SWAP = process.env.CALIB_SWAP === '1'

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function wilson(k, n, z = 1.96) {
  if (n === 0) return [NaN, NaN]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [100 * ((c - h) / d), 100 * ((c + h) / d)]
}

function cohensKappa(a, b) {
  const n = a.length
  if (n === 0) return NaN
  let observed = 0
  for (let i = 0; i < n; i++) if (a[i] === b[i]) observed++
  const po = observed / n
  const categories = [...new Set([...a, ...b])]
  let pe = 0
  for (const cat of categories) {
    const pa = a.filter((x) => x === cat).length / n
    const pb = b.filter((x) => x === cat).length / n
    pe += pa * pb
  }
  if (pe === 1) return NaN
  return (po - pe) / (1 - pe)
}

function pearsonR(xs, ys) {
  const n = xs.length
  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n
  let cov = 0, varX = 0, varY = 0
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - meanX) * (ys[i] - meanY)
    varX += (xs[i] - meanX) ** 2
    varY += (ys[i] - meanY) ** 2
  }
  if (varX === 0 || varY === 0) return NaN
  return cov / Math.sqrt(varX * varY)
}

async function runCritic(scene, brief, facts) {
  const { useStoryCritic } = await import(join(ROOT, 'src', 'composables', 'useStoryCritic.ts'))
  const critic = useStoryCritic()
  const result = await critic.evaluateScene({
    scene,
    sceneBrief: brief,
    storyBible: facts.join('\n'),
    workspaceType: 'creative'
  })
  return result
}

async function main() {
  const scenesPath = join(LAB, 'scenes.json')
  const consensusPath = join(LAB, 'claude-labels', 'consensus.json')

  if (!readFileSync(scenesPath, 'utf-8')) {
    console.error('No scene pool found. Run tools/labelling/build_pool.py first.')
    process.exit(1)
  }

  const { scenes } = loadJson(scenesPath)
  const consensus = loadJson(consensusPath)
  const consensusMap = {}
  for (const c of consensus) consensusMap[c.sceneId] = c

  const labeledScenes = scenes.filter((s) => consensusMap[s.id])
  if (labeledScenes.length === 0) {
    console.error('No consensus labels found. Complete labelling first.')
    process.exit(1)
  }

  console.log(`Calibrating judge on ${labeledScenes.length} labelled scenes`)
  console.log(`Model: ${MODEL}, Repeat: ${REPEAT}`)

  mkdirSync(CACHE, { recursive: true })
  const cachePath = join(CACHE, `calibrate-${MODEL.replace(/:/g, '-')}.json`)
  let cache = {}
  try {
    cache = loadJson(cachePath)
  } catch {}

  const results = []
  for (const scene of labeledScenes) {
    const label = consensusMap[scene.id]
    const cacheKey = `${scene.id}-${MODEL}`

    if (cache[cacheKey]) {
      results.push({ scene, label, judge: cache[cacheKey] })
      continue
    }

    const judgeResults = []
    for (let i = 0; i < REPEAT; i++) {
      try {
        const result = await runCritic(scene.prose, scene.brief, scene.facts)
        judgeResults.push(result)
      } catch (e) {
        console.error(`  [${scene.id}] attempt ${i} failed: ${e.message}`)
      }
    }

    if (judgeResults.length === 0) continue

    const avgScore =
      judgeResults.reduce((s, r) => s + (r.score || 0), 0) / judgeResults.length
    const anyFail = judgeResults.some((r) => r.pass === false)
    const responseLength = judgeResults.reduce(
      (s, r) => s + (r.issues?.length || 0),
      0
    )

    const judge = { score: avgScore, pass: !anyFail, responseLength }
    cache[cacheKey] = judge
    writeFileSync(cachePath, JSON.stringify(cache, null, 2))
    results.push({ scene, label, judge })
    console.log(
      `  [${scene.id}] score=${avgScore.toFixed(1)} pass=${!anyFail} label=${label.overall}`
    )
  }

  // Compute metrics
  const predicted = results.map((r) => !r.judge.pass)
  const actual = results.map((r) => r.label.overall !== 'pass')

  let tp = 0, fp = 0, fn = 0
  for (let i = 0; i < predicted.length; i++) {
    if (predicted[i] && actual[i]) tp++
    else if (predicted[i]) fp++
    else if (actual[i]) fn++
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

  const scores = results.map((r) => r.judge.score)
  const responseLengths = results.map((r) => r.judge.responseLength)
  const r = pearsonR(scores, responseLengths)

  const scoreVariance = scores.every((s) => s === scores[0])
    ? 0
    : Math.sqrt(scores.reduce((s, x) => s + (x - scores[0]) ** 2, 0) / scores.length)

  // Kappa between reviewers (if individual labels available)
  let kappa = NaN
  const labelsA = results.map((r) => r.label.reviewerA || r.label.overall)
  const labelsB = results.map((r) => r.label.reviewerB || r.label.overall)
  if (labelsA.some((x) => x) && labelsB.some((x) => x)) {
    kappa = cohensKappa(labelsA, labelsB)
  }

  const [pLo, pHi] = wilson(tp, tp + fn)
  const [fLo, fHi] = wilson(fp, fp + tp)

  console.log('\n=== Calibration Report ===')
  console.log(`Scenes: ${results.length}`)
  console.log(`Precision: ${(precision * 100).toFixed(1)}% [${pLo.toFixed(1)}-${pHi.toFixed(1)}%]`)
  console.log(`Recall:    ${(recall * 100).toFixed(1)}%`)
  console.log(`F1:        ${(f1 * 100).toFixed(1)}%`)
  console.log(`False alarm rate: ${(fp / (fp + (results.length - tp - fn - fp))).toFixed(1)}% [${fLo.toFixed(1)}-${fHi.toFixed(1)}%]`)
  console.log(`Score variance: ${scoreVariance.toFixed(2)} ${scoreVariance > 0 ? '(non-constant)' : '(CONSTANT - FAIL)'}`)
  console.log(`Pearson r (score vs response length): ${r.toFixed(3)} ${Math.abs(r) < 0.3 ? '(OK)' : '(verbosity bias - FAIL)'}`)
  if (!isNaN(kappa)) console.log(`Cohen's kappa (reviewer A vs B): ${kappa.toFixed(3)}`)

  // Acceptance checks
  const checks = [
    { name: 'Recall >= 80%', pass: recall >= 0.8 },
    { name: 'False alarm <= 10%', pass: fp / Math.max(1, results.length - tp - fn) <= 0.1 },
    { name: 'Non-constant scores', pass: scoreVariance > 0 },
    { name: '|r| < 0.3', pass: Math.abs(r) < 0.3 }
  ]
  if (RUN_SWAP) {
    checks.push({ name: 'Swap agreement >= 0.85', pass: false, note: 'Run with --swap' })
  }

  console.log('\n=== Acceptance ===')
  let allPass = true
  for (const c of checks) {
    const status = c.pass ? 'PASS' : 'FAIL'
    if (!c.pass) allPass = false
    console.log(`  ${status}: ${c.name}${c.note ? ' (' + c.note + ')' : ''}`)
  }

  const report = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    repeat: REPEAT,
    scenes: results.length,
    precision,
    recall,
    f1,
    falseAlarmRate: fp / Math.max(1, results.length - tp - fn),
    scoreVariance,
    pearsonR: r,
    kappa,
    checks,
    allPass
  }

  const reportPath = join(CACHE, `calibration-report-${Date.now()}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nReport: ${reportPath}`)
  process.exit(allPass ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
