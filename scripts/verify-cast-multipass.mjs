/**
 * Verifies the MULTI-PASS cast expansion (the fix for "100 chapters still only
 * gets 3 characters") against a REAL Ollama.
 *
 * The single-call verify:cast proves the prompt works; this proves the loop in
 * useEntityBootstrapper.expandCast actually walks a 100-chapter saga up to a
 * large cast across passes. It mirrors the loop body (targets → gap → prompt →
 * takeNew dedup → organisation drop) with an in-memory bible instead of Dexie,
 * then asserts the accumulated cast is far past the old hard cap.
 *
 * Run: node --import tsx scripts/verify-cast-multipass.mjs
 *      VERIFY_MODEL=qwen3:8b VERIFY_CHAPTERS=100 npm run verify:cast:multi
 */

import http from 'node:http'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
}
globalThis.localStorage.setItem('versatile_ollama_endpoint', 'http://localhost:11434')

function warmUp(model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      prompt: 'hi',
      stream: false,
      think: false,
      options: { num_predict: 1 }
    })
    const req = http.request(
      {
        hostname: 'localhost',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      },
      (res) => {
        res.resume()
        res.on('end', resolve)
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

const { generateStructured } = await import('../src/services/providers/ollama.ts')
const {
  EXPAND_CAST_PROMPT,
  makeExpansionSchema,
  summarizeArc,
  castTargetsFor,
  castGap,
  ORGANISATION_TITLE
} = await import('../src/composables/useEntityBootstrapper.ts')

// Mirrors the bootstrapper's constants.
const MAX_EXPAND_PASSES = 30
const MAX_NEW_PER_CALL = 10
const MAX_NEW_GROUPS = 3
const TOKENS_PER_NEW_CHARACTER = 220
const TOKENS_PER_NEW_LOCATION = 110
const TOKENS_PER_NEW_THREAD = 90
const TOKENS_PER_NEW_GROUP = 90

const MODEL = process.env.VERIFY_MODEL || 'qwen3:8b'
const CHAPTERS = Number(process.env.VERIFY_CHAPTERS || 100)
const SCOPE = { chapters: CHAPTERS }

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// Seed: the reported "stuck" starting point — 3 chars / 2 locs / 1 thread.
const bibleChars = [
  { name: 'Kael Ardent', role: 'Fallen knight', goal: 'Reclaim his name' },
  { name: 'Riven Sol', role: 'Sworn brother', goal: 'Hold the line' },
  { name: 'Sera Vale', role: 'Battlefield healer', goal: 'Keep Kael alive' }
]
const bibleLocs = [
  { name: 'The Void', description: 'The between-place Kael falls into' },
  { name: 'Ashfall Keep', description: 'The fortress that betrayed him' }
]
const bibleThreads = [{ title: 'The Betrayal', notes: 'Who gave the order to abandon Kael' }]
const bibleGroups = []

// A representative 100-chapter arc so summariseArc has real beats to digest.
const arcs = []
for (let c = 1; c <= CHAPTERS; c++) {
  const third = Math.ceil(CHAPTERS / 3)
  let goal, hook
  if (c <= third) {
    goal = `Descent ${c}: Kael is broken further and learns who betrayed him`
    hook = `A new ally or enemy is revealed at chapter ${c}`
  } else if (c <= third * 2) {
    goal = `Rise ${c}: Kael gathers a faction and turns the power outward`
    hook = `The cost of the bargain deepens at chapter ${c}`
  } else {
    goal = `Reckoning ${c}: the siege of Ashfall Keep and the final reckoning`
    hook = `A thread closes and a new danger opens at chapter ${c}`
  }
  arcs.push({
    chapterNumber: c,
    title: `Chapter ${c}`,
    goal,
    hookEnding: hook
  })
}

const synopsis =
  'A knight is betrayed and left for dead, and bargains with something in the void to come back — then must gather a growing cast to take the keep that abandoned him.'
const targets = castTargetsFor(SCOPE)
console.log(`Scope: ${CHAPTERS} chapters → target ${JSON.stringify(targets)}`)
console.log(`Seed cast: ${bibleChars.length}/${bibleLocs.length}/${bibleThreads.length}\n`)

const nameList = (names) => (names.length ? names.join(', ') : '(none)')
const norm = (s) => String(s || '').trim().toLowerCase()
const normalizeName = norm

const takeNew = (items, keyField, known, knownField, cap) => {
  const seen = new Set(known.map((e) => normalizeName(e[knownField])))
  const out = []
  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeName(item?.[keyField])
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= cap) break
  }
  return out
}

const t0 = Date.now()
let totalCalls = 0
for (let pass = 0; pass < MAX_EXPAND_PASSES; pass++) {
  const need = {
    characters: castGap(targets.characters, bibleChars.length),
    locations: castGap(targets.locations, bibleLocs.length),
    plotThreads: castGap(targets.plotThreads, bibleThreads.length),
    groups:
      bibleChars.length + castGap(targets.characters, bibleChars.length) >= 4 ? MAX_NEW_GROUPS : 0
  }
  if (!need.characters && !need.locations && !need.plotThreads) {
    console.log(`pass ${pass}: target met (need 0/0/0) — stopping`)
    break
  }

  const arcDigest = summarizeArc(arcs)
  const userPrompt = `Story synopsis: "${synopsis}"

### THE PLANNED ARC
${arcDigest}

### EXISTING CAST — these already exist, do not return any of them
Characters: ${nameList(bibleChars.map((c) => c.name))}
Locations: ${nameList(bibleLocs.map((l) => l.name))}
Plot threads: ${nameList(bibleThreads.map((t) => t.title))}

TASK: Return AT MOST ${need.characters} new character(s), ${need.locations} new location(s) and ${need.plotThreads} new plot thread(s) that this arc requires and the existing cast does not cover.${
    need.groups
      ? ` Also return AT MOST ${need.groups} group(s) — orders, courts, factions — each listing its members by exact name.`
      : ''
  }`

  const maxTokens =
    need.characters * TOKENS_PER_NEW_CHARACTER +
    need.locations * TOKENS_PER_NEW_LOCATION +
    need.plotThreads * TOKENS_PER_NEW_THREAD +
    need.groups * TOKENS_PER_NEW_GROUP +
    200

  const { data, usage } = await generateStructured(userPrompt, EXPAND_CAST_PROMPT, MODEL, makeExpansionSchema(need), {
    maxTokens,
    idleTimeout: 480000,
    firstTokenTimeout: 540000
  })
  totalCalls++
  void usage

  const parsed = data || {}

  // Organisation double-listing + mis-filed-as-thread handling (mirrors expandCast).
  const factionNames = new Set(
    (Array.isArray(parsed.groups) ? parsed.groups.slice(0, need.groups) : [])
      .map((g) => normalizeName(g?.name))
      .filter(Boolean)
  )
  const allThreads = Array.isArray(parsed.plotThreads) ? parsed.plotThreads : []
  const deduped = factionNames.size
    ? allThreads.filter((t) => !factionNames.has(normalizeName(t?.title)))
    : allThreads
  const isOrganisation = (t) => ORGANISATION_TITLE.test(String(t?.title || ''))
  const keptThreads = deduped.filter((t) => !isOrganisation(t))
  const dropped = deduped.filter(isOrganisation)
  parsed.plotThreads = dropped.length && keptThreads.length ? keptThreads : deduped

  const newChars = takeNew(parsed.characters, 'name', bibleChars, 'name', need.characters).map((c) => ({
    name: c.name,
    role: c.role || '',
    goal: c.goal || '',
    notes: c.notes || ''
  }))
  const newLocs = takeNew(parsed.locations, 'name', bibleLocs, 'name', need.locations).map((l) => ({
    name: l.name,
    description: l.description || '',
    notes: l.notes || ''
  }))
  const newThreads = takeNew(parsed.plotThreads, 'title', bibleThreads, 'title', need.plotThreads).map((t) => ({
    title: t.title,
    notes: t.notes || ''
  }))
  const newGroups = takeNew(parsed.groups, 'name', bibleGroups, 'name', need.groups).map((g) => ({
    name: g.name,
    members: g.members || []
  }))

  bibleChars.push(...newChars)
  bibleLocs.push(...newLocs)
  bibleThreads.push(...newThreads)
  bibleGroups.push(...newGroups)

  const ms = Date.now() - t0
  console.log(
    `pass ${pass}: +${newChars.length}c/+${newLocs.length}l/+${newThreads.length}t/+${newGroups.length}g ` +
      `→ total ${bibleChars.length}/${bibleLocs.length}/${bibleThreads.length} ` +
      `(${(ms / 1000).toFixed(1)}s, ${totalCalls} calls)`
  )
  if (newChars.length + newLocs.length + newThreads.length === 0) {
    console.log('  pass added nothing — stopping')
    break
  }
}

const ms = Date.now() - t0
const oldCap = 12 // the hard cap that used to freeze the cast
console.log(
  `\nFinal accumulated cast: ${bibleChars.length} characters / ${bibleLocs.length} locations / ` +
    `${bibleThreads.length} plot threads (${totalCalls} model calls, ${(ms / 1000).toFixed(1)}s)`
)

check('cast grew past the old 12-character hard cap', bibleChars.length > oldCap, `${bibleChars.length} characters`)
check(
  'locations scaled up with the saga',
  bibleLocs.length > 9,
  `${bibleLocs.length} locations (old cap 9)`
)
check(
  'plot threads scaled up with the saga',
  bibleThreads.length > 5,
  `${bibleThreads.length} threads (old cap 5)`
)
check(
  'the loop actually used multiple passes (not a single call)',
  totalCalls > 1,
  `${totalCalls} passes`
)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
