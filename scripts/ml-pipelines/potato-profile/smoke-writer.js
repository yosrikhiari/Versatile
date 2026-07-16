/**
 * Live writer smoke test — drives the REAL pipeline against a REAL model.
 *
 * Everything else in this directory measures without generating. This one
 * actually writes a scene, through useStoryWriter.writeSceneStructured, through
 * aiService, through the Ollama provider, and checks what comes back.
 *
 * It exists because unit tests mock the model, and several recent changes rest
 * on assumptions only a live model can settle:
 *
 *   - Does the model actually emit the `summary` field? If not, every scene
 *     silently falls back to a separate LLM call and the 27% saving evaporates.
 *   - Does the context budget produce a prompt the model can parse?
 *   - Is num_ctx honoured on THIS Ollama version? (It has moved twice during
 *     development: 0.15.5 -> 0.31.2 -> 0.32.0.)
 *   - Does the whole structured contract survive a small local model?
 *
 * Requires Ollama running with at least one non-embedding model pulled.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/smoke-writer.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/smoke-writer.js --model phi4-mini:3.8b
 */

import 'fake-indexeddb/auto'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ENDPOINT = arg('endpoint', process.env.OLLAMA_HOST || 'http://localhost:11434')

// config/ollama.js reads its endpoint from localStorage and falls back to
// '/ollama' — a Vite proxy path that only resolves in the browser. Feeding the
// real origin through the same accessor keeps the app code untouched.
const STORE = { versatile_ollama_endpoint: ENDPOINT }
globalThis.localStorage = {
  getItem: (k) => (k in STORE ? STORE[k] : null),
  setItem: (k, v) => {
    STORE[k] = String(v)
  },
  removeItem: (k) => {
    delete STORE[k]
  }
}

const say = (s = '') => console.log(s)
const ok = (b) => (b ? '✓' : '✗')

async function pickModel() {
  const explicit = arg('model', null)
  const res = await fetch(`${ENDPOINT}/api/tags`)
  const { models = [] } = await res.json()
  const usable = models.map((m) => m.name).filter((n) => !/embed/i.test(n))
  if (!usable.length) throw new Error('No non-embedding models pulled.')
  if (explicit && !usable.includes(explicit)) {
    throw new Error(`Model "${explicit}" not pulled. Available: ${usable.join(', ')}`)
  }
  return explicit || usable[0]
}

/** A small but realistic bible — enough that scoping and budgeting do something. */
function makeBible() {
  return {
    characters: [
      {
        name: 'Mira Vance',
        role: 'harbormaster',
        description:
          'Late forties, weathered hands, keeps the tide ledger in her coat pocket. Speaks in short sentences and never repeats herself.',
        traits: ['guarded', 'precise']
      },
      {
        name: 'Ilan Roth',
        role: 'debt collector',
        description:
          'Younger than he looks, dresses better than the town. Polite in a way that reads as a threat.',
        traits: ['patient', 'unhurried']
      },
      {
        name: 'Teodor Vance',
        role: "Mira's brother, absent",
        description: 'Left the harbor eleven years ago owing money to the wrong people.',
        traits: ['absent']
      }
    ],
    locations: [
      {
        name: 'The Tide Office',
        description: 'A single room over the dock, one window, a stove that never quite works.',
        notes: 'Mira has kept the ledger here for twenty years.',
        traits: ['cold']
      },
      {
        name: 'The Long Pier',
        description: 'Half of it condemned; the good half still takes the morning boats.',
        notes: '',
        traits: []
      }
    ],
    plotThreads: [
      {
        title: "Teodor's debt",
        status: 'open',
        notes: 'Ilan has come to collect it from Mira instead.',
        traits: []
      }
    ]
  }
}

const SCENE_BRIEF = {
  sceneNumber: 4,
  title: 'The Ledger',
  emotionalGoal: 'Mira realises the debt is now hers',
  whatChanges: 'Ilan makes the claim explicit; Mira stops pretending not to understand',
  charactersPresent: ['Mira Vance', 'Ilan Roth'],
  characterWants: { 'Mira Vance': 'to end the conversation', 'Ilan Roth': 'a signature' },
  setup: 'The tide ledger is on the desk between them',
  payoff: 'Mira closes the ledger',
  sensoryAnchor: 'the stove ticking as it cools',
  tension: 'high',
  pacing: 'slow',
  arcPosition: 'rising',
  location: 'The Tide Office',
  estimatedWords: 400
}

async function main() {
  say('LIVE WRITER SMOKE TEST — real pipeline, real model')
  say('='.repeat(78))
  say(`endpoint: ${ENDPOINT}`)

  let version = '?'
  try {
    version = (await (await fetch(`${ENDPOINT}/api/version`)).json()).version
  } catch {
    /* reported below */
  }
  const model = await pickModel()
  say(`ollama:   ${version}`)
  say(`model:    ${model}`)
  say()

  // --- Wire the app's real stores, then call the app's real writer. ---
  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())

  const { useSettingsStore } = await import('../../../src/stores/settingsStore.js')
  const settings = useSettingsStore()
  settings.ollamaModel = model
  settings.aiProvider = 'ollama'
  settings.aiProviderFallback = 'none'

  const { buildSceneEntitiesBlob } = await import(
    '../../../src/composables/generation/context/sceneContext.js'
  )
  const { useStoryWriter } = await import('../../../src/composables/useStoryWriter.js')
  const { DEFAULT_NUM_CTX } = await import('../../../src/config/ollama.js')

  const bible = makeBible()
  const entities = buildSceneEntitiesBlob(SCENE_BRIEF, bible)
  say(`scene-scoped entities: ${entities ? `${entities.length} chars` : 'null (would fall back)'}`)
  say(`num_ctx requested:     ${DEFAULT_NUM_CTX}`)
  say()
  say('Writing scene… (a cold model load can take a minute)')
  say()

  const started = Date.now()
  const { writeSceneStructured } = useStoryWriter()
  const result = await writeSceneStructured({
    sceneBrief: SCENE_BRIEF,
    storyArc: { genre: 'literary crime', tone: 'cold, restrained', centralConflict: 'inherited debt' },
    chapterLog: [
      'Scene 1 ("Arrival"): Ilan steps off the morning boat and asks for Mira by name.',
      'Scene 2 ("The Long Pier"): Mira avoids him for a day.',
      'Scene 3 ("Nightfall"): Ilan waits outside the Tide Office until she leaves.'
    ],
    storyBible:
      'STORY CONTEXT\n\nThe harbor is failing. Mira has kept the tide ledger for twenty years. Her brother Teodor left owing money.',
    storyContract: 'Never resolve the debt in this chapter. Teodor never appears on the page.',
    existingEntitiesJson: entities,
    spineContext: 'Chapter 2 turns on Mira accepting a debt that was never hers.',
    completedScenes: [],
    characters: bible.characters
  })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  // --- Check the contract the pipeline actually depends on. ---
  const prose = result?.prose || ''
  const s = result?.structured || null
  const summary = s?.summary

  const checks = [
    ['returned prose', prose.trim().length > 0],
    ['prose is not raw JSON (parse succeeded)', !prose.trim().startsWith('{')],
    ['structured output parsed', !!s],
    ['summary field present', typeof summary === 'string' && summary.trim().length > 0],
    ['summary is one line', typeof summary === 'string' && !summary.trim().includes('\n')],
    ['keyFacts present', Array.isArray(s?.keyFacts)],
    ['usedEntities present', !!s?.usedEntities]
  ]

  say(`RESULT  (${elapsed}s, ${prose.split(/\s+/).filter(Boolean).length} words)`)
  say('='.repeat(78))
  for (const [label, pass] of checks) say(`  ${ok(pass)} ${label}`)
  say()

  if (summary) {
    say(`  summary: "${summary}"`)
    say()
    say('  => The 27% call saving is REAL: computeSummary reuses this and never')
    say('     fires its own request.')
  } else {
    say('  !! No summary field. computeSummary will fall back to a separate LLM')
    say('     call per scene, exactly as before — the saving does NOT hold for')
    say('     this model. Consider a native structured-output schema.')
  }
  say()
  say('--- prose (first 400 chars) ---')
  say(prose.slice(0, 400).trim())
  say('---')
  say()

  const failed = checks.filter(([, p]) => !p).map(([l]) => l)
  if (failed.length) {
    say(`FAILED: ${failed.join('; ')}`)
  } else {
    say('All contract checks passed.')
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(
    resolve(REPORTS_DIR, 'smoke-writer.json'),
    JSON.stringify(
      {
        generatedBy: 'smoke-writer',
        ollamaVersion: version,
        model,
        elapsedSeconds: Number(elapsed),
        numCtxRequested: DEFAULT_NUM_CTX,
        checks: Object.fromEntries(checks),
        summary: summary ?? null,
        wordCount: prose.split(/\s+/).filter(Boolean).length,
        prose
      },
      null,
      2
    )
  )
  say('Wrote reports/smoke-writer.json')
  process.exitCode = failed.length ? 1 : 0
}

main().catch((e) => {
  say()
  say(`SMOKE TEST FAILED: ${e.message}`)
  if (e.cause) say(`  cause: ${e.cause.message || e.cause}`)
  say()
  say(`Is Ollama running?  curl ${ENDPOINT}/api/tags`)
  process.exitCode = 1
})
