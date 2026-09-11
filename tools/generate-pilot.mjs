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
    title: 'The Supply Boat',
    emotionalGoal: 'guarded hope beneath resentment',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'Greyhook Rock landing',
    payoff: 'June asks to stay the winter; Mara neither accepts nor refuses',
    tension: 'twenty years unsaid between them, storm coming by nightfall',
    brief: 'A lighthouse keeper watches the autumn supply boat land the daughter she has not seen in twelve years. No melodrama: withheld gestures, practical talk about stores and weather, the storm on the horizon doing the emotional work.'
  },
  {
    title: 'The Lamp Room',
    emotionalGoal: 'fragile truce',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'lamp room, after dark',
    payoff: 'June notices the log entries are in two different hands; says nothing yet',
    tension: 'Mara climbs the ninety steps slower than she admits; the lamp must be lit before full dark',
    brief: 'That night, mother and daughter climb to the lamp room together to light the lamp before the storm hits. Physical effort, close quarters, one small kindness offered and half-refused. End on the lamp lit, not on reconciliation.'
  },
  {
    title: 'The Logbook',
    emotionalGoal: 'suspicion checked by love',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'lamp room, deep night',
    payoff: 'June asks whose handwriting shares the log; Mara answers with a name, not an explanation',
    tension: 'the storm at full force outside; the question June has held since the lamp was lit',
    brief: 'Keeping watch through the storm night, June finally asks about the second handwriting in the log. Mara names the writer — someone from before June was born — and says nothing more. Dialogue carries it; the lamp needs tending twice, giving them reasons to pause.'
  },
  {
    title: 'Salt and Iron',
    emotionalGoal: 'grudging teamwork warming',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'landing and stores, dawn',
    payoff: 'working side by side they clear the storm damage; June laughs once, surprising them both',
    tension: 'exhaustion after the sleepless night; the work is too much for Mara alone and both know it',
    brief: 'At first light the storm has passed and the landing is wrecked. Mother and daughter work side by side salvaging stores. Physical labor, practical talk, competence as affection. One genuine laugh that neither acknowledges directly.'
  },
  {
    title: 'The Light',
    emotionalGoal: 'an opening, not a resolution',
    charactersPresent: ['Mara Voss', 'June Voss'],
    location: 'lamp room, second dusk',
    payoff: 'June asks to stay the winter; Mara neither accepts nor refuses — but hands her the pencil',
    tension: 'everything unsaid pressing against one small practical gesture',
    brief: 'Closing chapter: one year of habit compressed into a single evening watch. June asks to stay the winter. Mara does not answer in words — she hands June the log pencil. End on the lamp lit and the pencil changing hands, nothing resolved aloud.'
  }
]

async function writeScene(scene) {
  const systemPrompt = 'You are a literary fiction writer. Write in close third person, present or past tense, concrete sensory detail. No headings, no preamble, no notes — prose only.'
  const userPrompt = `Write a complete short scene of about ${TARGET_WORDS} words.

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
writeFileSync(`reports/pilot-${stamp}.json`, JSON.stringify(report, null, 2))

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
writeFileSync(`reports/pilot-${stamp}.md`, md)
console.log(`Saved reports/pilot-${stamp}.json + .md`)
console.log(`Chapter gate: ${gateReport.passed ? 'PASS' : 'BLOCKED'}`)
