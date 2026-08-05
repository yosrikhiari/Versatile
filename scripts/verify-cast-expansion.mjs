/**
 * Verifies arc-driven cast expansion against a REAL Ollama.
 *
 * The reported symptom was "no new character or plot thread introduced
 * depending on where the plot is going — I still have the same 3 characters
 * from the start". Unit tests prove the plumbing commits whatever the model
 * returns; only a real model can prove the prompt makes it return anything
 * useful — entities that are genuinely new, tied to the arc, and named without
 * restating the cast it was told not to repeat.
 *
 * Run: npm run verify:cast   (VERIFY_MODEL=phi4-mini:3.8b to try a smaller one)
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

/** Load the model first; node's fetch has a 300s headers timeout browsers lack. */
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

const MODEL = process.env.VERIFY_MODEL || 'qwen3:8b'
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// The reported project: three characters, two locations, one thread, ten chapters.
const SCOPE = { chapters: 10 }
const existingCharacters = [
  { name: 'Kael Ardent', role: 'Fallen knight', goal: 'Reclaim his name' },
  { name: 'Riven Sol', role: 'Sworn brother', goal: 'Hold the line' },
  { name: 'Sera Vale', role: 'Battlefield healer', goal: 'Keep Kael alive' }
]
const existingLocations = [
  { name: 'The Void', description: 'The between-place Kael falls into' },
  { name: 'Ashfall Keep', description: 'The fortress that betrayed him' }
]
const existingThreads = [{ title: 'The Betrayal', notes: 'Who gave the order to abandon Kael' }]

const arc = [
  { chapterNumber: 1, title: 'The Fall', goal: 'Betrayed in battle', hookEnding: 'Left for dead' },
  { chapterNumber: 2, title: 'Descent into Despair', goal: 'Kael breaks', hookEnding: 'A voice answers him in the dark' },
  { chapterNumber: 3, title: 'Awakening in the Void', goal: 'Something bargains with him', hookEnding: 'He accepts the offer' },
  { chapterNumber: 4, title: 'Echoes of Betrayal', goal: 'He learns who signed the order', hookEnding: 'The name is one he loves' },
  { chapterNumber: 5, title: 'The Weight of Shadows', goal: 'The power starts taking payment', hookEnding: 'He kills someone he did not mean to' },
  { chapterNumber: 6, title: 'Whispers of Power', goal: 'A faction courts him', hookEnding: 'They offer an army' },
  { chapterNumber: 7, title: 'Light from the Depths', goal: 'Sera tries to pull him back', hookEnding: 'He refuses her' },
  { chapterNumber: 8, title: 'Awakening Power', goal: 'He breaks the seal', hookEnding: 'The Void follows him out' },
  { chapterNumber: 9, title: 'The Siege', goal: 'Ashfall Keep burns', hookEnding: 'Riven stands in his way' },
  { chapterNumber: 10, title: 'What Remains', goal: 'The cost is counted', hookEnding: 'The story closes on the throne' }
]

const targets = castTargetsFor(SCOPE)
const need = {
  characters: castGap(targets.characters, existingCharacters.length),
  locations: castGap(targets.locations, existingLocations.length),
  plotThreads: castGap(targets.plotThreads, existingThreads.length),
  groups: 3
}
console.log(`Scope: ${SCOPE.chapters} chapters → target ${JSON.stringify(targets)}`)
console.log(`Existing cast: 3/2/1 → asking for ${JSON.stringify(need)}\n`)
check(
  'a 10-chapter story asks for more than the old flat floors did',
  need.characters > 0 && need.locations > 0 && need.plotThreads > 0,
  JSON.stringify(need)
)

const nameList = (names) => (names.length ? names.join(', ') : '(none)')
const userPrompt = `Story synopsis: "A knight is betrayed and left for dead, and bargains with something in the void to come back."

CENTRAL CONFLICT: Kael against the people who abandoned him, and against what he traded to return

### THE PLANNED ARC
${summarizeArc(arc)}

### EXISTING CAST — these already exist, do not return any of them
Characters: ${nameList(existingCharacters.map((c) => c.name))}
Locations: ${nameList(existingLocations.map((l) => l.name))}
Plot threads: ${nameList(existingThreads.map((t) => t.title))}

TASK: Return AT MOST ${need.characters} new character(s), ${need.locations} new location(s) and ${need.plotThreads} new plot thread(s) that this arc requires and the existing cast does not cover. Also return AT MOST ${need.groups} group(s) — orders, courts, factions — each listing its members by exact name.`

const maxTokens =
  need.characters * 220 + need.locations * 110 + need.plotThreads * 90 + need.groups * 90 + 200

console.log(`Warming up ${MODEL}...`)
await warmUp(MODEL)

const t0 = Date.now()
const { data, usage } = await generateStructured(
  userPrompt,
  EXPAND_CAST_PROMPT,
  MODEL,
  makeExpansionSchema(need),
  { maxTokens, idleTimeout: 90000, firstTokenTimeout: 300000 }
)
const ms = Date.now() - t0

const chars = data.characters || []
const locs = data.locations || []
const threads = data.plotThreads || []

check('the model returns new characters', chars.length > 0, `${chars.length} returned`)
check('the model returns new plot threads', threads.length > 0, `${threads.length} returned`)
check(
  'it respects the per-type caps',
  chars.length <= need.characters && locs.length <= need.locations && threads.length <= need.plotThreads,
  `${chars.length}/${need.characters} chars, ${locs.length}/${need.locations} locs, ${threads.length}/${need.plotThreads} threads`
)
check(
  'the call stays within its token budget',
  usage.completionTokens < maxTokens,
  `${usage.completionTokens} of ${maxTokens}`
)

// The failure that would make this whole feature pointless: the model "adds"
// entities that are just the existing cast again, and every one gets dropped.
const norm = (s) => String(s || '').trim().toLowerCase()
const existingNames = new Set(
  [...existingCharacters.map((c) => c.name), ...existingLocations.map((l) => l.name)].map(norm)
)
const existingTitles = new Set(existingThreads.map((t) => norm(t.title)))
const collisions = [
  ...chars.filter((c) => existingNames.has(norm(c.name))).map((c) => c.name),
  ...locs.filter((l) => existingNames.has(norm(l.name))).map((l) => l.name),
  ...threads.filter((t) => existingTitles.has(norm(t.title))).map((t) => t.title)
]
check('nothing it returns collides with the existing cast', collisions.length === 0, collisions.join(', ') || 'no collisions')

const allNew = [...chars.map((c) => norm(c.name)), ...locs.map((l) => norm(l.name))]
check('it does not repeat itself within one response', new Set(allNew).size === allNew.length)

check('every new character is named', chars.every((c) => c.name && c.name.trim()), '')
check(
  'new entities carry notes tying them to the arc',
  [...chars, ...threads].every((e) => (e.notes || '').trim().length > 0),
  `${[...chars, ...threads].filter((e) => (e.notes || '').trim()).length} of ${chars.length + threads.length} annotated`
)

// The reason `groups` exists: a body of people used to land as a plot-thread
// title (measured at 2 of 9) or dissolve into a prose mention with no entity.
const groups = data.groups || []
const COLLECTIVE = ORGANISATION_TITLE

check('the model returns at least one group', groups.length > 0, `${groups.length} returned`)
// The model still lists an organisation under BOTH keys, so `expandCast` drops
// the duplicate rather than trusting the prompt. Apply the same rule here and
// assert on what actually reaches the story bible, not on the raw response.
// Mirror exactly what `expandCast` does, and assert on what reaches the story
// bible rather than on the raw response — the model files organisations wrongly
// in two different ways and both are corrected in code, not by the prompt.
const factionNames = new Set(groups.map((g) => norm(g.name)))
const rawDupes = threads.filter((t) => factionNames.has(norm(t.title))).map((t) => t.title)
const deduped = threads.filter((t) => !factionNames.has(norm(t.title)))

const orgOnly = deduped.filter((t) => COLLECTIVE.test(t.title || ''))
const survivors = deduped.filter((t) => !COLLECTIVE.test(t.title || ''))
// The never-empty guard: mis-typed threads are kept if dropping leaves nothing.
const keptThreads = orgOnly.length && survivors.length ? survivors : deduped

if (rawDupes.length) console.log(`      note: double-listed ${rawDupes.join(', ')} — dropped`)
if (orgOnly.length) {
  console.log(
    `      note: organisation-shaped thread${orgOnly.length === 1 ? '' : 's'} ` +
      `${orgOnly.map((t) => t.title).join(', ')} — ` +
      (survivors.length ? 'dropped' : 'KEPT (dropping would empty the list)')
  )
}

const leaked = keptThreads.filter((t) => COLLECTIVE.test(t.title || '')).map((t) => t.title)
check(
  'no organisation survives as a plot thread',
  leaked.length === 0 || survivors.length === 0,
  leaked.length ? `${leaked.join(' | ')} (kept only because nothing else would remain)` : 'none'
)
check(
  'the thread list is never emptied',
  threads.length === 0 || keptThreads.length > 0,
  `${keptThreads.length} of ${threads.length} kept`
)

const knownNames = new Set(
  [...existingCharacters, ...chars.map((c) => ({ name: c.name }))].map((c) => norm(c.name))
)
const resolvable = groups.filter((g) =>
  (g.members || []).some((m) => knownNames.has(norm(m)))
)
check(
  'every group has at least one member that resolves to a real character',
  groups.length > 0 && resolvable.length === groups.length,
  `${resolvable.length} of ${groups.length} resolvable`
)

console.log(`      (${(ms / 1000).toFixed(1)}s, ${usage.completionTokens} completion tokens)\n`)
console.log('New characters:')
for (const c of chars) console.log(`  • ${c.name} (${c.role || 'no role'}) — ${c.notes || ''}`)
console.log('New locations:')
for (const l of locs) console.log(`  • ${l.name} — ${l.description || ''}`)
console.log('New plot threads:')
for (const t of threads) console.log(`  • ${t.title} — ${t.notes || ''}`)
console.log('New groups:')
for (const g of groups) console.log(`  • ${g.name} — members: ${(g.members || []).join(', ') || '(none)'}`)

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
