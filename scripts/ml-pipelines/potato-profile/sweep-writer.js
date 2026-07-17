/**
 * Breadth sweep of the prose-first writer — several briefs x every pulled model.
 *
 * smoke-writer.js proved the two-call contract once, on one brief, on one model.
 * This answers whether it holds GENERALLY: different genres, a large cast, and
 * each generation model the user actually has. Runs are serial (one local model;
 * the transport semaphore enforces it anyway) and grouped by model so each set
 * of weights loads once.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/sweep-writer.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/sweep-writer.js --models phi4-mini:3.8b
 *   npx vite-node scripts/ml-pipelines/potato-profile/sweep-writer.js --words 250
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
const TARGET_WORDS = Number(arg('words', 300))

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

const BIBLE = {
  characters: [
    { name: 'Mira Vance', role: 'harbormaster', description: 'Weathered, terse, keeps the tide ledger.', traits: ['guarded'] },
    { name: 'Ilan Roth', role: 'debt collector', description: 'Polite in a way that reads as a threat.', traits: ['patient'] },
    { name: 'Sable Quist', role: 'smuggler captain', description: 'Runs the night boats; owes Mira a favor.', traits: ['loyal'] },
    { name: 'Father Bren', role: 'dock chaplain', description: 'Hears every rumor twice.', traits: ['talkative'] },
    { name: 'Odila Marsh', role: 'fishwife and fixer', description: 'Settles disputes the law will not touch.', traits: ['blunt'] }
  ],
  locations: [
    { name: 'The Tide Office', description: 'One room over the dock, a stove that never quite works.', notes: '', traits: [] },
    { name: 'The Long Pier', description: 'Half condemned, half working.', notes: '', traits: [] },
    { name: 'The Net Hall', description: 'Where the fleet drinks and argues.', notes: '', traits: [] }
  ],
  plotThreads: [
    { title: "Teodor's debt", status: 'open', notes: 'Ilan has come to collect from Mira.', traits: [] }
  ]
}

const BRIEFS = [
  {
    key: 'tense-two-hander',
    arc: { genre: 'literary crime', tone: 'cold, restrained', centralConflict: 'inherited debt' },
    brief: {
      sceneNumber: 4,
      title: 'The Ledger',
      emotionalGoal: 'Mira realises the debt is now hers',
      whatChanges: 'Ilan makes the claim explicit',
      charactersPresent: ['Mira Vance', 'Ilan Roth'],
      characterWants: { 'Mira Vance': 'to end the conversation', 'Ilan Roth': 'a signature' },
      setup: 'The tide ledger is open on the desk',
      payoff: 'Mira closes the ledger',
      sensoryAnchor: 'the stove ticking as it cools',
      tension: 'high',
      pacing: 'slow',
      arcPosition: 'rising',
      location: 'The Tide Office',
      estimatedWords: TARGET_WORDS
    }
  },
  {
    key: 'large-cast',
    arc: { genre: 'literary crime', tone: 'crowded, overheard', centralConflict: 'inherited debt' },
    brief: {
      sceneNumber: 7,
      title: 'The Net Hall Votes',
      emotionalGoal: 'The town decides whether to shelter Mira',
      whatChanges: 'Odila forces a show of hands',
      charactersPresent: ['Mira Vance', 'Sable Quist', 'Father Bren', 'Odila Marsh'],
      characterWants: {
        'Mira Vance': 'not to be discussed',
        'Odila Marsh': 'a decision tonight',
        'Father Bren': 'to be heard',
        'Sable Quist': 'to keep the night boats out of it'
      },
      setup: 'The whole fleet is in the Net Hall',
      payoff: 'The hands go up, but not for what Mira expected',
      sensoryAnchor: 'wet rope and lamp oil',
      tension: 'high',
      pacing: 'medium',
      arcPosition: 'midpoint',
      location: 'The Net Hall',
      estimatedWords: TARGET_WORDS
    }
  },
  {
    key: 'quiet-comedy',
    arc: { genre: 'gentle comedy', tone: 'warm, wry', centralConflict: 'a town that cannot mind its own business' },
    brief: {
      sceneNumber: 2,
      title: 'The Wrong Casserole',
      emotionalGoal: 'Father Bren tries to apologise without admitting anything',
      whatChanges: 'Odila figures out who really started the rumor',
      charactersPresent: ['Father Bren', 'Odila Marsh'],
      characterWants: {
        'Father Bren': 'absolution without confession',
        'Odila Marsh': 'entertainment'
      },
      setup: 'Bren has brought a casserole nobody asked for',
      payoff: 'Odila accepts the casserole and nothing else',
      sensoryAnchor: 'the casserole steaming between them',
      tension: 'low',
      pacing: 'medium',
      arcPosition: 'setup',
      location: 'The Long Pier',
      estimatedWords: TARGET_WORDS
    }
  }
]

async function unload(model) {
  try {
    await fetch(`${ENDPOINT}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0 })
    })
  } catch {
    // best effort
  }
  await new Promise((r) => setTimeout(r, 1500))
}

async function main() {
  say('WRITER SWEEP — prose-first contract across briefs x models')
  say('='.repeat(78))
  const version = (await (await fetch(`${ENDPOINT}/api/version`)).json()).version
  const { models = [] } = await (await fetch(`${ENDPOINT}/api/tags`)).json()
  const requested = arg('models', null)
  const sweepModels = requested
    ? requested.split(',')
    : models.map((m) => m.name).filter((n) => !/embed/i.test(n))
  say(`ollama:  ${version}`)
  say(`models:  ${sweepModels.join(', ')}`)
  say(`briefs:  ${BRIEFS.map((b) => b.key).join(', ')}`)
  say(`target:  ${TARGET_WORDS} words/scene`)
  say()

  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSettingsStore } = await import('../../../src/stores/settingsStore.js')
  const settings = useSettingsStore()
  settings.aiProvider = 'ollama'
  settings.aiProviderFallback = 'none'

  const { buildSceneEntitiesBlob } = await import(
    '../../../src/composables/generation/context/sceneContext.js'
  )
  const { useStoryWriter } = await import('../../../src/composables/useStoryWriter.js')
  const { writeSceneStructured } = useStoryWriter()

  const rows = []
  for (const model of sweepModels) {
    settings.ollamaModel = model
    for (const { key, brief, arc } of BRIEFS) {
      const entities = buildSceneEntitiesBlob(brief, BIBLE)
      const started = Date.now()
      let row
      try {
        const result = await writeSceneStructured({
          sceneBrief: brief,
          storyArc: arc,
          chapterLog: ['Scene 1 ("Arrival"): Ilan steps off the morning boat.'],
          storyBible: 'STORY CONTEXT\n\nA failing harbor town. Everyone knows everyone.',
          storyContract: 'Teodor never appears on the page.',
          existingEntitiesJson: entities,
          spineContext: '',
          completedScenes: [],
          characters: BIBLE.characters
        })
        const words = result.prose.split(/\s+/).filter(Boolean).length
        const s = result.structured || {}
        row = {
          model,
          brief: key,
          seconds: Math.round((Date.now() - started) / 1000),
          words,
          hitTarget: words >= TARGET_WORDS * 0.6,
          isJsonLeak: result.prose.trim().startsWith('{'),
          summary: typeof s.summary === 'string' && s.summary.trim().length > 0,
          keyFacts: Array.isArray(s.keyFacts),
          usedEntities: !!s.usedEntities,
          summaryText: s.summary || ''
        }
      } catch (e) {
        row = { model, brief: key, error: String(e.message || e).slice(0, 120) }
      }
      rows.push(row)
      const status = row.error
        ? `ERROR ${row.error}`
        : `${String(row.words).padStart(4)} words  ${row.seconds}s  summary:${row.summary ? 'y' : 'N'} facts:${row.keyFacts ? 'y' : 'N'}${row.isJsonLeak ? '  JSON-LEAK' : ''}`
      say(`  ${model.padEnd(20)} ${key.padEnd(18)} ${status}`)
    }
    await unload(model)
  }

  say()
  say('SUMMARY')
  say('='.repeat(78))
  const good = rows.filter((r) => !r.error && r.hitTarget && r.summary && !r.isJsonLeak)
  say(`  ${good.length}/${rows.length} runs produced full-length prose with metadata.`)
  const short = rows.filter((r) => !r.error && !r.hitTarget)
  if (short.length) {
    say(`  SHORT (<60% of target): ${short.map((r) => `${r.model}/${r.brief} (${r.words}w)`).join(', ')}`)
  }
  const noMeta = rows.filter((r) => !r.error && !r.summary)
  if (noMeta.length) {
    say(`  NO SUMMARY (falls back to extra call): ${noMeta.map((r) => `${r.model}/${r.brief}`).join(', ')}`)
  }
  const errors = rows.filter((r) => r.error)
  if (errors.length) {
    say(`  ERRORS: ${errors.map((r) => `${r.model}/${r.brief}`).join(', ')}`)
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(
    resolve(REPORTS_DIR, 'writer-sweep.json'),
    JSON.stringify({ generatedBy: 'sweep-writer', ollamaVersion: version, targetWords: TARGET_WORDS, rows }, null, 2)
  )
  say()
  say('Wrote reports/writer-sweep.json')
  process.exitCode = good.length === rows.length ? 0 : 1
}

main().catch((e) => {
  say(`SWEEP FAILED: ${e.message}`)
  process.exitCode = 1
})
