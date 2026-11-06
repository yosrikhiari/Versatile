#!/usr/bin/env node
/**
 * P0-A judge calibration harness.
 *
 *   node tools/judge-bench/calibrate.mjs                         # safe dry run
 *   node tools/judge-bench/calibrate.mjs --run --approved \
 *     --adjudicator-a "Name A" --adjudicator-b "Name B"
 *
 * Loads hand labels from reports/live/labelling/ (consensus.json + scenes.json),
 * runs the app's critic on each scene, and reports:
 *   - precision/recall/F1 of gate verdicts vs hand labels
 * The run is deliberately opt-in and requires two named human adjudicators.
 * The consensus input must retain separate passA/passB labels; merged labels
 * are not sufficient for the preregistered comparison. This harness reports
 * descriptive results only: the preregistered 80% figure is a hypothesis, not
 * an acceptance gate. It does not measure raw response verbosity because the
 * critic API returns parsed JSON, not the provider's original response text.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const LAB = join(ROOT, 'reports', 'live', 'labelling')
const CACHE = join(ROOT, 'reports', 'live', 'judge-bench')

const ARGS = process.argv.slice(2)
const MODEL = optionValue('--model') || process.env.LIVE_MODEL || 'qwen3:8b'
const REPEAT = Number(optionValue('--repeat') || process.env.CALIB_REPEAT || 3)

function optionValue(name) {
  const prefix = `${name}=`
  const inline = ARGS.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = ARGS.indexOf(name)
  return index >= 0 ? ARGS[index + 1] : null
}

function adjudicators() {
  return [optionValue('--adjudicator-a'), optionValue('--adjudicator-b')]
    .map((name) => name?.trim())
    .filter(Boolean)
}

function assertRunApproval() {
  if (!ARGS.includes('--run')) return false
  const names = adjudicators()
  if (
    !ARGS.includes('--approved') ||
    names.length !== 2 ||
    names[0].toLowerCase() === names[1].toLowerCase()
  ) {
    throw new Error(
      'Calibration is gated: pass --approved and two distinct named human adjudicators via --adjudicator-a/--adjudicator-b only after the preregistered blinded review is complete.'
    )
  }
  return true
}

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

async function runCritic(scene, brief, facts) {
  const { useStoryCritic } = await import(join(ROOT, 'src', 'composables', 'useStoryCritic.ts'))
  const critic = useStoryCritic()
  const result = await critic.evaluateScene({
    draft: scene,
    sceneBrief: brief,
    storyBible: facts.join('\n'),
    workspaceType: 'creative'
  })
  return result
}

const LOAD_BEARING_SCORE_FLOOR = 7

function judgeClass(result) {
  if (!result || result.evalUnavailable || typeof result.pass !== 'boolean') return null
  if (result.pass) return 'pass'

  const scores = result.dimensionScores || {}
  const failedLoadBearingScore = ['continuity', 'voice'].some(
    (dimension) =>
      Number.isFinite(scores[dimension]) && scores[dimension] < LOAD_BEARING_SCORE_FLOOR
  )
  const majorLoadBearingIssue = (result.majorIssueTypes || []).some((type) =>
    ['continuity', 'voice'].includes(type)
  )
  return failedLoadBearingScore || majorLoadBearingIssue ? 'rewrite' : 'revise'
}

async function main() {
  if (ARGS.includes('--help')) {
    console.log(
      'Safe dry run by default. To execute a preregistered run, pass --run --approved --adjudicator-a NAME --adjudicator-b NAME.'
    )
    return
  }
  if (!assertRunApproval()) {
    console.log('Calibration dry run only: no labels loaded and no model calls made.')
    console.log('A live run requires explicit approval and two distinct named human adjudicators.')
    return
  }

  const scenesPath = join(LAB, 'scenes.json')
  const consensusPath = join(LAB, 'claude-labels', 'consensus.json')

  // Empty-data fast path: must precede any src TypeScript import so the
  // plain-node dry run exits here without loading judge code. Check the
  // consensus file first so absent data exits via the "complete labelling
  // first" path.
  if (!existsSync(consensusPath)) {
    console.error('No consensus labels found. Complete labelling first.')
    process.exit(1)
  }
  if (!existsSync(scenesPath)) {
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

  const missingPasses = labeledScenes.filter((scene) => {
    const entry = consensusMap[scene.id]
    return !entry?.passA || !entry?.passB
  })
  if (missingPasses.length > 0) {
    throw new Error(
      `Calibration blocked: ${missingPasses.length} labeled scenes lack separate passA/passB annotations. ` +
        'Do not analyze merged consensus as independent reviewer evidence.'
    )
  }

  // P0-A wiring (I/O shell only): dynamic import AFTER the data-presence
  // check — vite-node resolves TS for the validation run, while the
  // plain-node empty-data dry run never reaches here.
  const {
    fromConsensusEntry,
    deriveLabel,
    detectMappingReview,
    splitHeldOut,
    sampleUnflagged,
    buildCalibrationReport
  } = await import(join(ROOT, 'src', 'evaluation', 'labelDerivation.ts'))

  // Pre-run summary over hand labels only (no judge calls).
  const normalizePass = (sceneId, pass) => fromConsensusEntry({ ...pass, sceneId })
  const calibrationInputs = labeledScenes.map((scene) => {
    const raw = consensusMap[scene.id]
    const passA = normalizePass(scene.id, raw.passA)
    const passB = normalizePass(scene.id, raw.passB)
    const adjudicated = raw.adjudicated ? normalizePass(scene.id, raw.adjudicated) : null
    return {
      sceneId: scene.id,
      overall: passA.overall,
      dims: passA.dims,
      note: passA.note,
      humanOnly: Boolean(raw.humanOnly),
      passA: { overall: passA.overall, dims: passA.dims, note: passA.note },
      passB: { overall: passB.overall, dims: passB.dims, note: passB.note },
      ...(adjudicated
        ? {
            adjudicated: {
              overall: adjudicated.overall,
              dims: adjudicated.dims,
              note: adjudicated.note
            }
          }
        : {})
    }
  })

  const derivedList = calibrationInputs.map((e) => ({
    sceneId: e.sceneId,
    overall: e.overall,
    note: e.note,
    result: deriveLabel({ overall: e.passA.overall, dims: e.passA.dims, note: e.passA.note })
  }))

  const derivedCounts = { pass: 0, revise: 0, rewrite: 0 }
  const triggerCounts = { 'continuity-only': 0, 'voice-only': 0, both: 0 }
  const keepWithProblemIds = []
  for (const d of derivedList) {
    derivedCounts[d.result.label]++
    if (d.result.label === 'rewrite' && d.result.trigger) triggerCounts[d.result.trigger]++
    if (d.result.keepWithProblem) keepWithProblemIds.push(d.sceneId)
  }

  const reviseSceneIds = calibrationInputs
    .filter((e) => e.passA.overall === 'Revise')
    .map((e) => e.sceneId)
  const heldOut = splitHeldOut(reviseSceneIds.map((sceneId) => ({ sceneId })))
  const setAIds = new Set(heldOut.setA)
  const mappingHitIds = []
  for (const d of derivedList) {
    if (d.overall !== 'Revise' || !setAIds.has(d.sceneId)) continue
    if (detectMappingReview(d.result.label, d.note)) mappingHitIds.push(d.sceneId)
  }

  const hitSet = new Set(mappingHitIds)
  const hitFreeIds = heldOut.setA.filter((id) => !hitSet.has(id))
  const unflaggedSample = sampleUnflagged(hitFreeIds)

  console.log('\n=== Pre-run summary (hand labels only, no judge calls) ===')
  console.log(
    `Derived distribution: pass=${derivedCounts.pass} revise=${derivedCounts.revise} rewrite=${derivedCounts.rewrite}`
  )
  console.log(
    `Trigger split: continuity-only=${triggerCounts['continuity-only']} voice-only=${triggerCounts['voice-only']} both=${triggerCounts.both}`
  )
  console.log(
    `Keep-with-Problem: count=${keepWithProblemIds.length}${keepWithProblemIds.length ? ' ids=' + keepWithProblemIds.join(',') : ''}`
  )
  console.log(
    `Mapping-review SET-A candidates: count=${mappingHitIds.length}${mappingHitIds.length ? ' ids=' + mappingHitIds.join(',') : ''}`
  )
  console.log(
    `SET-A/SET-B (Revise split): SET-A=${heldOut.setA.length} SET-B=${heldOut.setB.length}`
  )
  console.log(`Unflagged SET-A sample: size=${unflaggedSample.length}`)

  console.log(`Calibrating judge on ${labeledScenes.length} labelled scenes`)
  console.log(`Model: ${MODEL}, Repeat: ${REPEAT}`)

  mkdirSync(CACHE, { recursive: true })
  const cachePath = join(CACHE, `calibrate-p0a-v2-${MODEL.replace(/:/g, '-')}.json`)
  let cache = {}
  try {
    cache = loadJson(cachePath)
  } catch {}

  const results = []
  let excludedJudgeResults = 0
  for (const scene of labeledScenes) {
    const label = calibrationInputs.find((entry) => entry.sceneId === scene.id)
    const cacheKey = `p0a-v2-${scene.id}-${MODEL}`

    if (cache[cacheKey]) {
      results.push({ scene, label, judge: cache[cacheKey] })
      continue
    }

    const judgeResults = []
    for (let i = 0; i < REPEAT; i++) {
      try {
        const result = await runCritic(scene.prose, scene.brief, scene.facts)
        if (
          result &&
          !result.evalUnavailable &&
          typeof result.pass === 'boolean' &&
          Number.isFinite(result.score) &&
          Object.values(result.dimensionScores || {}).some(Number.isFinite)
        ) {
          judgeResults.push(result)
        } else {
          console.warn(`  [${scene.id}] attempt ${i} excluded: critic returned no usable verdict`)
        }
      } catch (e) {
        console.error(`  [${scene.id}] attempt ${i} failed: ${e.message}`)
      }
    }

    if (judgeResults.length === 0) {
      excludedJudgeResults++
      continue
    }

    const focusedModes = new Set(
      judgeResults.map((result) => Array.isArray(result.advisoryDimensions))
    )
    if (focusedModes.size !== 1) {
      excludedJudgeResults++
      console.warn(`  [${scene.id}] excluded: focused/combined critic mode changed between repeats`)
      continue
    }

    const avgScore = judgeResults.reduce((s, r) => s + r.score, 0) / judgeResults.length
    const anyFail = judgeResults.some((r) => r.pass === false)
    const dimensions = [
      ...new Set(judgeResults.flatMap((r) => Object.keys(r.dimensionScores || {})))
    ]
    const dimensionScores = Object.fromEntries(
      dimensions.map((dimension) => {
        const values = judgeResults
          .map((r) => r.dimensionScores?.[dimension])
          .filter((value) => Number.isFinite(value))
        return [
          dimension,
          values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
        ]
      })
    )
    const majorIssueTypes = [
      ...new Set(
        judgeResults.flatMap((r) =>
          (r.issues || []).filter((issue) => issue?.severity === 'major').map((issue) => issue.type)
        )
      )
    ]
    const focused = focusedModes.has(true)

    const judge = {
      score: avgScore,
      pass: !anyFail,
      dimensionScores,
      majorIssueTypes,
      focused
    }
    cache[cacheKey] = judge
    writeFileSync(cachePath, JSON.stringify(cache, null, 2))
    results.push({ scene, label, judge })
    console.log(
      `  [${scene.id}] score=${avgScore.toFixed(1)} pass=${!anyFail} label=${label.passA.overall}`
    )
  }

  if (results.length === 0 || excludedJudgeResults > 0) {
    throw new Error(
      `Calibration incomplete: ${results.length} usable scene(s), ${excludedJudgeResults} excluded/unavailable; no report was written.`
    )
  }

  // Compare the production gate boundary to the first independent reviewer
  // pass. Keep adjudication-label derivation separate: a binary gate cannot be
  // described as a three-class label without the explicit mapping below.
  const predicted = results.map((r) => !r.judge.pass)
  const actual = results.map((r) => r.label.passA.overall === 'Revise')

  let tp = 0,
    fp = 0,
    fn = 0
  for (let i = 0; i < predicted.length; i++) {
    if (predicted[i] && actual[i]) tp++
    else if (predicted[i]) fp++
    else if (actual[i]) fn++
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  const tn = results.length - tp - fp - fn
  const falseAlarmRate = fp + tn === 0 ? NaN : fp / (fp + tn)
  const scores = results.map((r) => r.judge.score)
  const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const scoreStdDev = Math.sqrt(
    scores.reduce((sum, score) => sum + (score - meanScore) ** 2, 0) / scores.length
  )

  // Agreement is computed only from the two independent passes, never by
  // falling back to the same consensus label on both sides.
  let kappa = NaN
  const labelsA = results.map((r) => deriveLabel(r.label.passA).label)
  const labelsB = results.map((r) => deriveLabel(r.label.passB).label)
  if (labelsA.length > 0 && labelsB.length > 0) {
    kappa = cohensKappa(labelsA, labelsB)
  }

  const [precisionLo, precisionHi] = wilson(tp, tp + fp)
  const [recallLo, recallHi] = wilson(tp, tp + fn)
  const [falseAlarmLo, falseAlarmHi] = wilson(fp, fp + tn)

  console.log('\n=== Calibration Report ===')
  console.log(`Usable scenes: ${results.length}; excluded/unavailable: ${excludedJudgeResults}`)
  console.log(
    `Precision: ${(precision * 100).toFixed(1)}% [${precisionLo.toFixed(1)}-${precisionHi.toFixed(1)}%]`
  )
  console.log(
    `Recall:    ${(recall * 100).toFixed(1)}% [${recallLo.toFixed(1)}-${recallHi.toFixed(1)}%]`
  )
  console.log(`F1:        ${(f1 * 100).toFixed(1)}%`)
  console.log(
    `False alarm rate: ${(falseAlarmRate * 100).toFixed(1)}% [${falseAlarmLo.toFixed(1)}-${falseAlarmHi.toFixed(1)}%]`
  )
  console.log(`Score standard deviation: ${scoreStdDev.toFixed(2)} (descriptive only)`)
  if (!isNaN(kappa)) console.log(`Cohen's kappa (reviewer A vs B): ${kappa.toFixed(3)}`)

  const report = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    repeat: REPEAT,
    adjudicators: adjudicators(),
    gateToClassMapping: 'pass; rewrite if continuity/voice fails; otherwise revise',
    scenes: results.length,
    excludedJudgeResults,
    precision,
    precisionCI95: [precisionLo, precisionHi],
    recall,
    recallCI95: [recallLo, recallHi],
    f1,
    falseAlarmRate,
    falseAlarmCI95: [falseAlarmLo, falseAlarmHi],
    scoreStdDev,
    kappa
  }

  const reportPath = join(CACHE, `calibration-report-${Date.now()}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nReport: ${reportPath}`)

  // Preserve pass A/B and adjudicated records for the preregistered dual arms.
  const calibrationScenes = []
  const judgeRecord = {}
  for (const res of results) {
    const sceneId = res.scene.id
    const norm = calibrationInputs.find((entry) => entry.sceneId === sceneId)
    if (!norm) continue
    calibrationScenes.push({
      sceneId,
      humanOnly: norm.humanOnly,
      passA: norm.passA,
      passB: norm.passB,
      ...(norm.adjudicated ? { adjudicated: norm.adjudicated } : {})
    })
    judgeRecord[sceneId] = {
      authoritativeLabel: judgeClass(res.judge),
      focusedScore: res.judge.focused ? res.judge.score : null,
      combinedScore: res.judge.focused ? null : res.judge.score
    }
  }
  const calibrationReport = buildCalibrationReport(calibrationScenes, judgeRecord)

  console.log('\n=== Calibration report (report builder) ===')
  console.log(
    `Dual reviewer: n=${calibrationReport.dual.reviewer.n} weightedKappa=${Number(calibrationReport.dual.reviewer.weightedKappa).toFixed(3)} agreement95=[${calibrationReport.dual.reviewer.agreement95.map((v) => Number(v).toFixed(3)).join(',')}]`
  )
  console.log(
    `Dual humanOnly: n=${calibrationReport.dual.humanOnly.n} weightedKappa=${Number(calibrationReport.dual.humanOnly.weightedKappa).toFixed(3)} descriptiveOnly=${calibrationReport.dual.humanOnly.descriptiveOnly}`
  )
  console.log(
    `Shadow focused: n=${calibrationReport.shadow.focused.n} matches=${calibrationReport.shadow.focused.matches} agreement=${Number(calibrationReport.shadow.focused.agreement).toFixed(3)} excluded=${calibrationReport.shadow.focused.excluded}`
  )
  console.log(
    `Shadow combined: n=${calibrationReport.shadow.combined.n} matches=${calibrationReport.shadow.combined.matches} agreement=${Number(calibrationReport.shadow.combined.agreement).toFixed(3)} excluded=${calibrationReport.shadow.combined.excluded}`
  )
  for (const trigger of ['continuity-only', 'voice-only', 'both']) {
    const row = calibrationReport.rewriteByTrigger[trigger]
    console.log(
      `Rewrite-by-trigger ${trigger}: rate=${Number(row.rate).toFixed(3)} support=${row.support} ci=[${row.ci.map((v) => Number(v).toFixed(3)).join(',')}]`
    )
  }

  const builderReportPath = join(CACHE, `calibration-report-builder-${Date.now()}.json`)
  writeFileSync(
    builderReportPath,
    JSON.stringify(
      {
        timestamp: report.timestamp,
        model: MODEL,
        repeat: REPEAT,
        adjudicators: adjudicators(),
        preregistration: 'tools/judge-bench/PREREGISTRATION.md — Amendment 2',
        report: calibrationReport
      },
      null,
      2
    )
  )
  console.log(`Builder report: ${builderReportPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
