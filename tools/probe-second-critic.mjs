/**
 * Second-critic probe (user-directed; design-foreseen G2 second-model probe).
 *
 * The qwen3:8b critic scored continuity 9 on every draft including ones with
 * on-page tense alternation and self-contradiction. This tests whether the
 * blindness is model-specific or structural by re-critiquing the SAME drafts
 * with dolphin-mistral:7b — the most discriminating critic in the score-floor
 * calibration (high 8 stable, damaged 4–5 with majors).
 *
 * Critic-only: no writer calls. Same rubric prompt (buildPrompt), same story
 * bible, same chapter-log chaining — the ONLY variable is the critic model
 * (via SNAPSHOT_MODEL). Two clean controls (one mid, one high scorer) set the
 * second critic's own baseline, since absolute levels may differ by model.
 *
 * Standalone output; never touches eval-history.json:
 *   <dir>/second-critic-evals.json
 *   <dir>/second-critic-state.json (resume)
 *
 * Usage:
 *   npx vite-node tools/probe-second-critic.mjs --dir reports/calib-2026-09-12
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

function loadVolume(name) {
  return JSON.parse(readFileSync(join(DIR, name), 'utf-8'))
}

// [volumeFile, chapterTitle, sceneTitle, role]
// role: control-* (clean baseline) or defect-<arm> (known defect on-page).
const TARGETS = [
  ['volume-1.json', 'Deep Winter', 'Rationing', 'control-mid'],
  ['volume-3.json', 'Summer Boat', 'Glass', 'control-high'],
  ['volume-5-tenseflip.json', 'Equinox', 'Longer Nights', 'defect-tenseflip'],
  ['volume-5-tenseflip.json', 'Equinox', 'First Gale', 'defect-tenseflip'],
  ['volume-5-tenseflip.json', 'Equinox', 'Stores Against Winter', 'defect-tenseflip'],
  ['volume-7-briefinject.json', 'Equinox', 'Longer Nights', 'defect-briefinject-dropped'],
  ['volume-7-briefinject.json', 'Equinox', 'First Gale', 'defect-briefinject-corrected'],
  ['volume-7-briefinject.json', 'Equinox', 'Stores Against Winter', 'defect-briefinject-selfcontradiction']
]

async function criticOnce(meta, prose, chapterLog) {
  const fixture = {
    scene: {
      title: meta.title,
      emotionalGoal: meta.emotionalGoal,
      charactersPresent: meta.charactersPresent,
      payoff: meta.payoff,
      tension: meta.tension
    },
    draft: prose,
    storyBible: STORY_BIBLE,
    chapterLog,
    existingEntitiesJson: '',
    categoryType: 'creative'
  }
  const { systemPrompt, userPrompt } = buildPrompt(fixture)
  const { parsed } = await callAI(systemPrompt, userPrompt)
  const dimensionScores = parsed.dimensionScores || {}
  const scores = Object.values(dimensionScores).filter((s) => typeof s === 'number')
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  return { score, dimensionScores, issues: parsed.issues || [], strengths: parsed.strengths || [] }
}

mkdirSync(DIR, { recursive: true })
const statePath = join(DIR, 'second-critic-state.json')
const state = existsSync(statePath)
  ? { done: [], ...JSON.parse(readFileSync(statePath, 'utf-8')) }
  : { done: [] }
const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2))

const evalsPath = join(DIR, 'second-critic-evals.json')
let out = existsSync(evalsPath) ? JSON.parse(readFileSync(evalsPath, 'utf-8')) : null
if (!out) {
  out = {
    version: 1,
    description: `Second-critic probe: ${MODEL} re-critique of fixed drafts (2 clean controls + 6 defect drafts). Same prompt/bible/chapter-log as original evals; only the critic model differs. Standalone.`,
    config: { model: `ollama/${MODEL}`, criticTemp: 0.3 },
    evals: []
  }
}

console.log(`Second-critic probe | critic ${MODEL} | ${TARGETS.length} re-critiques -> ${DIR} (standalone)`)
let calls = 0
let resumed = 0
for (const [volFile, chTitle, scTitle, role] of TARGETS) {
  const key = `${volFile}|${scTitle}`
  if (state.done.includes(key)) {
    resumed++
    continue
  }
  const vol = loadVolume(volFile)
  const ch = vol.chapters.find((c) => c.title === chTitle)
  if (!ch) throw new Error(`Chapter not found: ${chTitle} in ${volFile}`)
  const idx = ch.scenes.findIndex((s) => s.title === scTitle)
  if (idx < 0) throw new Error(`Scene not found: ${scTitle} in ${volFile}/${chTitle}`)
  const scene = ch.scenes[idx]
  const chapterLog = ch.scenes.slice(0, idx).map((s) => `Scene "${s.title}": ${s.prose.slice(0, 600)}…`).join('\n')

  let crit = null
  let lastErr = null
  for (let attempt = 0; attempt < 2 && !crit; attempt++) {
    try {
      const t0 = Date.now()
      crit = await criticOnce(scene, scene.prose, chapterLog)
      calls++
      console.log(`${role} "${scTitle}" (${volFile}): ${crit.score?.toFixed(2) ?? 'n/a'} in ${((Date.now() - t0) / 1000).toFixed(0)}s dims=${JSON.stringify(crit.dimensionScores)}`)
    } catch (err) {
      lastErr = err
      console.log(`  attempt ${attempt + 1} failed: ${err.message}`)
    }
  }
  if (!crit) throw lastErr

  out.evals.push({
    projectId: 'calib-greyhook',
    sceneId: `secondcritic-${role}-${scTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    sourceVolume: volFile,
    role,
    evalType: 'story',
    score: crit.score,
    dimensionScores: crit.dimensionScores,
    issues: crit.issues,
    strengths: crit.strengths,
    timestamp: new Date().toISOString(),
    workspaceType: 'creative',
    model: `ollama/${MODEL}`
  })
  state.done.push(key)
  saveState()
  writeFileSync(evalsPath, JSON.stringify(out, null, 2))
}

console.log(`Saved ${DIR}/second-critic-evals.json (${out.evals.length} evals, ${calls} calls this run, ${resumed} resumed)`)
