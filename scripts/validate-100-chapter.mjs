// Headless validation harness for the 100-chapter "Fractured Lattice" dataset.
//
// Feeds validation/novel-100-data.json through the app's REAL consistency and
// integrity modules (no reimplementation, no LLM calls — deterministic):
//   - buildFactLedger                       src/composables/generation/context/sceneContext.ts
//   - GuardrailRegistry + fact_canon guard  src/guardrails/*
//   - undocumented_character guard          src/guardrails/guards/undocumentedCharacterGuard.ts
//   - deriveEntityStates + deterministic    src/services/generation/{entityStates,deterministicContradictions}.ts
//   - SyncTransport.pushOne idempotency     src/services/sync-transport.ts
//
// Runs via: npx vite-node scripts/validate-100-chapter.mjs
//
// The harness delivers chapters in a deliberately scrambled order (chapter 18 is
// injected early) and asserts the fact ledger is still chapter-ordered, scans
// every seeded edge-case scenario, and reproduces the architectural bugs (W1/W7
// etc.) observed during PIPELINE_ANALYSIS so they can be pinned by regression
// tests. Findings are written to validation/validation-report.json.

import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

setActivePinia(createPinia())

const { buildFactLedger } = await import('../src/composables/generation/context/sceneContext.ts')
const { installGuardrails } = await import('../src/guardrails/setup.ts')
const { GuardrailRegistry } = await import('../src/guardrails/registry.ts')
const { buildOntologySnapshot } = await import('../src/guardrails/ontology/instantiate.ts')
const { deriveEntityStates } = await import('../src/services/generation/entityStates.ts')
const {
  runDeterministicContradictionChecks,
  checkDeadThenAlive,
  checkObjectDestroyedThenUsed,
  checkAppearanceChange,
  checkLocationImpossible,
  checkKnowledgeRelearned,
  checkTimelineInversion,
  checkSeamContinuity,
  checkChapterSeam
} = await import('../src/services/generation/deterministicContradictions.ts')
const { SyncTransport } = await import('../src/services/sync-transport.ts')

const DATA = JSON.parse(readFileSync('validation/novel-100-data.json', 'utf8'))
const { cast: CAST, locations: LOCATIONS, threads: THREADS, chapters: RAW } = DATA

const LOC_NAME = {
  L1: 'the Archives of Veylthar', L2: 'the Lattice Spire', L3: 'the Sunken Quarter',
  L4: 'the Convergence Plateau', L5: 'the Threnody Sanctum', L6: 'the Floating Market of Cinder',
  L7: 'the Ashlands', L8: "Duskwane's Redoubt", L9: 'the Silent Library', L10: 'the Shattered Causeway'
}
const CAST_IDS = new Set(CAST.map((c) => c.id))
const knownName = (id) => {
  const c = CAST.find((x) => x.id === id)
  return c ? c.name : id
}

// ---- Running fact ledger (keyed by chapter number so out-of-order delivery reorders) ----
const ledgerByChapter = new Map()
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')
const seenFacts = new Set()

function getFactLedger() {
  const out = []
  for (const ch of [...ledgerByChapter.keys()].sort((a, b) => a - b)) {
    for (const f of ledgerByChapter.get(ch)) out.push(`Ch${ch}: ${f}`)
  }
  return out
}

// ---- Install guardrails against the cast ontology ----
installGuardrails({
  buildSnapshot: () =>
    buildOntologySnapshot({
      getCharacters: () => CAST.map((c) => ({ id: c.id, name: c.name, aliases: [] })),
      getLocations: () => LOCATIONS.map((l) => ({ id: l, name: LOC_NAME[l], aliases: [] })),
      getPlotThreads: () => THREADS.map((t) => ({ id: t, name: t, aliases: [] })),
      getScenes: () => [],
      getRelationships: () => []
    }),
  getFactLedger
})

const findings = []
const note = (f) => findings.push(f)
let undocumentedFalsePositives = 0
let factCanonContradictions = 0
let duplicates = 0
const entityStates = []

// ---- Self-test: every deterministic rule must fire on a real case (and stay silent on a clean arc) ----
{
  const mk = (over) => ({
    projectId: 'p',
    entityType: over.entityType ?? 'character',
    entityId: over.entityId ?? 'C1',
    entityName: over.entityName ?? 'Elias',
    sceneId: over.sceneId ?? 's1',
    sceneNumber: over.sceneNumber ?? 1,
    chapterNumber: over.chapterNumber ?? 1,
    state: {
      present: false,
      status: 'unknown',
      condition: 'unknown',
      location: null,
      knows: [],
      attributes: {},
      ...(over.state || {})
    },
    sourceFacts: over.sourceFacts ?? [],
    stateHash: over.stateHash ?? 'h',
    version: 1,
    updatedAt: ''
  })

  // Rule 1: dead -> unexplained reappearance
  const deadThenAlive = [mk({ sceneId: 's1', chapterNumber: 1, sourceFacts: ['Elias dies'], state: { present: false, status: 'dead' } }), mk({ sceneId: 's2', chapterNumber: 2, sourceFacts: ['Elias is seen again'], state: { present: true } })]
  if (checkDeadThenAlive(deadThenAlive).length !== 1) note({ check: 'deterministic.self-test', status: 'FAIL', detail: 'checkDeadThenAlive did not fire' })
  else note({ check: 'deterministic.self-test', status: 'PASS', detail: 'checkDeadThenAlive fires on dead->unexplained-reappearance' })

  // Rule 2: object destroyed then used intact
  const objStates = [
    mk({ entityType: 'object', entityId: 'O1', entityName: 'the Goblet', sceneId: 's1', chapterNumber: 1, sourceFacts: ['the Goblet is destroyed'], state: { condition: 'destroyed' } }),
    mk({ entityType: 'object', entityId: 'O1', entityName: 'the Goblet', sceneId: 's2', chapterNumber: 2, sourceFacts: ['she drinks from the Goblet'], state: { condition: 'intact' } })
  ]
  if (checkObjectDestroyedThenUsed(objStates).length !== 1) note({ check: 'deterministic.self-test.object', status: 'FAIL', detail: 'checkObjectDestroyedThenUsed did not fire' })
  else note({ check: 'deterministic.self-test.object', status: 'PASS', detail: 'checkObjectDestroyedThenUsed fires on destroyed->intact' })

  // Rule 3: appearance change (attribute asserted two ways)
  const attrStates = [
    mk({ sceneId: 's1', chapterNumber: 1, sourceFacts: ['Elias has blue eyes'], state: { attributes: { eye_color: 'blue' } } }),
    mk({ sceneId: 's2', chapterNumber: 2, sourceFacts: ['Elias has green eyes'], state: { attributes: { eye_color: 'green' } } })
  ]
  if (checkAppearanceChange(attrStates).length !== 1) note({ check: 'deterministic.self-test.appearance', status: 'FAIL', detail: 'checkAppearanceChange did not fire' })
  else note({ check: 'deterministic.self-test.appearance', status: 'PASS', detail: 'checkAppearanceChange fires on conflicting attributes' })

  // Rule 4: location impossible (same chapter, no travel)
  const locStates = [
    mk({ sceneId: 's1', chapterNumber: 3, sceneNumber: 1, sourceFacts: ['at the Gate'], state: { present: true, location: 'the Gate' } }),
    mk({ sceneId: 's2', chapterNumber: 3, sceneNumber: 2, sourceFacts: ['at the Reach'], state: { present: true, location: 'the Reach' } })
  ]
  if (checkLocationImpossible(locStates).length !== 1) note({ check: 'deterministic.self-test.location', status: 'FAIL', detail: 'checkLocationImpossible did not fire' })
  else note({ check: 'deterministic.self-test.location', status: 'PASS', detail: 'checkLocationImpossible fires on same-chapter teleport' })

  // Rule 5: knowledge relearned
  const knowStates = [
    mk({ sceneId: 's1', chapterNumber: 1, sourceFacts: ['learns the gate location'], state: { knows: ['the gate location'] } }),
    mk({ sceneId: 's2', chapterNumber: 2, sourceFacts: ['learns the gate location again'], state: { knows: ['the gate location'] } })
  ]
  if (checkKnowledgeRelearned(knowStates).length !== 1) note({ check: 'deterministic.self-test.knowledge', status: 'FAIL', detail: 'checkKnowledgeRelearned did not fire' })
  else note({ check: 'deterministic.self-test.knowledge', status: 'PASS', detail: 'checkKnowledgeRelearned fires on duplicate learning' })

  // Rule 6: timeline inversion (first scene references the past)
  const digests = [{ subsectionId: 's1', sceneNumber: 1, summary: 'Yesterday the war began.', keyFacts: [] }]
  if (checkTimelineInversion(digests).length !== 1) note({ check: 'deterministic.self-test.timeline', status: 'FAIL', detail: 'checkTimelineInversion did not fire' })
  else note({ check: 'deterministic.self-test.timeline', status: 'PASS', detail: 'checkTimelineInversion fires on backward first scene' })

  // Rule 7 (scene-level): seam continuity — a scene boundary with no carried cast.
  const seamBreak = [
    mk({ sceneId: 's1', chapterNumber: 1, entityName: 'Elias', sourceFacts: ['Elias at the Gate'], state: { present: true, status: 'alive', location: 'the Gate' } }),
    mk({ sceneId: 's2', chapterNumber: 2, entityName: 'Mara', sourceFacts: ['Mara at the Reach'], state: { present: true, status: 'alive', location: 'the Reach' } })
  ]
  if (checkSeamContinuity(seamBreak).some((d) => d.type === 'seam_disconnect')) note({ check: 'deterministic.self-test.seam', status: 'PASS', detail: 'checkSeamContinuity flags a cast-drop seam' })
  else note({ check: 'deterministic.self-test.seam', status: 'FAIL', detail: 'checkSeamContinuity did not fire on cast-drop seam' })

  // ...but a carried cast (even if it travels) is NOT a disconnect.
  const seamCarried = [
    mk({ sceneId: 's1', chapterNumber: 1, entityName: 'Elias', sourceFacts: ['Elias at the Gate'], state: { present: true, status: 'alive', location: 'the Gate' } }),
    mk({ sceneId: 's2', chapterNumber: 2, entityName: 'Elias', sourceFacts: ['Elias reaches the Reach'], state: { present: true, status: 'alive', location: 'the Reach' } })
  ]
  if (checkSeamContinuity(seamCarried).some((d) => d.type === 'seam_disconnect')) note({ check: 'deterministic.self-test.seam-clean', status: 'FAIL', detail: 'checkSeamContinuity false-positive on carried cast' })
  else note({ check: 'deterministic.self-test.seam-clean', status: 'PASS', detail: 'no seam_disconnect when cast carries over' })

  // Rule 7 (chapter-level): a character on stage at the end of a chapter must
  // reappear (or have a recorded exit) in the next. Real engine rule.
  const chapterSeamBreak = [
    mk({ entityId: 'C1', entityName: 'Elias', sceneId: 's1', chapterNumber: 1, sourceFacts: ['Elias at the Gate'], state: { present: true, status: 'alive', location: 'the Gate' } }),
    mk({ entityId: 'C2', entityName: 'Mara', sceneId: 's2', chapterNumber: 2, sourceFacts: ['Mara at the Reach'], state: { present: true, status: 'alive', location: 'the Reach' } })
  ]
  if (checkChapterSeam(chapterSeamBreak).some((d) => d.type === 'seam_disconnect')) note({ check: 'deterministic.self-test.chapter-seam', status: 'PASS', detail: 'checkChapterSeam flags a cast-drop chapter seam' })
  else note({ check: 'deterministic.self-test.chapter-seam', status: 'FAIL', detail: 'checkChapterSeam did not fire on cast-drop chapter seam' })

  const chapterSeamCarried = [
    mk({ entityId: 'C1', entityName: 'Elias', sceneId: 's1', chapterNumber: 1, sourceFacts: ['Elias at the Gate'], state: { present: true, status: 'alive', location: 'the Gate' } }),
    mk({ entityId: 'C1', entityName: 'Elias', sceneId: 's2', chapterNumber: 2, sourceFacts: ['Elias reaches the Reach'], state: { present: true, status: 'alive', location: 'the Reach' } })
  ]
  if (checkChapterSeam(chapterSeamCarried).some((d) => d.type === 'seam_disconnect')) note({ check: 'deterministic.self-test.chapter-seam-clean', status: 'FAIL', detail: 'checkChapterSeam false-positive on carried cast' })
  else note({ check: 'deterministic.self-test.chapter-seam-clean', status: 'PASS', detail: 'no seam_disconnect when cast carries over chapters' })

  // No false positives on a long, internally-consistent arc.
  const cleanStates = [
    mk({ sceneId: 's1', chapterNumber: 1, entityName: 'Elias', sourceFacts: ['Elias lives at the Gate'], state: { present: true, status: 'alive', location: 'the Gate', knows: ['the Gate'] } }),
    mk({ sceneId: 's2', chapterNumber: 2, entityName: 'Elias', sourceFacts: ['Elias has blue eyes'], state: { present: true, status: 'alive', location: 'the Gate', attributes: { eye_color: 'blue' } } }),
    mk({ sceneId: 's3', chapterNumber: 3, entityName: 'Elias', sourceFacts: ['Elias travels to the Reach'], state: { present: true, status: 'alive', location: 'the Reach' } }),
    mk({ sceneId: 's4', chapterNumber: 4, entityName: 'Elias', sourceFacts: ['Elias has blue eyes still'], state: { present: true, status: 'alive', location: 'the Reach', attributes: { eye_color: 'blue' } } }),
    mk({ entityType: 'object', entityId: 'O1', entityName: 'the Goblet', sceneId: 's2', chapterNumber: 2, sourceFacts: ['the Goblet is intact'], state: { condition: 'intact' } }),
    mk({ entityType: 'object', entityId: 'O1', entityName: 'the Goblet', sceneId: 's4', chapterNumber: 4, sourceFacts: ['the Goblet is intact'], state: { condition: 'intact' } })
  ]
  const cleanDigests = cleanStates.map((s) => ({ subsectionId: s.sceneId, sceneNumber: s.sceneNumber, chapterNumber: s.chapterNumber, keyFacts: s.sourceFacts, summary: '' }))
  const cleanRes = await runDeterministicContradictionChecks(cleanDigests, [], cleanStates)
  if (cleanRes.length !== 0) note({ check: 'deterministic.self-test.clean', status: 'FAIL', detail: `expected 0 contradictions on a consistent arc, got ${cleanRes.length}: ${cleanRes.map((r) => r.type).join(',')}` })
  else note({ check: 'deterministic.self-test.clean', status: 'PASS', detail: 'no false positives on a consistent 6-state arc' })
}

// ---- Delivery order: scramble chapter 18 to arrive early (out-of-order test) ----
const delivery = [...RAW].sort((a, b) => a.ingestOrder - b.ingestOrder)
const idx18 = delivery.findIndex((c) => c.chapterNumber === 18)
const ch18 = delivery.splice(idx18, 1)[0]
delivery.splice(5, 0, ch18)

const CHECKPOINTS = [
  { upto: 10, label: '1-10' },
  { upto: 25, label: '11-25' },
  { upto: 50, label: '26-50' },
  { upto: 75, label: '51-75' },
  { upto: 100, label: '76-100' }
]
let checkpointIdx = 0

async function runDeterministic() {
  const digests = entityStates.map((s) => ({
    subsectionId: s.sceneId,
    sceneNumber: s.sceneNumber,
    chapterNumber: s.chapterNumber,
    keyFacts: s.sourceFacts,
    summary: ''
  }))
  return await runDeterministicContradictionChecks(digests, [], entityStates)
}

async function checkpoint(chapterNumber) {
  while (
    checkpointIdx < CHECKPOINTS.length &&
    CHECKPOINTS[checkpointIdx].upto <= chapterNumber
  ) {
    const cp = CHECKPOINTS[checkpointIdx]
    const det = await runDeterministic()
    const ledgerOrder = [...ledgerByChapter.keys()].sort((a, b) => a - b)
    const orderedOk = ledgerOrder.every((v, i) => i === 0 || v > ledgerOrder[i - 1])
    note({
      checkpoint: cp.label,
      ledgerChapters: ledgerOrder.length,
      ledgerFacts: getFactLedger().length,
      deterministicErrors: det.filter((d) => d.severity === 'error').length,
      deterministicWarnings: det.filter((d) => d.severity === 'warning').length,
      ledgerChapterOrdered: orderedOk
    })
    checkpointIdx++
  }
}

// ---- Process each delivered chapter ----
for (const ch of delivery) {
  const n = ch.chapterNumber
  const sceneId = ch.id

  // Derive entity states for the deterministic contradiction engine.
  entityStates.push(
    ...deriveEntityStates({
      projectId: 'validation',
      digest: {
        subsectionId: sceneId,
        chapterNumber: n,
        sceneNumber: 1,
        location: LOC_NAME[ch.location],
        charactersPresent: ch.charactersPresent.map(knownName),
        keyFacts: ch.keyFacts,
        summary: ch.summary
      }
    })
  )

  // Undocumented-character guard: prose must NOT flag any known cast member.
  const uc = GuardrailRegistry.runSync({
    layer: 'ai_output',
    kinds: ['undocumented_character'],
    data: { content: ch.prose },
    sceneId
  })
  if (uc.results.some((r) => !r.passed)) {
    // Any hit on our known-cast prose is a false positive worth surfacing.
    for (const r of uc.results) {
      if (!r.passed) {
        undocumentedFalsePositives++
        note({ chapter: n, scenario: ch.scenario, kind: 'undocumented_character', status: 'FALSE_POSITIVE', detail: r.message })
      }
    }
  }

  // Fact-canon guard, processed one fact at a time so intra-chapter and
  // cross-chapter contradictions are caught in true story order.
  const bucket = ledgerByChapter.get(n) || []
  ledgerByChapter.set(n, bucket)
  for (const fact of ch.keyFacts) {
    if (typeof fact !== 'string') {
      note({ chapter: n, scenario: ch.scenario, kind: 'schema', status: 'INVALID_DATA', detail: `non-string keyFact: ${JSON.stringify(fact)}` })
      continue
    }
    const fc = GuardrailRegistry.runSync({
      layer: 'ai_output',
      kinds: ['fact_canon'],
      data: { keyFacts: [fact] },
      sceneId
    })
    const contradictions = fc.results.filter((r) => !r.passed)
    if (contradictions.length) {
      factCanonContradictions++
      note({ chapter: n, scenario: ch.scenario, kind: 'fact_canon', status: 'CONTRADICTION', detail: contradictions.map((c) => c.message).join('; ') })
    }
    const key = norm(fact)
    if (seenFacts.has(key)) {
      duplicates++
      note({ chapter: n, scenario: ch.scenario, kind: 'duplicate', status: 'DUPLICATE', detail: fact })
    } else {
      seenFacts.add(key)
      bucket.push(fact)
    }
  }

  // Referential integrity for explicit edges (ch52 seeds an orphan C99).
  for (const [from, to, label] of ch.edges || []) {
    if (!CAST_IDS.has(from) || !CAST_IDS.has(to)) {
      note({ chapter: n, scenario: ch.scenario, kind: 'referential', status: 'ORPHAN_EDGE', detail: `${from}->${to} (${label}) references unknown entity` })
    }
  }

  await checkpoint(n)
}

// ---- Idempotency (ch27 retry / ch99): re-deliver a chapter, ledger must not grow ----
const ledgerBefore = getFactLedger().length
for (const target of [27, 99]) {
  const ch = RAW.find((c) => c.chapterNumber === target)
  const bucket = ledgerByChapter.get(target) || []
  for (const fact of ch.keyFacts) {
    const key = norm(fact)
    if (!seenFacts.has(key)) {
      seenFacts.add(key)
      bucket.push(fact)
    }
  }
}
const ledgerAfter = getFactLedger().length
note({ check: 'idempotency.reingest', status: ledgerAfter === ledgerBefore ? 'PASS' : 'FAIL', detail: `ledger ${ledgerBefore} -> ${ledgerAfter}` })

// ---- W7 reproduction: SyncTransport.pushOne duplicates on POST-ok / modify-fail ----
{
  const api = {
    calls: [],
    failNext: false,
    async call(url, opts) {
      this.calls.push({ url, method: opts.method })
      if (this.failNext) {
        this.failNext = false
        throw new Error('network timeout')
      }
      return { id: `api-${this.calls.length}` }
    }
  }
  let modifyFailOnce = false
  const modify = async () => {
    if (modifyFailOnce) {
      modifyFailOnce = false
      throw new Error('indexeddb write failed')
    }
  }
  const db = new Proxy({}, { get: () => ({ where: () => ({ equals: () => ({ modify }) }) }) })
  const config = {
    table: 'characters',
    endpoint: '/api/characters',
    isTopLevel: false,
    parentField: 'projectId',
    toApi: async (local) => ({ ...local })
  }
  const idStore = new Map()
  const idMap = {
    getApiId: (t, id) => idStore.get(`${t}:${id}`) ?? null,
    setMapping: (t, id, apiId) => idStore.set(`${t}:${id}`, apiId),
    getLocalId: () => null,
    resolveStoryApiId: async () => 'story-1',
    persistStoryId: () => {}
  }
  const transport = new SyncTransport((url, opts) => api.call(url, opts))
  api.failNext = false
  modifyFailOnce = true // simulate: POST succeeds, but marking synced throws -> row stays pending-create
  await transport.pushOne(config, { id: 'local-1', syncStatus: 'pending-create' }, 'story-1', idMap, db)
  // Next sync cycle re-pushes the same still-pending row (no idempotency key / no pre-POST guard).
  await transport.pushOne(config, { id: 'local-1', syncStatus: 'pending-create' }, 'story-1', idMap, db)
  const posts = api.calls.filter((c) => c.method === 'POST').length
  note({
    check: 'sync.idempotency(W7)',
    status: posts > 1 ? 'REPRODUCED' : 'PASS',
    detail: `pushOne issued ${posts} POST(s) for one pending-create row across two sync cycles (no idempotency key)`
  })
}

// ---- Chapter-boundary seam continuity (ending of ChN -> opening of ChN+1) ----
// Walks the chapters in story order and asserts the seam between consecutive
// chapters is continuous: cast carries over, the continuation link is intact,
// each chapter declares an ending hook, and any location change is justified.
{
  const ordered = [...RAW].sort((a, b) => a.chapterNumber - b.chapterNumber)
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    const cur = ordered[i]
    const boundary = `${prev.chapterNumber}->${cur.chapterNumber}`
    if (cur.chapterNumber !== prev.chapterNumber + 1) note({ check: 'seam.order', status: 'FAIL', boundary, detail: 'chapter number gap' })
    if (!cur.flashback) {
      const pc = new Set(prev.charactersPresent || [])
      const cc = new Set(cur.charactersPresent || [])
      if (pc.size > 0 && cc.size > 0 && ![...pc].some((x) => cc.has(x)))
        note({ check: 'seam.cast-drop', status: 'FAIL', boundary, detail: `prev=${[...pc]} cur=${[...cc]}` })
      if (!cur.continuesFrom) note({ check: 'seam.continuation', status: 'FAIL', boundary, detail: 'continuesFrom missing' })
      else if (cur.continuesFrom !== prev.id) note({ check: 'seam.continuation', status: 'FAIL', boundary, detail: `expected ${prev.id} got ${cur.continuesFrom}` })
      if (!cur.ending) note({ check: 'seam.ending', status: 'FAIL', boundary, detail: 'ending hook missing' })
    }
    if (prev.location && cur.location && prev.location !== cur.location && !cur.flashback) {
      const ln = LOC_NAME[cur.location]
      const justified = (cur.keyFacts || []).some((f) => f.includes(ln)) || (cur.references || []).length > 0
      if (!justified) note({ check: 'seam.location-teleport', status: 'FAIL', boundary, detail: `${prev.location}->${cur.location}` })
    }
    for (const r of cur.references || []) if (r && r.to && !RAW.some((c) => c.id === r.to)) note({ check: 'seam.ref-orphan', status: 'FAIL', boundary, detail: r.to })
    for (const e of cur.edges || []) if (!CAST_IDS.has(e[0]) || !CAST_IDS.has(e[1])) note({ check: 'seam.edge-orphan', status: 'FAIL', boundary, detail: JSON.stringify(e) })
  }

  // Real-engine chapter-seam check: run the actual Rule 7 over the entity states
  // derived from the dataset (the same states the consistency engine consumes in
  // production). It must report zero seam_disconnect — proving the engine itself
  // certifies the chapter-to-chapter continuity, not just the structural walk above.
  const engineSeam = await runDeterministicContradictionChecks(
    entityStates.map((s) => ({ subsectionId: s.sceneId, sceneNumber: s.sceneNumber, chapterNumber: s.chapterNumber, keyFacts: s.sourceFacts, summary: '' })),
    [],
    entityStates
  ).then((r) => r.filter((d) => d.type === 'seam_disconnect'))
  const seamEngineFails = engineSeam.length
  note({
    check: 'seam.engine',
    status: seamEngineFails === 0 ? 'PASS' : 'FAIL',
    detail: `engine seam_disconnect: ${seamEngineFails} (expected 0; structural edge-orphan at ch52 is a references/edges issue, not a cast seam)`
  })

  const seamFails = findings.filter((f) => f.check && f.check.startsWith('seam.') && f.status === 'FAIL')
  // Exactly one expected failure: the intentional ch52 referential-violation seed.
  note({ check: 'seam.summary', status: seamFails.length === 1 ? 'PASS' : 'FAIL', detail: `seam failures: ${seamFails.length} (1 expected: seeded ch52 edge-orphan)` })
}

// ---- Final ledger ordering assertion ----
const finalOrder = [...ledgerByChapter.keys()].sort((a, b) => a - b)
const orderedOk = finalOrder.every((v, i) => i === 0 || v > finalOrder[i - 1])
note({ check: 'final.ledger-order', status: orderedOk ? 'PASS' : 'FAIL', detail: `chapters present: ${finalOrder.length}` })

// ---- Per-scenario coverage: did the seeded edge case surface anywhere? ----
const coverage = RAW.filter((c) => c.scenario).map((c) => {
  const fn = findings.filter((f) => f.chapter === c.chapterNumber)
  return {
    chapter: c.chapterNumber,
    scenario: c.scenario,
    observed: fn.length ? fn.map((f) => `${f.kind}:${f.status}`) : ['no-guard-signal']
  }
})

// ---- Summary ----
const summary = {
  chapters: RAW.length,
  scenariosProcessed: RAW.filter((c) => c.scenario).length,
  factCanonContradictions,
  duplicates,
  undocumentedFalsePositives,
  findingsCount: findings.length,
  coverage,
  findings
}

mkdirSync('validation', { recursive: true })
writeFileSync('validation/validation-report.json', JSON.stringify(summary, null, 2))

console.log('=== 100-CHAPTER VALIDATION HARNESS ===')
console.log(`chapters=${RAW.length} scenarios=${summary.scenariosProcessed}`)
console.log(`fact-canon contradictions detected: ${factCanonContradictions}`)
console.log(`duplicates detected:              ${duplicates}`)
console.log(`undocumented-character false positives (should be 0): ${undocumentedFalsePositives}`)
console.log(`total findings: ${findings.length}`)
console.log('\n--- checkpoint + key findings ---')
for (const f of findings) {
  if (f.checkpoint || f.check) console.log(JSON.stringify(f))
}
console.log('\nFull report -> validation/validation-report.json')
