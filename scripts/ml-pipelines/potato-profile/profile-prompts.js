/**
 * Prompt-composition profiler.
 *
 * Answers one question with numbers instead of estimates: at what project size
 * does a writer prompt overflow the context window, and which block is to blame?
 *
 * This matters because Ollama defaults to a 4096 context on any machine with
 * <24 GiB VRAM, and the app used to never send `num_ctx` at all — so every
 * prompt over 4096 was at the mercy of whatever the server does on overflow
 * (truncate / context-shift / error — unverified, see PLAN-potato-pipeline.md).
 * Overflow is not an error the user ever sees. It is quality loss with no
 * signal. This script finds the cliff before a user falls off it.
 *
 * `num_ctx` is now sent explicitly (config/ollama.js DEFAULT_NUM_CTX), but the
 * cliff still matters: Ollama's honouring of a client-set num_ctx is contested
 * upstream (ollama#11964), so verify against /api/ps rather than assuming.
 *
 * Runs offline: no LLM, no network, no IndexedDB. It calls the real prompt
 * builders from src/ so the numbers track the code rather than a copy of it.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/profile-prompts.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/profile-prompts.js --json
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import { buildExistingEntitiesBlob } from '../../../src/composables/generation/context/sceneContext.js'
import { usePromptBuilder } from '../../../src/composables/usePromptBuilder.js'
import {
  CRAFT_RULES,
  PROSE_STYLE_GUIDE,
  FALLBACK_VOICE
} from '../../../src/composables/useStoryWriter.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')

/**
 * Context windows to test against.
 *
 * 2048/4096 are what a client gets when it does not set num_ctx (4096 for any
 * machine under 24 GiB VRAM, tiered since Ollama 0.15.5). They stay in the table
 * as the do-nothing baseline. 16384 is what we now request by default, subject
 * to the KV-cache RAM cost that `estimateKvCacheMb` below sketches.
 */
const CONTEXT_TIERS = [2048, 4096, 8192, 16384, 32768]

/**
 * Logical LLM calls per volume, traced from useVolumeStoryGenerator.
 *
 * Prompt size is the quality bug; call count is the time bug. On a local model
 * every one of these is seconds of wall clock, so the cheapest optimisation is
 * always the call you don't make.
 */
const VOLUME = { chapters: 10, scenesPerChapter: 3 }

function callBudget({ chapters, scenesPerChapter }) {
  const scenes = chapters * scenesPerChapter
  return {
    scenes,
    bootstrap: 1, // useEntityBootstrapper:171
    relationships: 1, // generators/relationships.js:238
    skeleton: Math.ceil(chapters / 12), // useStoryDirector SKELETON_BATCH_SIZE=12
    directorScenes: chapters, // one per chapter
    spine: chapters, // spine.js:95
    writer: scenes, // one per scene (clean pass)
    critic: scenes, // one per scene (autoMode gate)
    // Was one aiGenerate per scene, purely to summarize prose the writer had
    // just produced. Now a field on the writer's existing structured output.
    summaryBefore: scenes,
    summaryAfter: 0
  }
}

/**
 * Project scales, in (characters, locations, plotThreads).
 *
 * These are not arbitrary. A story bible starts small and grows monotonically
 * as the user develops the novel — which is the whole problem, since the entity
 * blob is uncapped and rides in EVERY writer and critic call.
 */
const SCALES = [
  { name: 'fresh', chars: 3, locs: 2, threads: 2, note: 'just started' },
  { name: 'small', chars: 8, locs: 4, threads: 3, note: 'a few chapters in' },
  { name: 'medium', chars: 20, locs: 10, threads: 8, note: 'a developed novel' },
  { name: 'large', chars: 45, locs: 25, threads: 15, note: 'an ensemble cast' },
  { name: 'epic', chars: 80, locs: 40, threads: 30, note: 'a series bible' }
]

/**
 * Field lengths for a *developed* entity — the state the bible trends toward,
 * not the stub a user first types. Keep these honest; the whole report scales
 * off them.
 */
const FIELD = { description: 420, notes: 240, role: 28, traits: 5, traitLen: 18 }

const lorem = (n, seed) => {
  // Deterministic filler so runs are comparable. Content is irrelevant; only
  // length reaches the tokenizer in any way that matters here.
  const words = [
    'weathered',
    'reluctant',
    'harbor',
    'ledger',
    'smoke',
    'quiet',
    'debt',
    'iron',
    'promise',
    'winter',
    'stranger',
    'coastline',
    'fracture',
    'vow'
  ]
  let out = ''
  let i = seed
  while (out.length < n) {
    out += words[i++ % words.length] + ' '
  }
  return out.slice(0, n).trim()
}

function makeBible({ chars, locs, threads }) {
  const characters = Array.from({ length: chars }, (_, i) => ({
    name: `Character ${i + 1}`,
    role: lorem(FIELD.role, i),
    description: lorem(FIELD.description, i + 1),
    traits: Array.from({ length: FIELD.traits }, (_, t) => lorem(FIELD.traitLen, i + t))
  }))
  const locations = Array.from({ length: locs }, (_, i) => ({
    name: `Location ${i + 1}`,
    description: lorem(FIELD.description, i + 2),
    notes: lorem(FIELD.notes, i + 3),
    traits: Array.from({ length: FIELD.traits }, (_, t) => lorem(FIELD.traitLen, i + t))
  }))
  const plotThreads = Array.from({ length: threads }, (_, i) => ({
    title: `Thread ${i + 1}`,
    status: 'open',
    notes: lorem(FIELD.notes, i + 4),
    traits: Array.from({ length: FIELD.traits }, (_, t) => lorem(FIELD.traitLen, i + t))
  }))
  return { characters, locations, plotThreads }
}

/**
 * The app's own token estimate, replicated exactly: `Math.ceil(len / 4)`.
 * Used in useStoryDocuments.js:32, documentChunker.js:304, spine.js:44.
 */
const appTokens = (s) => Math.ceil(s.length / 4)

/**
 * A closer estimate for pretty-printed JSON.
 *
 * chars/4 is tuned for English prose. Pretty-printed JSON tokenizes far worse:
 * every `{`, `"`, `:`, `,` and each run of indent whitespace tends to cost its
 * own token. Empirically BPE lands near ~2.6 chars/token on JSON of this shape
 * versus ~4.0 on prose. So the app's estimate UNDER-COUNTS the entity blob by
 * roughly 1.5x — the block that is already the largest and the only uncapped
 * one. Treat this as an estimate flagged for replacement by a real tokenizer.
 */
const jsonTokens = (s) => Math.ceil(s.length / 2.6)

/**
 * A typical scene's actual cast.
 *
 * The scene brief ALREADY carries `charactersPresent` (usePromptBuilder.js:14,
 * useStoryCritic.js:148, and 7 other sites) — so the pipeline knows exactly who
 * is in the scene, and then sends the entire bible anyway. These are the counts
 * a real scene touches, independent of how big the bible has grown.
 */
const SCENE_CAST = { chars: 3, locs: 1, threads: 2 }

/**
 * Mirrors what `buildSceneEntitiesBlob` (sceneContext.js) actually ships:
 *  - full detail for the scene's cast
 *  - name+role index for every other character
 *  - full detail for the scene's location, name-only index for the rest
 *  - plot threads NOT scoped (no per-scene thread link exists in the schema)
 */
function scopedBlob(bible) {
  const cast = bible.characters.slice(0, SCENE_CAST.chars)
  const elsewhere = bible.characters.slice(SCENE_CAST.chars)
  const hereLocs = bible.locations.slice(0, SCENE_CAST.locs)
  const otherLocs = bible.locations.slice(SCENE_CAST.locs)

  const payload = {
    charactersInScene: cast.map((c) => ({
      name: c.name,
      role: c.role,
      description: c.description,
      traits: c.traits || []
    })),
    plotThreads: bible.plotThreads.map((t) => ({
      title: t.title,
      status: t.status,
      notes: t.notes,
      traits: t.traits || []
    }))
  }
  if (elsewhere.length) {
    payload.otherCharacters = elsewhere.map((c) => ({ name: c.name, role: c.role }))
  }
  if (hereLocs.length) {
    payload.locationsInScene = hereLocs.map((l) => ({
      name: l.name,
      description: l.description,
      notes: l.notes,
      traits: l.traits || []
    }))
  }
  if (otherLocs.length) payload.otherLocations = otherLocs.map((l) => l.name)

  return JSON.stringify(payload)
}

/** Same data, no pretty-print indentation. `null, 2` costs tokens for nothing. */
function compact(characterList, locationList, plotThreadList) {
  return JSON.stringify({
    characters: characterList.map((c) => ({
      name: c.name,
      role: c.role,
      description: c.description,
      traits: c.traits || []
    })),
    locations: locationList.map((l) => ({
      name: l.name,
      description: l.description,
      notes: l.notes,
      traits: l.traits || []
    })),
    plotThreads: plotThreadList.map((t) => ({
      title: t.title,
      status: t.status,
      notes: t.notes,
      traits: t.traits || []
    }))
  })
}

function buildWriterPrompt(bible) {
  const { buildSystemPrompt } = usePromptBuilder()

  // Mirrors useStoryWriter.writeSceneStructured's assembly (:410-512).
  const system = buildSystemPrompt({
    categoryType: 'creative',
    voiceInstruction: FALLBACK_VOICE,
    antiPatterns: '',
    activeCraftRules: CRAFT_RULES,
    pastEvalResults: '',
    proseStyleGuide: PROSE_STYLE_GUIDE,
    focusInstructions: '',
    profileStyleGuide: '',
    voiceConstraint: ''
  })

  const entitiesBlob = buildExistingEntitiesBlob(
    bible.characters,
    bible.locations,
    bible.plotThreads
  )

  return { system, entitiesBlob }
}

/**
 * KV-cache cost, sketched. Real formula:
 *   bytes = num_ctx * n_layers * n_kv_heads * head_dim * 2 (K and V) * bytes_per_elem
 * GQA means n_kv_heads << n_heads, which is why modern 7-8B models are cheap here.
 *
 * VALIDATED against a real load on 2026-07-16 (see reports/ollama-probe.json):
 * phi4-mini:3.8b reports block_count=32, head_count_kv=8 via /api/show. This
 * formula predicts 128 KB/token; probe-ollama.js measured 131.8 KB/token going
 * from num_ctx 4096 -> 16384. The ~3% gap is allocator overhead. So the shape is
 * right — but the defaults below are that one model's, not a universal truth.
 *
 * Still prefer measurement: run probe-ollama.js, which reads the real block_count
 * and head_count_kv from /api/show and the real allocation from /api/ps, rather
 * than trusting these numbers for a model you have not measured.
 */
function estimateKvCacheMb(
  numCtx,
  { layers = 32, kvHeads = 8, headDim = 128, bytesPerElem = 2 } = {}
) {
  const bytes = numCtx * layers * kvHeads * headDim * 2 * bytesPerElem
  return bytes / (1024 * 1024)
}

function profile() {
  const rows = SCALES.map((scale) => {
    const bible = makeBible(scale)
    const { system, entitiesBlob } = buildWriterPrompt(bible)

    // Fixed blocks that ride along in every writer call regardless of scale.
    const fixed = {
      systemPrompt: system.length,
      craftRules: CRAFT_RULES.length,
      proseStyleGuide: PROSE_STYLE_GUIDE.length
    }

    // Blocks this profiler cannot reach without a live project (they need a
    // real spine, research corpus and prior scenes). Rather than pretend, we
    // bracket: FLOOR assumes they are empty (a brand-new project with no
    // research and no prior scenes), CEILING assumes every one is saturated to
    // the cap declared in code. Reality is somewhere between, and drifts toward
    // CEILING as the project matures.
    const declaredCaps = {
      spineContext: 3200, // spine.js:36-45 (tokenCap*4)
      storyBible: 8000, // useStoryDocuments.js:14 (2000 tok budget)
      embeddingContext: 1400, // sceneContext.js:6 EMBEDDING_CONTEXT_MAX_CHARS
      jsonInstructions: 1000 // useStoryWriter.js:491-512 (always present)
    }

    // jsonInstructions is unconditional; the rest are project-dependent.
    const floorCapped = declaredCaps.jsonInstructions
    const ceilCapped = Object.values(declaredCaps).reduce((a, b) => a + b, 0)

    const floorChars = fixed.systemPrompt + entitiesBlob.length + floorCapped
    const ceilChars = fixed.systemPrompt + entitiesBlob.length + ceilCapped

    // Prose blocks at chars/4; the entity blob at the JSON rate.
    const proseFloor = appTokens(system) + Math.ceil(floorCapped / 4)
    const proseCeil = appTokens(system) + Math.ceil(ceilCapped / 4)

    // --- The three candidate strategies, measured on identical data. ---
    // (a) today: full bible, pretty-printed
    const todayBlob = entitiesBlob
    // (b) cheap: full bible, compact JSON
    const compactBlob = compact(bible.characters, bible.locations, bible.plotThreads)
    // (c) shipped: what buildSceneEntitiesBlob actually sends
    const scoped = scopedBlob(bible)

    return {
      scale: scale.name,
      note: scale.note,
      entityCount: scale.chars + scale.locs + scale.threads,
      entityBlobChars: entitiesBlob.length,
      entityBlobTokens: jsonTokens(entitiesBlob),
      strategies: {
        today: { chars: todayBlob.length, tokens: jsonTokens(todayBlob) },
        compact: { chars: compactBlob.length, tokens: jsonTokens(compactBlob) },
        scoped: { chars: scoped.length, tokens: jsonTokens(scoped) }
      },
      // Whole-prompt floor with (c).
      scopedFloorTokens: appTokens(system) + Math.ceil(floorCapped / 4) + jsonTokens(scoped),
      fixedChars: fixed.systemPrompt,
      floorChars,
      ceilChars,
      // What the app believes (its own chars/4 over everything).
      appTokensFloor: appTokens(system) + Math.ceil(floorCapped / 4) + appTokens(entitiesBlob),
      appTokensCeil: appTokens(system) + Math.ceil(ceilCapped / 4) + appTokens(entitiesBlob),
      // What it likely actually costs.
      realTokensFloor: proseFloor + jsonTokens(entitiesBlob),
      realTokensCeil: proseCeil + jsonTokens(entitiesBlob),
      entityBlobShare: entitiesBlob.length / ceilChars
    }
  })

  return rows
}

function fmt(n) {
  return n.toLocaleString('en-US')
}

function report(rows) {
  const lines = []
  const push = (s = '') => lines.push(s)

  push('PROMPT COMPOSITION PROFILE — writer call, per project scale')
  push('='.repeat(78))
  push()
  push('Every row is ONE writer call. The critic call carries the same entity blob.')
  push('FLOOR = new project (no research/spine/prior scenes).')
  push('CEIL  = every project-dependent block saturated to its declared cap.')
  push()
  push(
    [
      'scale'.padEnd(8),
      'ents'.padStart(5),
      'blob'.padStart(9),
      'blobTok'.padStart(8),
      'floorTok'.padStart(9),
      'ceilTok'.padStart(8),
      'blob%'.padStart(6)
    ].join(' ')
  )
  push('-'.repeat(78))
  for (const r of rows) {
    push(
      [
        r.scale.padEnd(8),
        String(r.entityCount).padStart(5),
        fmt(r.entityBlobChars).padStart(9),
        fmt(r.entityBlobTokens).padStart(8),
        fmt(r.realTokensFloor).padStart(9),
        fmt(r.realTokensCeil).padStart(8),
        (Math.round(r.entityBlobShare * 100) + '%').padStart(6)
      ].join(' ')
    )
  }
  push()
  push('blobTok/floorTok/ceilTok count the entity JSON at ~2.6 chars/token.')
  push('The app itself would report these as:')
  for (const r of rows) {
    push(
      `  ${r.scale.padEnd(8)} floor ${fmt(r.appTokensFloor).padStart(6)}  ceil ${fmt(r.appTokensCeil).padStart(6)}   (chars/4 — UNDER-COUNTS by ~${((r.realTokensCeil / r.appTokensCeil - 1) * 100).toFixed(0)}%)`
    )
  }
  push()

  push('FIT AGAINST CONTEXT WINDOW  (✓ fits / ~ fits when small / ✗ SILENTLY TRUNCATED)')
  push('='.repeat(78))
  push()
  push(['scale'.padEnd(8), ...CONTEXT_TIERS.map((t) => String(t).padStart(7))].join(' '))
  push('-'.repeat(78))
  for (const r of rows) {
    const cells = CONTEXT_TIERS.map((t) => {
      // Leave headroom for the model's own output (num_predict ~2240 typical).
      const floorNeed = r.realTokensFloor + 2240
      const ceilNeed = r.realTokensCeil + 2240
      const mark = ceilNeed <= t ? '✓' : floorNeed <= t ? '~' : '✗'
      return mark.padStart(7)
    })
    push([r.scale.padEnd(8), ...cells].join(' '))
  }
  push()
  push('Includes ~2240 tokens of output headroom (useStoryWriter.js:516).')
  push('Today the app never sets num_ctx, so the live column is whatever the')
  push("model's Modelfile defaults to — commonly 4096, sometimes 2048.")
  push('A ✗ is not an error the user ever sees. It is prose quality quietly')
  push('degrading, because the truncated head of the prompt is the story bible.')
  push()

  push('ENTITY BLOB — THREE STRATEGIES, SAME DATA')
  push('='.repeat(78))
  push()
  push('(a) today  = full bible, JSON.stringify(..., null, 2)   [sceneContext.js:53]')
  push('(b) compact= full bible, no pretty-print indentation')
  push("(c) scoped = what buildSceneEntitiesBlob ships: full detail for the scene's")
  push('             cast (3 chars/1 loc), name+role index for everyone else,')
  push('             plot threads UNSCOPED (no per-scene thread link in the schema)')
  push()
  push(
    [
      'scale'.padEnd(8),
      '(a) today'.padStart(10),
      '(b) compact'.padStart(12),
      '(c) scoped'.padStart(11),
      'saving'.padStart(8)
    ].join(' ')
  )
  push('-'.repeat(78))
  for (const r of rows) {
    const s = r.strategies
    const saving = 1 - s.scoped.tokens / s.today.tokens
    push(
      [
        r.scale.padEnd(8),
        (fmt(s.today.tokens) + ' tok').padStart(10),
        (fmt(s.compact.tokens) + ' tok').padStart(12),
        (fmt(s.scoped.tokens) + ' tok').padStart(11),
        (Math.round(saving * 100) + '%').padStart(8)
      ].join(' ')
    )
  }
  push()
  push('Per call. Paid on the writer AND again on the critic.')
  push()
  push('Whole writer prompt (floor) if we adopt (c):')
  for (const r of rows) {
    push(
      `  ${r.scale.padEnd(8)} ${fmt(r.realTokensFloor).padStart(6)} tok  →  ${fmt(r.scopedFloorTokens).padStart(6)} tok   (fits 8192: ${r.scopedFloorTokens + 2240 <= 8192 ? 'YES' : 'no'})`
    )
  }
  push()

  push(`LLM CALLS PER VOLUME  (${VOLUME.chapters} chapters x ${VOLUME.scenesPerChapter} scenes)`)
  push('='.repeat(78))
  push()
  {
    const b = callBudget(VOLUME)
    const fixed = b.bootstrap + b.relationships + b.skeleton + b.directorScenes + b.spine
    const before = fixed + b.writer + b.critic + b.summaryBefore
    const after = fixed + b.writer + b.critic + b.summaryAfter
    const row = (label, n) => push(`  ${label.padEnd(34)} ${String(n).padStart(4)}`)
    row('entity bootstrap', b.bootstrap)
    row('relationships', b.relationships)
    row('director skeleton', b.skeleton)
    row('director scenes', b.directorScenes)
    row('spine', b.spine)
    row('writer (1/scene, clean pass)', b.writer)
    row('critic (1/scene, autoMode gate)', b.critic)
    push('-'.repeat(78))
    row('per-scene summary — BEFORE', b.summaryBefore)
    row('per-scene summary — AFTER', b.summaryAfter)
    push('-'.repeat(78))
    row('TOTAL before', before)
    row('TOTAL after', after)
    push()
    push(
      `  ${b.summaryBefore} calls removed = ${Math.round((1 - after / before) * 100)}% of the volume's logical calls,`
    )
    push(`  by moving one field into structured output the writer already emits.`)
    push()
    push('  Each was a ~3000-char prompt asking the model to summarize prose it')
    push('  had just written itself. Worst case is higher than shown: the writer')
    push('  and critic can each run twice (SCENE_MAX_ATTEMPTS=2), and every')
    push('  logical call is up to 3 retry attempts plus a fallback at transport.')
    push()
  }

  push('KV-CACHE RAM COST OF EACH TIER  (~7-8B GQA model, fp16 KV — ESTIMATE)')
  push('='.repeat(78))
  push()
  for (const t of CONTEXT_TIERS) {
    const mb = estimateKvCacheMb(t)
    push(`  num_ctx ${String(t).padStart(6)}  →  ${mb.toFixed(0).padStart(5)} MB KV cache`)
  }
  push()
  push('Shape only. Read real values from Ollama /api/show rather than hardcoding.')
  push()

  return lines.join('\n')
}

const rows = profile()
const text = report(rows)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedBy: 'profile-prompts', rows }, null, 2))
} else {
  console.log(text)
}

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
writeFileSync(resolve(REPORTS_DIR, 'potato-prompt-profile.txt'), text)
writeFileSync(
  resolve(REPORTS_DIR, 'potato-prompt-profile.json'),
  JSON.stringify({ generatedBy: 'profile-prompts', rows }, null, 2)
)
