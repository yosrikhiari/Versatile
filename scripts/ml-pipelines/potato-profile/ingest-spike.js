/**
 * INGESTION SPIKE — de-risks the "what-if" feature's riskiest unknown:
 * how good is the auto-built bible + fact ledger when the EXISTING extractors
 * are pointed at a real, foreign (not Versatile-generated) novel?
 *
 * Drives the REAL extraction functions against a REAL local model:
 *   - useEntityExtractor().extractPotentialEntities   (heuristic, no LLM)
 *   - the real SCENE_METADATA prompt via real aiGenerateJson (Ollama grammar)
 *   - extractAllFacts (factLedger.js)                  (LLM fact ledger)
 *   - detectContradictions (contradictionDetector.js)  (baseline + divergence)
 *
 * Text: "The Gift of the Magi" (O. Henry, 1905, public domain via Gutenberg).
 * Chosen for a tight causal spine — Della sells her hair to buy Jim a watch
 * chain; Jim sells his watch to buy Della combs — perfect for a divergence test.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/ingest-spike.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/ingest-spike.js --model qwen3:8b
 */

import 'fake-indexeddb/auto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')
const TEXT_PATH = arg(
  'text',
  'C:/Users/yosri/AppData/Local/Temp/claude/D--Versatile-Versatile/630cb763-de95-4519-bc7b-65822bc1c320/scratchpad/magi.txt'
)

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ENDPOINT = arg('endpoint', process.env.OLLAMA_HOST || 'http://localhost:11434')
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
  // Prefer a non-thinking 7B for extraction (fast, and the pipeline's target class).
  return explicit || usable.find((n) => /dolphin|mistral/i.test(n)) || usable[0]
}

// --- Gutenberg cleanup ---
function cleanGutenberg(raw) {
  const s = raw.indexOf('*** START')
  const e = raw.indexOf('*** END')
  let body = s !== -1 && e !== -1 ? raw.slice(raw.indexOf('\n', s) + 1, e) : raw
  return body.replace(/\r/g, '').trim()
}

// --- NET-NEW: boundary detection (the piece that does not exist today) ---
// Detects chapter headings and scene-break glyphs; falls back to size-based
// chunking at paragraph boundaries when a text (like this one) has neither.
const CHAPTER_RE = /^\s*(chapter\s+[\divxlc]+\b.*|[IVXLC]{1,6}\.?|\d{1,3}\.?)\s*$/i
const SCENE_GLYPH_RE = /^\s*([*#—–\-]\s?){1,7}\s*$/

function splitIntoScenes(text, targetWords = 550) {
  const lines = text.split('\n')
  // 1) chapter headings
  const chapterIdx = lines
    .map((l, i) => (CHAPTER_RE.test(l.trim()) && l.trim().length < 40 ? i : -1))
    .filter((i) => i !== -1)
  // 2) scene glyphs
  const glyphIdx = lines.map((l, i) => (SCENE_GLYPH_RE.test(l) ? i : -1)).filter((i) => i !== -1)

  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const scenes = []
  if (glyphIdx.length > 0) {
    // split on glyphs — reconstruct from raw text between glyph lines
    let buf = []
    for (const l of lines) {
      if (SCENE_GLYPH_RE.test(l)) {
        if (buf.join(' ').trim()) scenes.push(buf.join('\n').trim())
        buf = []
      } else buf.push(l)
    }
    if (buf.join(' ').trim()) scenes.push(buf.join('\n').trim())
  } else {
    // size-based fallback at paragraph boundaries
    let buf = []
    let wc = 0
    for (const p of paras) {
      buf.push(p)
      wc += p.split(/\s+/).length
      if (wc >= targetWords) {
        scenes.push(buf.join('\n\n'))
        buf = []
        wc = 0
      }
    }
    if (buf.length) scenes.push(buf.join('\n\n'))
  }
  return {
    detected: chapterIdx.length ? 'chapter-headings' : glyphIdx.length ? 'scene-glyphs' : 'size-fallback',
    chapterCount: chapterIdx.length,
    scenes: scenes.map((content, i) => ({
      id: `scene-${i + 1}`,
      sceneNumber: i + 1,
      title: `Scene ${i + 1}`,
      content
    }))
  }
}

// Copy of the real SCENE_METADATA_SCHEMA + prompt from useStoryWriter.js
// (extractSceneMetadata is module-private; the schema/prompt are exercised
//  verbatim through the same real aiGenerateJson path.)
const SCENE_METADATA_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    usedEntities: {
      type: 'object',
      properties: {
        characterNames: { type: 'array', items: { type: 'string' } },
        locationNames: { type: 'array', items: { type: 'string' } },
        plotThreadTitles: { type: 'array', items: { type: 'string' } }
      }
    },
    newEntities: {
      type: 'object',
      properties: {
        characters: { type: 'array', items: { type: 'object' } },
        locations: { type: 'array', items: { type: 'object' } },
        plotThreads: { type: 'array', items: { type: 'object' } }
      }
    },
    networkEvents: { type: 'array', items: { type: 'object' } },
    keyFacts: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary']
}

function metadataPrompt(excerpt, entityContext) {
  return `Read this scene and extract structured metadata about it. Do not rewrite or summarize the prose beyond the one-sentence summary field.

${entityContext ? `KNOWN ENTITIES (already established — classify references to these as "used", anything genuinely new as "new"):\n${entityContext}\n\n` : ''}SCENE:
${excerpt}

Extract:
- summary: exactly one concise sentence describing what happens, for the chapter log.
- usedEntities: names of already-known characters/locations/plotThreads that appear.
- newEntities: characters/locations/plotThreads introduced here that were not already known.
- networkEvents: relationship changes, e.g. { "type": "relationship", "from": "A", "to": "B", "label": "arrives at" }.
- keyFacts: 0-4 short statements of durable canon this scene establishes (who is now injured/dead/changed, who learned what, time elapsed). [] if nothing durable changed.`
}

async function main() {
  say('INGESTION SPIKE — real extractors, real model, foreign novel')
  say('='.repeat(78))
  const model = await pickModel()
  let version = '?'
  try {
    version = (await (await fetch(`${ENDPOINT}/api/version`)).json()).version
  } catch {}
  say(`endpoint: ${ENDPOINT}`)
  say(`ollama:   ${version}`)
  say(`model:    ${model}`)
  say()

  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSettingsStore } = await import('../../../src/stores/settingsStore.js')
  const settings = useSettingsStore()
  settings.ollamaModel = model
  settings.aiProvider = 'ollama'
  settings.aiProviderFallback = 'none'

  const { aiGenerateJson } = await import('../../../src/composables/useAiService.js')
  const { FEATURES } = await import('../../../src/config/ai.ts')
  const { useEntityExtractor } = await import('../../../src/composables/useEntityExtractor.js')
  const { extractAllFacts } = await import('../../../src/composables/betareader/factLedger.js')
  const { detectContradictions } = await import(
    '../../../src/composables/betareader/contradictionDetector.js'
  )

  const aiOptions = { feature: FEATURES.STORY_GENERATION, temperature: 0.2, maxTokens: 1500, numCtx: 8192 }

  // ---------- STAGE 0: ingest + boundary detection ----------
  const raw = readFileSync(TEXT_PATH, 'utf8')
  const text = cleanGutenberg(raw)
  const totalWords = text.split(/\s+/).length
  const { detected, chapterCount, scenes } = splitIntoScenes(text)
  say(`STAGE 0 — Boundary detection`)
  say(`  text: ${totalWords} words`)
  say(`  strategy: ${detected}  (chapters detected: ${chapterCount})`)
  say(`  scenes: ${scenes.length}`)
  scenes.forEach((s) =>
    say(`    ${s.id}: ${s.content.split(/\s+/).length} words  "${s.content.slice(0, 60).replace(/\n/g, ' ')}…"`)
  )
  // sanity: prove chapter detection works when markers DO exist
  const synthetic = splitIntoScenes('CHAPTER I\n\nHe woke.\n\nCHAPTER II\n\nShe left.')
  say(`  [chapter-detector self-test on synthetic text → strategy=${synthetic.detected}, chapters=${synthetic.chapterCount}]`)
  say()

  // ---------- STAGE 1: heuristic entity extraction (no LLM) ----------
  const { extractPotentialEntities } = useEntityExtractor()
  const heur = extractPotentialEntities(text)
  say(`STAGE 1 — Heuristic entity extractor (regex, no LLM)`)
  say(`  characters (${heur.characters.length}): ${heur.characters.join(', ') || '(none)'}`)
  say(`  locations  (${heur.locations.length}): ${heur.locations.join(', ') || '(none)'}`)
  say()

  // ---------- STAGE 2: LLM scene metadata (real prompt + schema) ----------
  say(`STAGE 2 — LLM scene-metadata extraction (per scene)…`)
  const bible = { characters: new Set(), locations: new Set(), plotThreads: new Set() }
  const metaResults = []
  for (const s of scenes) {
    const t0 = Date.now()
    let meta = null
    try {
      meta = await aiGenerateJson(
        metadataPrompt(s.content.slice(0, 6000)),
        'You extract structured metadata from prose. Respond only with the requested JSON.',
        { ...aiOptions, maxTokens: 2500, schema: SCENE_METADATA_SCHEMA, schemaName: 'scene_metadata' }
      )
    } catch (e) {
      say(`  ${s.id}: EXTRACTION FAILED — ${e.message}`)
    }
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    const uc = meta?.usedEntities?.characterNames || []
    const nc = (meta?.newEntities?.characters || []).map((c) => c.name || c.title || JSON.stringify(c))
    ;[...uc, ...nc].forEach((n) => n && bible.characters.add(String(n)))
    ;[...(meta?.usedEntities?.locationNames || []), ...(meta?.newEntities?.locations || []).map((l) => l.name || JSON.stringify(l))].forEach(
      (n) => n && bible.locations.add(String(n))
    )
    ;[...(meta?.usedEntities?.plotThreadTitles || []), ...(meta?.newEntities?.plotThreads || []).map((p) => p.title || p.name || JSON.stringify(p))].forEach(
      (n) => n && bible.plotThreads.add(String(n))
    )
    metaResults.push({ scene: s.id, seconds: Number(dt), meta })
    say(`  ${s.id} (${dt}s): "${meta?.summary || '(no summary)'}"`)
    say(`     chars: [${[...uc, ...nc].join(', ')}]  keyFacts: ${(meta?.keyFacts || []).length}`)
  }
  say()
  say(`  → Auto-built bible:`)
  say(`     characters (${bible.characters.size}): ${[...bible.characters].join(', ')}`)
  say(`     locations  (${bible.locations.size}): ${[...bible.locations].join(', ')}`)
  say(`     plotThreads(${bible.plotThreads.size}): ${[...bible.plotThreads].join(' | ')}`)
  say()

  // ---------- STAGE 3: fact ledger (real extractAllFacts) ----------
  say(`STAGE 3 — Fact ledger (extractAllFacts)…`)
  const t3 = Date.now()
  const ledgers = await extractAllFacts(scenes, aiOptions)
  say(`  (${((Date.now() - t3) / 1000).toFixed(1)}s for ${scenes.length} scenes)`)
  for (const l of ledgers) {
    say(`  ${l.sceneTitle}: chars=[${l.facts.characters.join(', ')}] objects=[${l.facts.objects.join(', ')}]`)
    say(`     events: ${l.facts.events.slice(0, 3).join(' | ')}`)
  }
  say()

  // ---------- STAGE 4: baseline + DIVERGENCE contradiction detection ----------
  say(`STAGE 4 — Contradiction detection (concept test for propagation trigger)`)
  const baseline = await detectContradictions(ledgers, scenes, aiOptions)
  say(`  baseline (unaltered story): ${baseline.length} contradiction(s) — expect ~0 in a consistent text`)
  baseline.forEach((c) => say(`     - [${c.category}] ${c.title}`))

  // Seed a divergence: pretend the scene where Della sells her hair was changed
  // so she KEEPS her hair (never sells it → never buys the chain). The Jim reveal
  // (he sold his watch to buy her combs for that hair) should now be a downstream
  // contradiction. Does an LLM-over-ledger detector catch the ripple?
  const divergedLedgers = ledgers.map((l) => ({ ...l, facts: { ...l.facts } }))
  // Find the ledger that mentions selling hair, overwrite its events.
  const hairIdx = divergedLedgers.findIndex((l) =>
    (l.facts.events.join(' ') + l.facts.objects.join(' ')).toLowerCase().includes('hair')
  )
  if (hairIdx !== -1) {
    divergedLedgers[hairIdx] = {
      ...divergedLedgers[hairIdx],
      facts: {
        ...divergedLedgers[hairIdx].facts,
        events: [
          'Della decides she CANNOT bear to sell her beautiful hair',
          'Della keeps her long hair and has no money to buy Jim a present'
        ],
        objects: divergedLedgers[hairIdx].facts.objects.filter((o) => !/chain|fob/i.test(o))
      }
    }
    say(`  seeded divergence at ${divergedLedgers[hairIdx].sceneTitle}: "Della keeps her hair, buys no chain"`)
    const rippled = await detectContradictions(divergedLedgers, scenes, aiOptions)
    say(`  after divergence: ${rippled.length} contradiction(s) — does it flag the downstream Jim/combs reveal?`)
    rippled.forEach((c) =>
      say(`     - [${c.category}] ${c.title}  (scenes: ${c.betweenScenes.join(', ')})`)
    )
  } else {
    say(`  (could not locate a 'hair' scene in the ledger to seed divergence)`)
  }
  say()

  // ---------- SCORING vs known ground truth ----------
  const allChars = [...bible.characters, ...ledgers.flatMap((l) => l.facts.characters)].map((s) => s.toLowerCase())
  const allObjs = ledgers.flatMap((l) => l.facts.objects).map((s) => s.toLowerCase())
  const has = (arr, kw) => arr.some((x) => x.includes(kw))
  const groundTruth = [
    ['Della (protagonist)', has(allChars, 'della')],
    ['Jim (husband)', has(allChars, 'jim') || has(allChars, 'james')],
    ["hair (Della's sacrifice)", has(allObjs, 'hair')],
    ["watch (Jim's sacrifice)", has(allObjs, 'watch')],
    ['the combs (gift)', has(allObjs, 'comb')],
    ['the chain/fob (gift)', has(allObjs, 'chain') || has(allObjs, 'fob')]
  ]
  say(`GROUND-TRUTH RECALL (did ingestion capture the story's causal spine?)`)
  say('='.repeat(78))
  for (const [label, hit] of groundTruth) say(`  ${ok(hit)} ${label}`)
  const recall = groundTruth.filter(([, h]) => h).length / groundTruth.length
  say(`  recall: ${(recall * 100).toFixed(0)}%`)
  say()

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(
    resolve(REPORTS_DIR, 'ingest-spike.json'),
    JSON.stringify(
      { model, version, boundary: { detected, chapterCount, sceneCount: scenes.length }, heuristic: heur, bible: { characters: [...bible.characters], locations: [...bible.locations], plotThreads: [...bible.plotThreads] }, ledgers, metaResults, groundTruthRecall: recall },
      null,
      2
    )
  )
  say('Wrote reports/ingest-spike.json')
}

main().catch((e) => {
  say()
  say(`SPIKE FAILED: ${e.message}`)
  if (e.cause) say(`  cause: ${e.cause.message || e.cause}`)
  say(`Is Ollama running?  curl ${ENDPOINT}/api/tags`)
  process.exitCode = 1
})
