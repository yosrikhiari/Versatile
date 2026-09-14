/**
 * Story-bible contradiction probe (user-directed extension beyond D15).
 *
 * Holds craft constant (CLEAN system prompt, Equinox briefs verbatim — the
 * same 3 scenes the degraded and tense-flip arms ran) and corrupts ONLY the
 * prior-context facts, mimicking a digest/ledger regression that misstates
 * canon. The critic still receives the CORRECT story bible, so any
 * continuity delta isolates factual-drift sensitivity — the exact scenario
 * the drift monitor exists to catch.
 *
 * Corruptions vs the correct bible (all critic-checkable):
 *   Mara 58 -> 62 | June 31 -> 29 | left at nineteen -> at twelve |
 *   Elias dead thirty years -> drowned last winter |
 *   pencil in June's pocket -> pencil belongs to Mara
 *
 * Writes STANDALONE outputs; never touches eval-history.json:
 *   <dir>/volume-6-contradiction.json
 *   <dir>/contradiction-evals.json  (timestamps sequenced after every other
 *                                    calib record so merged runs sort last)
 *   <dir>/contradiction-state.json  (resume state)
 *
 * Usage:
 *   npx vite-node tools/probe-contradiction.mjs --dir reports/calib-2026-09-12
 *   Flags: --model qwen3:8b --words 400
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
const MODEL = arg('--model') || process.env.SAMPLE_MODEL || 'qwen3:8b'
const TARGET_WORDS = Number(arg('--words', '400'))
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'

// Craft held constant — identical to the clean volumes. Only facts differ.
const CLEAN_SYSTEM =
  'You are a literary fiction writer. Write in close third person, present or past tense, concrete sensory detail. No headings, no preamble, no notes — prose only.'

const STORY_BIBLE = `## Mara Voss — lighthouse keeper, 58. Twenty years alone on Greyhook Rock since her husband drowned. Speaks little, keeps the log in pencil. Failing eyesight she hides from the mainland inspector.
## June Voss — daughter, 31. Left at nineteen after the funeral. Marine engineer in Bergen. Stayed the winter; keeps the watch now, pencil in her pocket.
## Elias Voss — dead thirty years. Kept the light one winter; mended a chair; carved E.V. in a beam. Mara named him to June at the storm watch.`

// Corrupted digest: every "Key fact" below contradicts the bible above.
// Scene-relevant corruptions first (pencil ownership, Elias recency) so the
// writer has reason to state them; the validity check after generation greps
// the prose for at least one surfaced contradiction.
const CORRUPT_SEED = `Previously on Greyhook Rock: June Voss returned after a long absence and stayed the winter. They weathered an autumn storm together and found the logbook carries two handwritings; Mara named the other writer Elias, who drowned last winter keeping the light in the March storm. June took over stores inventory. Key facts: Mara 62, failing eyesight, hides it — she often remarks on her sixty-two years; June 29, marine engineer; June left the rock at twelve after the funeral and only just came back; Elias Voss, mended chair, initials E.V.; the keeper's pencil belongs to Mara and June merely borrows it when Mara allows.`

// Verbatim briefs from VOLUMES[4].chapters[0] ("Equinox") in
// tools/generate-calibration-corpus.mjs.
const SCENES = [
  {
    title: 'Longer Nights',
    emotionalGoal: 'light becoming work again',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'lamp room, September dusk',
    payoff: 'the lamp burns longer each night; June trims the wick while Mara times the rotation by ear',
    tension: 'summer ease ending one minute of daylight at a time',
    brief: 'September. Dusk comes earlier every evening and the lamp hours stretch. June trims and fills with the old engine-room economy while Mara sits below, timing the rotation by ear the way she did before June’s rebuild, checking it still holds.'
  },
  {
    title: 'First Gale',
    emotionalGoal: 'trust tested by weather, not people',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'lamp room and cottage, September gale',
    payoff: 'the first autumn gale batters the rock; the shared watch holds through it without a missed hour',
    tension: 'the August gale was summer; this one has teeth',
    brief: 'The first real autumn gale, rain horizontal at the lamp-room glass. They keep the watch turn and turn about as in August, but the cold is different now, and the stairs are slick. Every hour logged. The light never falters, but both feel the season turn.'
  },
  {
    title: 'Stores Against Winter',
    emotionalGoal: 'care expressed as arithmetic, again',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'stores, late September',
    payoff: 'June audits the stores against a full winter for two keepers; the math holds with margin this time',
    tension: 'last January’s thin flour against this year’s full shelves',
    brief: 'Late September audit, the way June did it alone in January. Flour, salt, oil, wicks — a full winter for two keepers, figures checked twice. Mara corrects nothing this time; she carries the tally to the cottage herself and reads it back, slowly, every word right.'
  }
]

function userPromptFor(scene, priorContext) {
  return `Write a complete short scene of about ${TARGET_WORDS} words.

${priorContext}

TITLE: ${scene.title}
LOCATION: ${scene.location}
CHARACTERS: ${scene.charactersPresent.join(', ')}
EMOTIONAL GOAL: ${scene.emotionalGoal}
TENSION: ${scene.tension}
PAYOFF: ${scene.payoff}
BRIEF: ${scene.brief}

Write the scene now as prose.`
}

async function writeSceneOnce(scene, priorContext) {
  // Streaming: headers arrive immediately and tokens concatenate, so a
  // multi-minute generation can never trip the HTTP headers timeout the way
  // a buffered stream:false call does at ~280s+ per scene.
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      options: { temperature: 0.8, num_ctx: 8192 },
      messages: [
        { role: 'system', content: CLEAN_SYSTEM },
        { role: 'user', content: userPromptFor(scene, priorContext) }
      ]
    })
  })
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`)
  let prose = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      try {
        prose += JSON.parse(t).message?.content || ''
      } catch {
        // keep-alive whitespace / partial chunk — next read completes it
      }
    }
  }
  return prose.trim()
}

async function writeScene(scene, priorContext) {
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await writeSceneOnce(scene, priorContext)
    } catch (err) {
      lastErr = err
      console.log(`  writer attempt ${attempt + 1} failed: ${err.message}`)
    }
  }
  throw lastErr
}

async function criticScene(record, chapterLog) {
  const fixture = {
    scene: {
      title: record.title,
      emotionalGoal: record.emotionalGoal,
      charactersPresent: record.charactersPresent,
      payoff: record.payoff,
      tension: record.tension
    },
    draft: record.prose,
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

const statePath = join(DIR, 'contradiction-state.json')
const state = existsSync(statePath)
  ? { sceneIndex: 0, done: [], ...JSON.parse(readFileSync(statePath, 'utf-8')) }
  : { sceneIndex: 0, done: [] }
const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2))

// Sequence probe timestamps after EVERY other calib record (corpus + tense-flip).
let lastTs = Date.now()
for (const f of ['eval-history.json', 'tenseflip-evals.json']) {
  const p = join(DIR, f)
  if (existsSync(p)) {
    const h = JSON.parse(readFileSync(p, 'utf-8'))
    if (h.evals?.length) {
      const t = new Date(h.evals[h.evals.length - 1].timestamp).getTime()
      if (t > lastTs) lastTs = t
    }
  }
}
const tsFor = (i) => new Date(lastTs + (i + 1) * 3600_000).toISOString()

const evalsPath = join(DIR, 'contradiction-evals.json')
let probe = existsSync(evalsPath) ? JSON.parse(readFileSync(evalsPath, 'utf-8')) : null
if (!probe) {
  probe = {
    version: 1,
    description: `Contradiction probe: Equinox briefs verbatim, clean craft, corrupted prior-context facts (Mara 62, June 29/left at twelve, Elias drowned last winter, pencil is Mara's), correct bible to critic. Standalone — not part of the calibration corpus.`,
    config: { model: MODEL, writerTemp: 0.8, criticTemp: 0.3, wordsPerScene: TARGET_WORDS, promptVariant: 'contradiction' },
    evals: []
  }
}

const volumePath = join(DIR, 'volume-6-contradiction.json')
const volumeRecord = existsSync(volumePath)
  ? JSON.parse(readFileSync(volumePath, 'utf-8'))
  : { volume: 6, promptVariant: 'contradiction', model: MODEL, chapters: [{ title: 'Equinox', scenes: [] }] }

console.log(`Contradiction probe | model ${MODEL} | 1 chapter (Equinox, 3 scenes) -> ${DIR} (standalone files)`)
const chapterLogBits = volumeRecord.chapters[0].scenes.map(
  (s) => `Scene "${s.title}": ${s.prose.slice(0, 600)}…`
)
let calls = 0
let resumed = 0
let criticFailures = 0
for (const scene of SCENES) {
  const key = `equinox|${scene.title}`
  const recorded = volumeRecord.chapters[0].scenes.find((s) => s.title === scene.title && s.prose)
  if (state.done.includes(key) && recorded) {
    resumed++
    continue
  }
  const priorContext = `Story so far:\n${CORRUPT_SEED}`
  const tGen = Date.now()
  const prose = await writeScene(scene, priorContext)
  calls++
  const genSecs = ((Date.now() - tGen) / 1000).toFixed(0)
  if (!prose) throw new Error(`Contradiction scene "${scene.title}" came back empty — aborting`)
  const words = prose.split(/\s+/).filter(Boolean).length
  console.log(`CX "Equinox" / "${scene.title}": ${words} words in ${genSecs}s`)

  let crit = null
  for (let attempt = 0; attempt < 2 && !crit; attempt++) {
    try {
      const tCrit = Date.now()
      crit = await criticScene({ ...scene, prose }, chapterLogBits.join('\n'))
      calls++
      console.log(`  critic: ${crit.score?.toFixed(2) ?? 'n/a'} in ${((Date.now() - tCrit) / 1000).toFixed(0)}s`)
    } catch (err) {
      console.log(`  critic attempt ${attempt + 1} failed: ${err.message}`)
      if (attempt === 1) {
        criticFailures++
        crit = { score: null, dimensionScores: {}, issues: [], strengths: [], evalUnavailable: true }
      }
    }
  }

  const idx = state.sceneIndex++
  const sceneId = `contradiction-ch1-s${volumeRecord.chapters[0].scenes.length + 1}`
  if (!probe.evals.some((e) => e.sceneId === sceneId)) {
    probe.evals.push({
      projectId: 'calib-greyhook',
      sceneId,
      evalType: 'story',
      score: crit.score,
      dimensionScores: crit.dimensionScores,
      issues: crit.issues,
      strengths: crit.strengths,
      timestamp: tsFor(idx),
      workspaceType: 'creative',
      volume: 6,
      chapter: 'Equinox',
      promptVariant: 'contradiction',
      model: `ollama/${MODEL}`,
      ...(crit.evalUnavailable ? { evalUnavailable: true } : {})
    })
  }
  volumeRecord.chapters[0].scenes.push({ ...scene, prose, words, critic: crit })
  chapterLogBits.push(`Scene "${scene.title}": ${prose.slice(0, 600)}…`)
  state.done.push(key)
  saveState()
  writeFileSync(evalsPath, JSON.stringify(probe, null, 2))
  writeFileSync(volumePath, JSON.stringify(volumeRecord, null, 2))
}
if (criticFailures > 1) throw new Error(`Too many critic failures (${criticFailures}) — aborting probe for data quality`)

console.log(`Saved ${DIR}/volume-6-contradiction.json + contradiction-evals.json (${probe.evals.length} evals, ${calls} calls this run, ${resumed} resumed, ${criticFailures} critic failures)`)
