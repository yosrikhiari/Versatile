/**
 * Full injection series under dolphin (operating-critic rebuild).
 *
 * Re-critiques all 45 calibration drafts with dolphin-mistral:7b — 27 clean
 * (vols 1–3), 9 degraded-prompt (vol 4), 3 tense-flip, 3 contradiction,
 * 3 brief-inject — reproducing each original eval's chapter-log chaining
 * exactly (preceding-scenes slices) and mirroring its timestamp, so monitor
 * window splits reproduce one-to-one. Writer fixed (qwen3:8b); only the
 * critic model differs from eval-history.json. Qwen scores retained per eval
 * for paired comparison.
 *
 * Critic-only (45 calls). Standalone output; never touches eval-history.json:
 *   <dir>/eval-history-dolphin.json
 *   <dir>/dolphin-series-state.json (resume)
 *
 * Usage:
 *   npx vite-node tools/probe-dolphin-series.mjs --dir reports/calib-2026-09-12
 */
process.env.SNAPSHOT_PROVIDER = process.env.SNAPSHOT_PROVIDER || 'ollama'
process.env.SNAPSHOT_MODEL = process.env.SNAPSHOT_MODEL || 'dolphin-mistral:7b'

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { callAI, buildPrompt } from './libs/criticSnapshot.mjs'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const DIR = arg('--dir')
if (!DIR) {
  console.error('Missing required --dir reports/calib-<stamp>')
  process.exit(1)
}
const MODEL = process.env.SNAPSHOT_MODEL

const STORY_BIBLE = `## Mara Voss — lighthouse keeper, 58. Twenty years alone on Greyhook Rock since her husband drowned. Speaks little, keeps the log in pencil. Failing eyesight she hides from the mainland inspector.
## June Voss — daughter, 31. Left at nineteen after the funeral. Marine engineer in Bergen. Stayed the winter; keeps the watch now, pencil in her pocket.
## Elias Voss — dead thirty years. Kept the light one winter; mended a chair; carved E.V. in a beam. Mara named him to June at the storm watch.`

mkdirSync(DIR, { recursive: true })

// Source plan: [volumeFile, evalFile|null, volumeNo]
// evalFile null => evals live in eval-history.json (vols 1-4).
const PLAN = [
  ['volume-1.json', null, 1],
  ['volume-2.json', null, 2],
  ['volume-3.json', null, 3],
  ['volume-4.json', null, 4],
  ['volume-5-tenseflip.json', 'tenseflip-evals.json', 5],
  ['volume-6-contradiction.json', 'contradiction-evals.json', 6],
  ['volume-7-briefinject.json', 'briefinject-evals.json', 7]
]

const mainHistory = JSON.parse(readFileSync(join(DIR, 'eval-history.json'), 'utf-8'))
const tsByScene = new Map(mainHistory.evals.map((e) => [e.sceneId, e.timestamp]))
const qwenByScene = new Map(mainHistory.evals.map((e) => [e.sceneId, e]))
for (const [, evalFile] of PLAN) {
  if (!evalFile) continue
  const h = JSON.parse(readFileSync(join(DIR, evalFile), 'utf-8'))
  for (const e of h.evals) {
    tsByScene.set(e.sceneId, e.timestamp)
    qwenByScene.set(e.sceneId, null) // probes have no qwen counterpart under identical conditions
  }
}

// Work list in canonical order: every scene of every volume file.
const work = []
for (const [volFile, evalFile, volNo] of PLAN) {
  const vol = JSON.parse(readFileSync(join(DIR, volFile), 'utf-8'))
  const probeHistory = evalFile ? JSON.parse(readFileSync(join(DIR, evalFile), 'utf-8')) : null
  vol.chapters.forEach((ch, ci) => {
    ch.scenes.forEach((s, si) => {
      // Canonical sceneId mirrors generate-calibration-corpus.mjs for vols
      // 1-4; probe files carry their own ids in order.
      let sceneId
      if (!evalFile) {
        sceneId = `calib-v${volNo}-ch${ci + 1}-s${si + 1}`
      } else {
        sceneId = probeHistory.evals[vol.chapters.slice(0, ci).reduce((n, c) => n + c.scenes.length, 0) + si].sceneId
      }
      work.push({ volFile, volNo, chTitle: ch.title, scene: s, sceneIdx: si, chapterScenes: ch.scenes, sceneId })
    })
  })
}
console.log(`Dolphin series | critic ${MODEL} | ${work.length} re-critiques -> ${DIR} (standalone)`)

const statePath = join(DIR, 'dolphin-series-state.json')
const state = existsSync(statePath) ? { done: [], ...JSON.parse(readFileSync(statePath, 'utf-8')) } : { done: [] }
const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2))

const outPath = join(DIR, 'eval-history-dolphin.json')
let out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf-8')) : null
if (!out) {
  out = {
    version: 1,
    description: `Full injection series under dolphin-mistral:7b: 27 clean + 9 degraded-prompt + 3 tense-flip + 3 contradiction + 3 brief-inject, writer qwen3:8b fixed, chapter-logs and timestamps mirrored from source evals. Qwen scores retained as qwenScore/qwenDimensionScores for paired comparison. Standalone — eval-history.json untouched.`,
    config: { model: 'ollama/qwen3:8b', criticModel: `ollama/${MODEL}`, writerTemp: 0.8, criticTemp: 0.3, wordsPerScene: 400 },
    evals: []
  }
}
const have = new Set(out.evals.map((e) => e.sceneId))

let calls = 0
let resumed = 0
let unavailable = 0
for (const w of work) {
  if (state.done.includes(w.sceneId) && have.has(w.sceneId)) {
    resumed++
    continue
  }
  const chapterLog = w.chapterScenes.slice(0, w.sceneIdx).map((s) => `Scene "${s.title}": ${s.prose.slice(0, 600)}…`).join('\n')
  const fixture = {
    scene: {
      title: w.scene.title,
      emotionalGoal: w.scene.emotionalGoal,
      charactersPresent: w.scene.charactersPresent,
      payoff: w.scene.payoff,
      tension: w.scene.tension
    },
    draft: w.scene.prose,
    storyBible: STORY_BIBLE,
    chapterLog,
    existingEntitiesJson: '',
    categoryType: 'creative'
  }
  const { systemPrompt, userPrompt } = buildPrompt(fixture)
  let crit = null
  for (let attempt = 0; attempt < 2 && !crit; attempt++) {
    try {
      const t0 = Date.now()
      const { parsed } = await callAI(systemPrompt, userPrompt)
      calls++
      const dimensionScores = parsed.dimensionScores || {}
      const scores = Object.values(dimensionScores).filter((s) => typeof s === 'number')
      crit = {
        score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        dimensionScores,
        issues: parsed.issues || [],
        strengths: parsed.strengths || []
      }
      console.log(`${w.sceneId}: ${crit.score?.toFixed(2) ?? 'n/a'} in ${((Date.now() - t0) / 1000).toFixed(0)}s dims=${JSON.stringify(dimensionScores)}`)
    } catch (err) {
      console.log(`  ${w.sceneId} attempt ${attempt + 1} failed: ${err.message}`)
      if (attempt === 1) {
        unavailable++
        crit = { score: null, dimensionScores: {}, issues: [], strengths: [], evalUnavailable: true }
      }
    }
  }
  const qwen = qwenByScene.get(w.sceneId)
  if (!have.has(w.sceneId)) {
    out.evals.push({
      projectId: 'calib-greyhook',
      sceneId: w.sceneId,
      evalType: 'story',
      score: crit.score,
      dimensionScores: crit.dimensionScores,
      issues: crit.issues,
      strengths: crit.strengths,
      timestamp: tsByScene.get(w.sceneId),
      workspaceType: 'creative',
      volume: w.volNo,
      chapter: w.chTitle,
      promptVariant: w.volNo <= 3 ? 'clean' : w.volNo === 4 ? 'degraded' : ['tense-flip', 'contradiction', 'brief-inject'][w.volNo - 5],
      model: 'ollama/qwen3:8b',
      criticModel: `ollama/${MODEL}`,
      ...(qwen ? { qwenScore: qwen.score, qwenDimensionScores: qwen.dimensionScores } : {}),
      ...(crit.evalUnavailable ? { evalUnavailable: true } : {})
    })
  }
  state.done.push(w.sceneId)
  saveState()
  writeFileSync(outPath, JSON.stringify(out, null, 2))
}

console.log(`Saved ${DIR}/eval-history-dolphin.json (${out.evals.length} evals, ${calls} calls this run, ${resumed} resumed, ${unavailable} unavailable)`)
