/**
 * Critic-repeat arm (Stage 1 of DESIGN-drift-calibration-2026-09-12, D12).
 *
 * Runs the critic N times against ONE fixed prose + fixed brief to isolate
 * critic noise from generation variance. Writes to <dir>/critic-repeat.json
 * only — never touches eval-history.json, so the clean corpus stays pure.
 *
 * Usage:
 *   npx vite-node tools/critic-repeat.mjs --dir reports/calib-2026-09-12 --repeats 10
 *
 * Source defaults to volume-1 "Rationing" (first clean scene, chapterLog '').
 * reports/ is gitignored.
 */
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

// Verbatim copy of STORY_BIBLE in tools/generate-calibration-corpus.mjs —
// the probe is only valid if the prompt is byte-identical to the corpus run.
const STORY_BIBLE = `## Mara Voss — lighthouse keeper, 58. Twenty years alone on Greyhook Rock since her husband drowned. Speaks little, keeps the log in pencil. Failing eyesight she hides from the mainland inspector.
## June Voss — daughter, 31. Left at nineteen after the funeral. Marine engineer in Bergen. Stayed the winter; keeps the watch now, pencil in her pocket.
## Elias Voss — dead thirty years. Kept the light one winter; mended a chair; carved E.V. in a beam. Mara named him to June at the storm watch.`

const vol1 = JSON.parse(readFileSync(join(DIR, 'volume-1.json'), 'utf-8'))
const source = vol1.chapters[0].scenes[0]
if (!source?.prose) throw new Error('volume-1.json missing chapter 1 scene 1 prose — cannot fix the probe input')

async function criticOnce() {
  const fixture = {
    scene: {
      title: source.title,
      emotionalGoal: source.emotionalGoal,
      charactersPresent: source.charactersPresent,
      payoff: source.payoff,
      tension: source.tension
    },
    draft: source.prose,
    storyBible: STORY_BIBLE,
    chapterLog: '',
    existingEntitiesJson: '',
    categoryType: 'creative'
  }
  const { systemPrompt, userPrompt } = buildPrompt(fixture)
  const { parsed, model } = await callAI(systemPrompt, userPrompt)
  const dimensionScores = parsed.dimensionScores || {}
  const scores = Object.values(dimensionScores).filter((s) => typeof s === 'number')
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  return { score, dimensionScores, issues: parsed.issues || [], strengths: parsed.strengths || [], model }
}

mkdirSync(DIR, { recursive: true })
const outPath = join(DIR, 'critic-repeat.json')
const record = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, 'utf-8'))
  : {
      description: 'Critic-repeat arm: N critic calls, one fixed prose (V1 Rationing), temp 0.3. Isolates critic noise.',
      sourceScene: 'calib-v1-ch1-s1',
      repeats: []
    }

console.log(`Critic-repeat | fixed scene "${source.title}" | target ${REPEATS} -> ${DIR}`)
let failures = 0
while (record.repeats.length < REPEATS) {
  const i = record.repeats.length
  let result = null
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    try {
      const t0 = Date.now()
      result = await criticOnce()
      console.log(`  repeat ${i + 1}: ${result.score?.toFixed(2) ?? 'n/a'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    } catch (err) {
      console.log(`  repeat ${i + 1} attempt ${attempt + 1} failed: ${err.message}`)
      if (attempt === 1) failures++
    }
  }
  record.repeats.push({
    index: i,
    timestamp: new Date().toISOString(),
    ...(result ?? { score: null, evalUnavailable: true })
  })
  writeFileSync(outPath, JSON.stringify(record, null, 2))
}
const scores = record.repeats.map((r) => r.score).filter((s) => typeof s === 'number')
const mean = scores.reduce((a, b) => a + b, 0) / scores.length
const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length)
console.log(`Saved ${outPath} (${scores.length} scored, ${failures} failed; mean ${mean.toFixed(3)}, sd ${sd.toFixed(3)}, range ${Math.min(...scores).toFixed(2)}-${Math.max(...scores).toFixed(2)})`)
