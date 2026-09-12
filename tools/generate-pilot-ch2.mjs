/**
 * Sample-generation E2E: writes a 2-scene mini-chapter with a real local model,
 * then runs the app's own critic + quality gates + chapter acceptance on it.
 *
 * Usage:  npx vite-node tools/generate-sample.mjs [--model qwen3:8b] [--words 400]
 * Needs:  Ollama on http://localhost:11434 (or OLLAMA_HOST) with the model pulled.
 * Output: reports/sample-<timestamp>.json + .md (reports/ is gitignored).
 */
import { writeFileSync, mkdirSync } from 'fs'
import { callAI, buildPrompt } from './libs/criticSnapshot.mjs'
import {
  countWords,
  countUniqueWords,
  duplicateRatio,
  MAX_DUPLICATE_RATIO,
  gateProseQuality
} from '../src/services/evalGates.ts'
import {
  evaluateChapter,
  describeChapterGate,
  CROSS_SCENE_OVERLAP_RATIO
} from '../src/services/generation/chapterGate.ts'

const MODEL = process.argv.includes('--model')
  ? process.argv[process.argv.indexOf('--model') + 1]
  : process.env.SAMPLE_MODEL || 'qwen3:8b'
const TARGET_WORDS = Number(
  process.argv.includes('--words') ? process.argv[process.argv.indexOf('--words') + 1] : 400
)
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'

const STORY_BIBLE = `## Mara Voss — lighthouse keeper, 58. Twenty years alone on Greyhook Rock since her husband drowned. Speaks little, keeps the log in pencil. Failing eyesight she hides from the mainland inspector.
## June Voss — daughter, 31. Left at nineteen after the funeral. Marine engineer in Bergen. Arrived unannounced on the supply boat with a duffel and her father's sextant.`

const SCENES = [
  {
    title: 'First Snow',
    emotionalGoal: 'settling in, wariness thawing',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'landing and stores, early winter',
    payoff: 'June takes over the supply inventory without being asked; Mara notices and says nothing',
    tension: 'the unasked question of whether June staying is permanent',
    brief: 'Weeks later, first snow. June has quietly taken over the stores inventory — the pencil now lives in her pocket. Mara watches her work with something almost like approval. Small domestic details, cold air, the lamp routine now shared without discussion.'
  },
  {
    title: 'Elias’s Chair',
    emotionalGoal: 'grief surfacing sideways',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'keeper’s cottage, evening',
    payoff: 'June finds a mended chair she was never told about; Mara admits Elias lived here one winter',
    tension: 'June realizing how much of her mother’s life happened without her',
    brief: 'Inside the cottage for the first time, June finds small traces of Elias — a mended chair, initials carved in a beam. Mara reveals, sparely, that Elias kept the light one winter thirty years ago. No melodrama; objects carry the history.'
  },
  {
    title: 'The Long Night',
    emotionalGoal: 'quiet commitment',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'lamp room, solstice night',
    payoff: 'June lights the lamp alone while Mara sleeps below — the transfer complete, still unspoken',
    tension: 'a gale testing the light; June alone responsible for the first time',
    brief: 'Solstice, the longest night. A gale batters the rock. Mara, feverish with cold, sleeps below while June keeps the watch alone — tending the lamp, logging the hour in her own hand. End on June writing in the log, the pencil warm from her pocket.'
  }
]

// Prior-chapter context, mirroring what the real pipeline carries as
// digests/ledgers: the writer of chapter 2 must know chapter 1, or any
// continuity it shows is luck rather than craft.
const PRIOR_CHAPTER = `Previously (Chapter 1, Greyhook Rock, autumn storm): June Voss returned after twelve years and asked to stay the winter; Mara neither accepted nor refused. They weathered a storm night together, discovered the logbook carries two handwritings, Mara named the other writer "Elias" (dead, from before June was born). After the storm they salvaged the landing together and June laughed once. At second dusk June asked to stay; Mara answered by handing her the log pencil. The lamp is lit. Key facts: Mara 58, failing eyesight, hides it; June 31, marine engineer; the pencil now symbolizes the unspoken arrangement.`

async function writeScene(scene) {
  const systemPrompt = 'You are a literary fiction writer. Write in close third person, present or past tense, concrete sensory detail. No headings, no preamble, no notes — prose only.'
  const userPrompt = `Write a complete short scene of about ${TARGET_WORDS} words.

${PRIOR_CHAPTER}

TITLE: ${scene.title}
LOCATION: ${scene.location}
CHARACTERS: ${scene.charactersPresent.join(', ')}
EMOTIONAL GOAL: ${scene.emotionalGoal}
TENSION: ${scene.tension}
PAYOFF: ${scene.payoff}
BRIEF: ${scene.brief}

Write the scene now as prose.`
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      options: { temperature: 0.8, num_ctx: 8192 },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  })
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.message?.content || '').trim()
}

function sentenceOverlap(a, b) {
  const keys = (t) =>
    new Set(
      String(t || '')
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter((s) => s && s.split(' ').length >= 5)
    )
  const ka = keys(a)
  const kb = keys(b)
  if (!ka.size || !kb.size) return 0
  let shared = 0
  for (const k of ka) if (kb.has(k)) shared++
  return shared / Math.min(ka.size, kb.size)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
mkdirSync('reports', { recursive: true })

console.log(`Model: ${MODEL} | target: ~${TARGET_WORDS} words/scene | ${SCENES.length} scenes (pilot chapter)`)
const scenes = []
for (let i = 0; i < SCENES.length; i++) {
  const t0 = Date.now()
  const prose = await writeScene(SCENES[i])
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  const words = countWords(prose)
  console.log(`Scene ${i + 1} "${SCENES[i].title}": ${words} words in ${secs}s`)
  if (!prose) throw new Error(`Scene ${i + 1} came back empty — aborting sample`)
  scenes.push({ ...SCENES[i], prose, words })
}

console.log('Running critic (same model, app critic prompt)...')
const verdicts = []
for (let i = 0; i < scenes.length; i++) {
  const fixture = {
    scene: {
      title: scenes[i].title,
      emotionalGoal: scenes[i].emotionalGoal,
      charactersPresent: scenes[i].charactersPresent,
      payoff: scenes[i].payoff,
      tension: scenes[i].tension
    },
    draft: scenes[i].prose,
    storyBible: STORY_BIBLE,
    chapterLog: scenes
      .slice(0, i)
      .map((s, j) => `Scene ${j + 1} "${s.title}": ${s.prose.slice(0, 600)}…`)
      .join('\n'),
    existingEntitiesJson: '',
    categoryType: 'creative'
  }
  const { systemPrompt, userPrompt, dimensionNames, threshold } = buildPrompt(fixture)
  const { parsed } = await callAI(systemPrompt, userPrompt)
  const dimensionScores = parsed.dimensionScores || {}
  const scores = Object.values(dimensionScores).filter((s) => typeof s === 'number')
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  const passed = score != null && score >= threshold
  console.log(`  Scene ${i + 1} critic: ${score?.toFixed(2) ?? 'n/a'} (threshold ${threshold}) → ${passed ? 'PASS' : 'FAIL'}`)
  verdicts.push({ sceneIndex: i, passed, score, dimensionScores, evalUnavailable: score == null })
}

const analysis = scenes.map((s, i) => {
  const v = verdicts[i]
  const gate = gateProseQuality({ dimensionScores: v.dimensionScores }, 0, s.words, TARGET_WORDS, s.prose)
  return {
    scene: s.title,
    words: s.words,
    uniqueWords: countUniqueWords(s.prose),
    duplicateRatio: Number(duplicateRatio(s.prose).toFixed(3)),
    duplicateLimit: MAX_DUPLICATE_RATIO,
    criticScore: v.score != null ? Number(v.score.toFixed(2)) : null,
    gatePass: gate.pass,
    gateFlags: gate.flags || []
  }
})
let crossOverlap = 0
for (let a = 0; a < scenes.length; a++) {
  for (let b = a + 1; b < scenes.length; b++) {
    crossOverlap = Math.max(crossOverlap, sentenceOverlap(scenes[a].prose, scenes[b].prose))
  }
}
crossOverlap = Number(crossOverlap.toFixed(3))
const gateReport = evaluateChapter({
  scenes: scenes.map((s, i) => ({
    title: s.title,
    prose: s.prose,
    sceneNumber: i + 1,
    characters: s.charactersPresent,
    location: s.location
  })),
  plan: scenes.map((s, i) => ({ sceneNumber: i + 1, title: s.title, estimatedWords: TARGET_WORDS })),
  verdicts,
  targetWords: TARGET_WORDS * scenes.length
})

const report = {
  generatedAt: new Date().toISOString(),
  model: MODEL,
  targetWordsPerScene: TARGET_WORDS,
  scenes: scenes.map((s) => ({ title: s.title, words: s.words, prose: s.prose })),
  analysis,
  crossSceneSentenceOverlap: crossOverlap,
  crossSceneOverlapLimit: CROSS_SCENE_OVERLAP_RATIO,
  chapterGate: { passed: gateReport.passed, findings: gateReport.findings, metrics: gateReport.metrics, summary: describeChapterGate(gateReport) },
  criticThresholdNote: 'thresholds from app eval config via buildPrompt'
}
writeFileSync(`reports/pilot-ch2-${stamp}.json`, JSON.stringify(report, null, 2))

const md = `# Sample generation report — ${report.generatedAt}
Model: ${MODEL} (local Ollama) · target ~${TARGET_WORDS} words × ${scenes.length} scenes

${analysis
  .map(
    (a, i) => `## Scene ${i + 1}: ${a.scene}
- Words: ${a.words} (unique ${a.uniqueWords}) · duplicate ratio ${a.duplicateRatio} (limit ${a.duplicateLimit})
- Critic: ${a.criticScore ?? 'unavailable'} · prose gate: ${a.gatePass ? 'pass' : 'FAIL'}${a.gateFlags.length ? ` — ${a.gateFlags.join('; ')}` : ''}`
  )
  .join('\n\n')}

Cross-scene sentence overlap: ${crossOverlap} (limit ${CROSS_SCENE_OVERLAP_RATIO})
Chapter gate: **${gateReport.passed ? 'PASS' : 'BLOCKED'}** — ${describeChapterGate(gateReport)}

## Prose
${scenes.map((s, i) => `### Scene ${i + 1}: ${s.title}\n\n${s.prose}`).join('\n\n')}
`
writeFileSync(`reports/pilot-ch2-${stamp}.md`, md)
console.log(`Saved reports/pilot-ch2-${stamp}.json + .md`)
console.log(`Chapter gate: ${gateReport.passed ? 'PASS' : 'BLOCKED'}`)
