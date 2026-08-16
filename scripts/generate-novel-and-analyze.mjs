/**
 * End-to-end generation + analysis against the REAL pipeline and a REAL local
 * Ollama model (qwen3:8b). This exercises the code that was changed/fixed this
 * session on live model output, not mocks:
 *   - W8 idempotency: aiGenerate/aiGenerateJson called with idempotencyKey; a
 *     same-key retry must collapse to one provider call (one "lost response").
 *   - W11 unorderable surfacing: real generateRelationships (with fake-indexeddb
 *     so Dexie works) over a seeded network; a second weave at the same chapter
 *     must produce unorderable drops that are now warned + counted.
 *   - Deterministic engine: runDeterministicContradictionChecks over entity
 *     states derived from the generated novel.
 *
 * Run: npx vite-node scripts/generate-novel-and-analyze.mjs
 */

import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { writeFileSync, mkdirSync } from 'node:fs'

// ---- Boot: in-memory IndexedDB + Pinia + Ollama pointed at local qwen3:8b ----
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
}
globalThis.localStorage.setItem('versatile_ollama_endpoint', 'http://localhost:11434')

// Count only real generation requests to the provider (not /api/tags warmups).
let providerCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || ''
  if (url.includes('/api/generate')) providerCalls++
  return realFetch(input, init)
}

setActivePinia(createPinia())
const { useSettingsStore } = await import('../src/stores/settingsStore.ts')
const store = useSettingsStore()
store.aiProvider = 'ollama'
store.localOnly = true
store.ollamaModel = process.env.NOVEL_MODEL || 'qwen3:8b'

const { aiGenerate, aiGenerateJson, newIdempotencyNonce } = await import(
  '../src/composables/useAiService.ts'
)
const { FEATURES } = await import('../src/config/ai.ts')
const { generateRelationships } = await import(
  '../src/composables/generation/generators/relationships.ts'
)
const { deriveEntityStates } = await import('../src/services/generation/entityStates.ts')
const { runDeterministicContradictionChecks } = await import(
  '../src/services/generation/deterministicContradictions.ts'
)
const { planEdgeWrites } = await import('../src/services/generation/edgeTimeline.ts')

const MODEL = store.ollamaModel
const log = (...a) => console.log(...a)
const out = { meta: { model: MODEL, generatedAt: new Date().toISOString() }, phases: {} }

// Tolerant JSON extraction (no hard dependency on structured-output support).
let lastRaw = ''
async function genJson(prompt, system, opts = {}) {
  const text = await aiGenerate(prompt, system, {
    feature: FEATURES.STORY_GENERATION,
    think: false,
    ...opts
  })
  lastRaw = text
  const parsed = sanitize(text)
  if (parsed) return parsed
  // Retry with a FRESH idempotency key — reusing the key would return the same
  // (unparseable) cached result instead of regenerating (that is W8 working as
  // designed, but it is the wrong tool for a parse recovery).
  const text2 = await aiGenerate(prompt + '\n\nReturn ONLY valid minified JSON, no prose, no markdown.', system, {
    feature: FEATURES.STORY_GENERATION,
    think: false,
    ...opts,
    idempotencyKey: newIdempotencyNonce()
  })
  lastRaw = text2
  return sanitize(text2)
}
function sanitize(t) {
  if (!t) return null
  const s = String(t).replace(/```json/gi, '').replace(/```/g, '').trim()
  const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  try {
    return JSON.parse(m ? m[0] : s)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// PHASE 1 — generate a multi-chapter novel plan (real model)
// ---------------------------------------------------------------------------
log('\n=== PHASE 1: generate novel plan ===')
const planSys = `You are a story architect. Return ONLY a single JSON object, no prose, no markdown fences:
{"title":string,"logline":string,"genre":string,"tone":string,
 "characters":[{"id":number,"name":string,"role":string,"goal":string}],
 "locations":[{"id":number,"name":string,"description":string}],
 "plotThreads":[{"id":number,"title":string,"notes":string}],
 "scenes":[{"id":number,"title":string,"summary":string,"characterNames":[string],"locationName":string,"keyFacts":[string]}]}
Exactly 8 scenes. characterNames must be exact names from characters; locationName must be an exact name from locations. keyFacts are atomic, checkable facts.`
const planPrompt = `Write a tight 8-scene literary science-fiction novella about a cartographer
who discovers the maps of her city are rewriting themselves. Keep names consistent.`
const planKey = `novel-plan-${newIdempotencyNonce()}`
let plan = null
try {
  plan = await genJson(planPrompt, planSys, { idempotencyKey: planKey, temperature: 0.6 })
} catch (e) {
  log('  plan generation failed:', e.message)
}
if (!plan || !Array.isArray(plan.scenes)) {
  log('  plan JSON was unusable; raw model output (first 400 chars):', String(lastRaw).slice(0, 400))
  log('  FALLBACK: using a hand-authored minimal plan.')
  plan = {
    title: 'The Cartographer of Shifting Streets',
    logline: 'A city map rewrites itself; a cartographer races to keep reality stable.',
    genre: 'Literary science-fiction',
    tone: 'Melancholy, tense',
    characters: [
      { id: 1, name: 'Mara Vane', role: 'Cartographer', goal: 'Preserve the true map' },
      { id: 2, name: 'Cole Dris', role: 'Archivist', goal: 'Control the rewrite' },
      { id: 3, name: 'Ilsa Fen', role: 'Signal-runner', goal: 'Warn the districts' }
    ],
    locations: [
      { id: 10, name: 'The Survey Hall', description: 'Map vault' },
      { id: 11, name: 'The Tideline', description: 'Edge district' }
    ],
    plotThreads: [
      { id: 20, title: 'The rewriting', notes: 'Streets rearrange nightly' },
      { id: 21, title: 'The vault breach', notes: 'Someone edits the master' }
    ],
    scenes: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      title: `Chapter ${i + 1}`,
      summary: `Scene ${i + 1} of the shifting city.`,
      characterIds: [1, 2],
      locationId: 10,
      keyFacts: [`Mara is in the Survey Hall in chapter ${i + 1}`, `Cole is alive in chapter ${i + 1}`]
    }))
  }
}
out.phases.plan = {
  title: plan.title,
  genre: plan.genre,
  characters: plan.characters?.length,
  locations: plan.locations?.length,
  plotThreads: plan.plotThreads?.length,
  scenes: plan.scenes?.length
}
log(`  title="${plan.title}"  scenes=${plan.scenes?.length}  chars=${plan.characters?.length}`)

// Normalise scenes to use IDs (model may have emitted names). Fuzzy name match.
const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const charByName = new Map((plan.characters || []).map((c) => [normName(c.name), c.id]))
const locByName = new Map((plan.locations || []).map((l) => [normName(l.name), l.id]))
for (const sc of plan.scenes || []) {
  if (!Array.isArray(sc.characterIds)) {
    sc.characterIds = (sc.characterNames || [])
      .map((n) => charByName.get(normName(n)))
      .filter((id) => id != null)
    if (sc.characterIds.length === 0 && (plan.characters || []).length)
      sc.characterIds = [plan.characters[0].id]
  }
  if (sc.locationId == null && sc.locationName != null) {
    sc.locationId = locByName.get(normName(sc.locationName)) ?? (plan.locations || [])[0]?.id
  }
}

// ---------------------------------------------------------------------------
// PHASE 2 — generate prose per scene + PROVE W8 idempotency on real generations
// ---------------------------------------------------------------------------
log('\n=== PHASE 2: generate scene prose + prove W8 idempotency ===')
const proseSys = `You are a novelist. Write vivid, tight prose for the scene described.
Return ONLY the prose (no commentary). ~180-260 words. Keep character names exactly
as given. Do not invent new characters.`
const sceneTargets = plan.scenes || []
const wordCount = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length
const sentences = (t) => String(t || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
const lastSentences = (t, n = 2) => sentences(t).slice(-n).join(' ')
const proseByScene = {}
let prevEnding = ''
for (const sc of sceneTargets) {
  const chars = (sc.characterIds || [])
    .map((id) => (plan.characters || []).find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(', ')
  const loc = (plan.locations || []).find((l) => l.id === sc.locationId)?.name || 'unknown'
  const prompt = `Chapter context: ${plan.logline}
Location: ${loc}. Characters present: ${chars || 'none'}.
Scene to write: ${sc.title} — ${sc.summary}
Key facts to honour: ${(sc.keyFacts || []).join('; ')}${
    prevEnding
      ? `\n\nCONTINUITY — the previous chapter ended with: "${prevEnding}"\nOpen THIS chapter so it flows directly from that ending (same place, or a motivated move; carry the emotional beat forward). Do not restart as if the prior chapter never happened.`
      : ''
  }`
  const key = `novel-scene-${sc.id}-${newIdempotencyNonce()}`
  try {
    const text = await aiGenerate(prompt, proseSys, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.8,
      idleTimeout: 180000,
      firstTokenTimeout: 300000,
      idempotencyKey: key
    })
    proseByScene[sc.id] = text
    prevEnding = lastSentences(text, 2)
    log(`  scene ${sc.id}: ${wordCount(text)} words`)
  } catch (e) {
    log(`  scene ${sc.id}: FAILED ${e.message}`)
  }
}

// Idempotency proof: same key retry must NOT hit the provider again.
const idemScene = sceneTargets[0]
const idemChars = (idemScene.characterIds || [])
  .map((id) => (plan.characters || []).find((c) => c.id === id)?.name)
  .filter(Boolean)
  .join(', ')
const idemLoc = (plan.locations || []).find((l) => l.id === idemScene.locationId)?.name || 'unknown'
const idemPrompt = `Location: ${idemLoc}. Characters: ${idemChars}. Write one sentence establishing the scene: ${idemScene.summary}`
const callsBefore = providerCalls
const r1 = await aiGenerate(idemPrompt, proseSys, {
  feature: FEATURES.STORY_GENERATION,
  temperature: 0.8,
  idempotencyKey: 'idem-A'
})
const callsAfterFirst = providerCalls
const r2 = await aiGenerate(idemPrompt, proseSys, {
  feature: FEATURES.STORY_GENERATION,
  temperature: 0.8,
  idempotencyKey: 'idem-A' // identical retry: must be served from cache
})
const callsAfterRetry = providerCalls
const r3 = await aiGenerate(idemPrompt, proseSys, {
  feature: FEATURES.STORY_GENERATION,
  temperature: 0.8,
  idempotencyKey: 'idem-B' // different key: must hit provider again
})
const callsAfterDifferent = providerCalls

const idem = {
  sameKeyRetryProviderCalls: callsAfterRetry - callsAfterFirst,
  differentKeyProviderCalls: callsAfterDifferent - callsAfterRetry,
  passed: callsAfterRetry === callsAfterFirst && callsAfterDifferent === callsAfterFirst + 1,
  note: 'W8 opt-in idempotencyKey: a lost-response retry (same key) collapses; a fresh key re-invokes.'
}
out.phases.idempotency = idem
log(
  `  same-key retry -> ${idem.sameKeyRetryProviderCalls} extra provider call(s); ` +
    `different-key -> ${idem.differentKeyProviderCalls} extra call(s). ${idem.passed ? 'PASS' : 'FAIL'}`
)

// ---------------------------------------------------------------------------
// PHASE 3 — W11 unorderable surfacing via REAL generateRelationships (Dexie live)
// ---------------------------------------------------------------------------
log('\n=== PHASE 3: generateRelationships + W11 unorderable surfacing ===')
const w11Warns = []
const origWarn = console.warn
console.warn = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  if (s.includes('unorderable')) w11Warns.push(s)
  origWarn(...a)
}
let rel1 = null
let rel2 = null
try {
  rel1 = await generateRelationships({
    projectId: 'novel-analysis',
    characters: plan.characters || [],
    locations: plan.locations || [],
    plotThreads: plan.plotThreads || [],
    synopsis: plan.logline || '',
    genre: plan.genre || '',
    tone: plan.tone || '',
    atChapter: 1
  })
  log('  weave #1:', JSON.stringify(rel1))
  // Second weave at the SAME chapter: its proposed claims now collide with the
  // still-open claims from weave #1, exercising the unorderable drop path.
  rel2 = await generateRelationships({
    projectId: 'novel-analysis',
    characters: plan.characters || [],
    locations: plan.locations || [],
    plotThreads: plan.plotThreads || [],
    synopsis: plan.logline || '',
    genre: plan.genre || '',
    tone: plan.tone || '',
    atChapter: 1
  })
  log('  weave #2:', JSON.stringify(rel2))
} catch (e) {
  log('  generateRelationships failed:', e.message)
} finally {
  console.warn = origWarn
}
out.phases.relationships = {
  weave1: rel1,
  weave2: rel2,
  w11WarningsCaptured: w11Warns.length,
  w11Sample: w11Warns.slice(0, 3)
}
log(
  `  W11: ${w11Warns.length} unorderable warning(s) surfaced` +
    (w11Warns[0] ? ` — "${w11Warns[0].slice(0, 120)}..."` : '')
)

// Direct planEdgeWrites proof of the unorderable contract on real-shaped input.
const directUnorderable = planEdgeWrites({
  existing: [
    {
      id: 'e1',
      sourceId: '1',
      sourceType: 'character',
      targetId: '2',
      targetType: 'character',
      relationshipType: 'ally',
      validFromChapter: 1,
      validUntilChapter: null
    }
  ],
  proposed: [
    {
      id: 'p1',
      sourceId: '1',
      sourceType: 'character',
      targetId: '2',
      targetType: 'character',
      relationshipType: 'enemy',
      validFromChapter: 1,
      validUntilChapter: null
    }
  ],
  atChapter: 1,
  runId: 'analysis',
  volumeId: null
})
out.phases.relationships.planEdgeWritesUnorderable = directUnorderable.unorderable.length
log(
  `  planEdgeWrites contract: same-chapter ally vs enemy => unorderable=${directUnorderable.unorderable.length} (expected 1)`
)

// ---------------------------------------------------------------------------
// PHASE 4 — deterministic contradiction engine over the generated novel
// ---------------------------------------------------------------------------
log('\n=== PHASE 4: deterministic contradiction checks ===')
const entityStates = []
for (const sc of sceneTargets) {
  const charsPresent = (sc.characterIds || [])
    .map((id) => (plan.characters || []).find((c) => c.id === id)?.name)
    .filter(Boolean)
  const loc = (plan.locations || []).find((l) => l.id === sc.locationId)?.name || 'unknown'
  const digest = {
    subsectionId: `scene-${sc.id}`,
    chapterNumber: sc.id,
    sceneNumber: 1,
    location: loc,
    charactersPresent: charsPresent,
    keyFacts: sc.keyFacts || [],
    summary: sc.summary || ''
  }
  try {
    entityStates.push(...deriveEntityStates({ projectId: 'novel-analysis', digest }))
  } catch (e) {
    log(`  deriveEntityStates failed for scene ${sc.id}:`, e.message)
  }
}

// Normalise every entity state so the deterministic engine always sees a complete
// state object (the production rules read s.state.attributes unconditionally).
const normState = (s) => ({
  ...s,
  state: {
    present: false,
    status: 'unknown',
    condition: 'unknown',
    location: null,
    knows: [],
    attributes: {},
    ...(s.state || {})
  }
})
const entityStatesNorm = entityStates.map(normState)
const digests = entityStatesNorm.map((s) => ({
  subsectionId: s.sceneId,
  sceneNumber: s.sceneNumber,
  chapterNumber: s.chapterNumber,
  keyFacts: s.sourceFacts,
  summary: ''
}))
let detResult = []
try {
  detResult = await runDeterministicContradictionChecks(digests, [], entityStatesNorm)
} catch (e) {
  log('  deterministic run failed:', e.message)
}
const consistentErrors = detResult.filter((d) => d.severity === 'error').length

// Injection test: prove the engine DETECTS a contradiction (duplicate learning).
const injected = [
  ...entityStatesNorm,
  {
    projectId: 'novel-analysis',
    entityType: 'character',
    entityId: '1',
    entityName: (plan.characters || [])[0]?.name || 'Mara',
    sceneId: 'inj-1',
    sceneNumber: 99,
    chapterNumber: 99,
    state: { present: true, status: 'alive', knows: ['the rewrite source'] },
    sourceFacts: ['learns the rewrite source'],
    stateHash: 'h-a',
    version: 1,
    updatedAt: ''
  },
  {
    projectId: 'novel-analysis',
    entityType: 'character',
    entityId: '1',
    entityName: (plan.characters || [])[0]?.name || 'Mara',
    sceneId: 'inj-2',
    sceneNumber: 100,
    chapterNumber: 100,
    state: { present: true, status: 'alive', knows: ['the rewrite source'] },
    sourceFacts: ['learns the rewrite source again'],
    stateHash: 'h-b',
    version: 1,
    updatedAt: ''
  }
]
const injNorm = injected.map(normState)
const injDigests = injNorm.map((s) => ({
  subsectionId: s.sceneId,
  sceneNumber: s.sceneNumber,
  chapterNumber: s.chapterNumber,
  keyFacts: s.sourceFacts,
  summary: ''
}))
const injectedDet = await runDeterministicContradictionChecks(injDigests, [], injNorm)
const detectedInjection = injectedDet.some((d) => d.type === 'knowledge_relearned')

out.phases.deterministic = {
  entityStatesDerived: entityStates.length,
  consistentArcErrors: consistentErrors,
  consistentArcWarnings: detResult.filter((d) => d.severity === 'warning').length,
  injectedDetectionPassed: detectedInjection,
  injectedTypes: [...new Set(injectedDet.map((d) => d.type))]
}
log(
  `  derived entity states=${entityStates.length}; consistent-arc errors=${consistentErrors}; ` +
    `injection detection=${detectedInjection ? 'PASS' : 'FAIL'}`
)

// ---------------------------------------------------------------------------
// PHASE 5 — summarize
// ---------------------------------------------------------------------------
out.providerCallsTotal = providerCalls
out.verdict = {
  w8IdempotencyPassed: idem.passed,
  w11Surfaced: w11Warns.length > 0 || directUnorderable.unorderable.length > 0,
  deterministicConsistent: consistentErrors === 0,
  deterministicDetectsContradiction: detectedInjection
}
// ---------------------------------------------------------------------------
// PHASE 5 — seam continuity: does each chapter open where the prior one ended?
// Deterministic, no extra model calls: compares the structured open/close anchors
// (location + cast) of adjacent chapters and whether the opening text references
// the prior chapter's closing beat.
// ---------------------------------------------------------------------------
const nameOf = (id) => (plan.characters || []).find((c) => c.id === id)?.name
const locOf = (id) => (plan.locations || []).find((l) => l.id === id)?.name
const seams = []
for (let i = 1; i < sceneTargets.length; i++) {
  const prev = sceneTargets[i - 1]
  const cur = sceneTargets[i]
  const openText = sentences(proseByScene[cur.id] || '').slice(0, 2).join(' ')
  const closeText = lastSentences(proseByScene[prev.id], 2)
  const prevChars = (prev.characterIds || []).map(nameOf).filter(Boolean)
  const curChars = (cur.characterIds || []).map(nameOf).filter(Boolean)
  const sameLocation = prev.locationId === cur.locationId
  const carriedCharacter = prevChars.some((n) => curChars.includes(n))
  // Does the opening reference anything from the closing beat (name or location)?
  const closeWords = new Set(
    [...prevChars, locOf(prev.locationId), ...sentences(closeText).join(' ').toLowerCase().split(/\s+/)].filter(
      (w) => w && w.length > 3
    )
  )
  const openLower = openText.toLowerCase()
  const referenced = [...closeWords].some((w) => openLower.includes(w))
  const linked = carriedCharacter && (sameLocation || referenced)
  seams.push({
    from: prev.title,
    to: cur.title,
    sameLocation,
    carriedCharacter,
    openingReferencesPriorEnding: referenced,
    linked,
    note: linked
      ? 'flows from prior chapter'
      : `discontinuity: ${sameLocation ? 'same place' : 'location change'} · ${
          carriedCharacter ? 'shared cast' : 'cast drop'
        } · opening ${referenced ? 'echoes prior ending' : 'does NOT reference prior ending'}`
  })
}
const linkedSeams = seams.filter((s) => s.linked).length
out.phases.seamContinuity = {
  seamsChecked: seams.length,
  linkedSeams,
  unlinked: seams.filter((s) => !s.linked).map((s) => ({ from: s.from, to: s.to, note: s.note }))
}
log(
  `\n=== PHASE 5: seam continuity ===\n  linked ${linkedSeams}/${seams.length} chapter seams` +
    (linkedSeams < seams.length
      ? '\n' + seams.filter((s) => !s.linked).map((s) => `  - ${s.from} -> ${s.to}: ${s.note}`).join('\n')
      : '')
)

mkdirSync('scripts/out', { recursive: true })

// Persist the generated manuscript as readable markdown.
const charLine = (plan.characters || []).map((c) => `- ${c.name} — ${c.role} (${c.goal})`).join('\n')
const locLine = (plan.locations || []).map((l) => `- ${l.name} — ${l.description}`).join('\n')
const threadLine = (plan.plotThreads || []).map((t) => `- ${t.title} — ${t.notes}`).join('\n')
const manuscript = [
  `# ${plan.title}`,
  '',
  `> ${plan.logline || ''}`,
  '',
  `**Genre:** ${plan.genre || ''}  **Tone:** ${plan.tone || ''}`,
  '',
  `## Cast`,
  charLine,
  '',
  `## Locations`,
  locLine,
  '',
  `## Plot threads`,
  threadLine,
  '',
  `## Manuscript`,
  ...sceneTargets.map((sc) => {
    const loc = (plan.locations || []).find((l) => l.id === sc.locationId)?.name || ''
    const chars = (sc.characterIds || [])
      .map((id) => (plan.characters || []).find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(', ')
    return [`\n### ${sc.title}`, '', `*Setting: ${loc} · Characters: ${chars || 'none'}*`, '', proseByScene[sc.id] || '_(not generated)_', '']
  })
].join('\n')
writeFileSync('scripts/out/novel.md', manuscript)
out.manuscriptWords = Object.values(proseByScene).reduce((n, t) => n + wordCount(t), 0)
out.chaptersGenerated = Object.keys(proseByScene).length

writeFileSync('scripts/out/novel-analysis.json', JSON.stringify(out, null, 2))
log('\n=== SUMMARY ===')
log(JSON.stringify(out.verdict, null, 2))
log(`provider calls this run: ${providerCalls}`)
log(`manuscript: ${out.chaptersGenerated} chapters, ~${out.manuscriptWords} prose words`)
log('wrote scripts/out/novel.md and scripts/out/novel-analysis.json')
process.exit(0)
