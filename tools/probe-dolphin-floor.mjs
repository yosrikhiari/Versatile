/**
 * Dolphin critic-repeat floor (D12 analog under the second critic).
 *
 * Same fixed prose as the qwen critic-repeat arm (V1 "Rationing", which scored
 * qwen-mean 8.38 sd 0.166): N=10 dolphin-mistral critiques, temp 0.3, same
 * prompt/bible/empty chapter-log. Yields dolphin's per-dimension noise floor,
 * from which operating thresholds derive by the same rule that reproduces the
 * qwen provisionals (warn = 3σ, act ≈ 4σ of overall-score noise).
 *
 * Critic-only. Standalone output; never touches eval-history.json:
 *   <dir>/dolphin-critic-repeat.json
 *   <dir>/dolphin-repeat-state.json (resume)
 *
 * Usage:
 *   npx vite-node tools/probe-dolphin-floor.mjs --dir reports/calib-2026-09-12
 *   Flags: --repeats 10
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
const REPEATS = Number(arg('--repeats', '10'))
const MODEL = process.env.SNAPSHOT_MODEL

const STORY_BIBLE = `## Mara Voss — lighthouse keeper, 58. Twenty years alone on Greyhook Rock since her husband drowned. Speaks little, keeps the log in pencil. Failing eyesight she hides from the mainland inspector.
## June Voss — daughter, 31. Left at nineteen after the funeral. Marine engineer in Bergen. Stayed the winter; keeps the watch now, pencil in her pocket.
## Elias Voss — dead thirty years. Kept the light one winter; mended a chair; carved E.V. in a beam. Mara named him to June at the storm watch.`

mkdirSync(DIR, { recursive: true })

const vol1 = JSON.parse(readFileSync(join(DIR, 'volume-1.json'), 'utf-8'))
const rationing = vol1.chapters.find((c) => c.title === 'Deep Winter').scenes.find((s) => s.title === 'Rationing')
if (!rationing?.prose) throw new Error('V1 Rationing prose not found')

const statePath = join(DIR, 'dolphin-repeat-state.json')
const state = existsSync(statePath) ? { done: 0, ...JSON.parse(readFileSync(statePath, 'utf-8')) } : { done: 0 }
const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2))

const outPath = join(DIR, 'dolphin-critic-repeat.json')
let out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf-8')) : null
if (!out) {
  out = {
    version: 1,
    description: `Dolphin critic-repeat floor: ${REPEATS} critiques of fixed V1 Rationing prose, temp 0.3. Same prompt/bible/empty-log as the qwen critic-repeat arm; only the critic model differs. Standalone.`,
    sourceScene: 'calib-v1-ch1-s1',
    config: { model: `ollama/${MODEL}`, criticTemp: 0.3 },
    repeats: []
  }
}

console.log(`Dolphin floor | critic ${MODEL} | fixed scene "Rationing" | target ${REPEATS} -> ${DIR} (standalone)`)
let calls = 0
for (let i = state.done; i < REPEATS; i++) {
  const fixture = {
    scene: {
      title: rationing.title,
      emotionalGoal: rationing.emotionalGoal,
      charactersPresent: rationing.charactersPresent,
      payoff: rationing.payoff,
      tension: rationing.tension
    },
    draft: rationing.prose,
    storyBible: STORY_BIBLE,
    chapterLog: '',
    existingEntitiesJson: '',
    categoryType: 'creative'
  }
  const { systemPrompt, userPrompt } = buildPrompt(fixture)
  let result = null
  let lastErr = null
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    try {
      const t0 = Date.now()
      const { parsed } = await callAI(systemPrompt, userPrompt)
      calls++
      const dimensionScores = parsed.dimensionScores || {}
      const scores = Object.values(dimensionScores).filter((s) => typeof s === 'number')
      result = {
        index: i,
        timestamp: new Date().toISOString(),
        score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        dimensionScores,
        issues: parsed.issues || [],
        strengths: parsed.strengths || [],
        model: `ollama/${MODEL}`
      }
      console.log(`  repeat ${i + 1}: ${result.score?.toFixed(2) ?? 'n/a'} in ${((Date.now() - t0) / 1000).toFixed(0)}s dims=${JSON.stringify(dimensionScores)}`)
    } catch (err) {
      lastErr = err
      console.log(`  repeat ${i + 1} attempt ${attempt + 1} failed: ${err.message}`)
    }
  }
  if (!result) throw lastErr
  out.repeats.push(result)
  state.done = i + 1
  saveState()
  writeFileSync(outPath, JSON.stringify(out, null, 2))
}

const scores = out.repeats.map((r) => r.score)
const mean = scores.reduce((a, b) => a + b, 0) / scores.length
const sd = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length)
console.log(`Saved ${DIR}/dolphin-critic-repeat.json (${out.repeats.length} scored; mean ${mean.toFixed(3)}, sd ${sd.toFixed(3)}, range ${Math.min(...scores).toFixed(2)}-${Math.max(...scores).toFixed(2)})`)
