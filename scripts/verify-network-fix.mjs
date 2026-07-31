/**
 * Verifies the Story Network fix against a REAL Ollama.
 *
 * The reported symptom was "[generateRelationships] attempt 1 returned no
 * connections; retrying." — a valid but empty result. Unit tests can prove the
 * schema says minItems:1; only a real model can prove it actually produces
 * connections now. Run: npm run verify:network
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
const { makeRelationshipSchema, estimateRelationshipTokens, buildRelationshipEdges } = await import(
  '../src/composables/generation/generators/relationships.ts'
)

const MODEL = process.env.VERIFY_MODEL || 'phi4-mini:3.8b'
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const characters = [
  { id: 1, name: 'Mara Vance', role: 'Lighthouse keeper', goal: 'Keep the light burning' },
  { id: 2, name: 'Ines Okonjo', role: 'Marine biologist', goal: 'Prove the reef is dying' },
  { id: 3, name: 'Cal Rooke', role: 'Harbourmaster', goal: 'Keep the harbour profitable' }
]
const locations = [
  { id: 10, name: 'The Lighthouse', description: 'Isolated, storm-battered' },
  { id: 11, name: 'The Pier', description: 'Rotting boards, fishing boats' }
]
const plotThreads = [
  { id: 20, title: 'Who moved the boat', notes: 'A boat vanishes overnight' },
  { id: 21, title: 'The dying reef', notes: 'Something is poisoning the water' }
]

console.log(`Warming up ${MODEL}...`)
await warmUp(MODEL)

const schema = makeRelationshipSchema({
  characterNames: characters.map((c) => c.name),
  locationNames: locations.map((l) => l.name),
  threadTitles: plotThreads.map((t) => t.title)
})
const maxTokens = estimateRelationshipTokens({
  characterCount: 3,
  locationCount: 2,
  threadCount: 2
})

const SYSTEM = `You are a story-structure architect mapping the relationship network of a cast that already exists.

You are given the exact characters, locations, and plot threads. Use ONLY these names — never invent new entities. Produce the connections between them:
- characterRelationships: how characters relate to each other (ally, rival, family, mentor, romantic, enemy, colleague, ...). EVERY character must appear in at least one relationship. Characters in the same story always relate somehow — if a dynamic is not obvious, infer the most plausible one from their roles and goals.
- characterLocations: which characters are bound to which locations (home, frequents, avoids, imprisoned, rules, ...).
- characterPlotThreads: which characters drive, obstruct, or are affected by which plot threads (driver, obstacle, affected, catalyst, ...).
- plotThreadLinks: how plot threads relate (depends_on, parallels, resolves, complicates, ...).

Return ONLY JSON matching the requested shape. characterRelationships must never be empty. The other arrays may be omitted only when the story genuinely contains no such entities.`

const payload = {
  synopsis: 'A lighthouse keeper discovers the harbourmaster is dumping waste on a dying reef.',
  genre: 'Literary thriller',
  tone: 'Bleak, tense',
  characters: characters.map((c) => ({ name: c.name, role: c.role, goal: c.goal })),
  locations: locations.map((l) => ({ name: l.name, description: l.description })),
  plotThreads: plotThreads.map((t) => ({ title: t.title, notes: t.notes }))
}

const t0 = Date.now()
const { data, usage } = await generateStructured(
  `Map the relationship network for this story. Entities:\n\n${JSON.stringify(payload, null, 2)}`,
  SYSTEM,
  MODEL,
  schema,
  { maxTokens, idleTimeout: 90000, firstTokenTimeout: 300000 }
)
const ms = Date.now() - t0

const relCount = data.characterRelationships?.length || 0
check('the model returns at least one character relationship', relCount > 0, `${relCount} returned`)
check('it does not exceed the pair cap', relCount <= 3, `${relCount} of max 3`)
check('the call stays within its token budget', usage.completionTokens < maxTokens,
  `${usage.completionTokens} of ${maxTokens}`)
console.log(`      (${(ms / 1000).toFixed(1)}s)`)

// The real test of the prompt: do the names resolve against the committed cast?
const { characterRelationships, graphEdges, dropped } = buildRelationshipEdges(data, {
  characters,
  locations,
  plotThreads
})
check('character relationships resolve to real entity ids',
  characterRelationships.length === relCount,
  `${characterRelationships.length} of ${relCount} kept`)
check('nothing the model emitted is silently discarded',
  dropped.length === 0,
  `${graphEdges.length} edges kept, ${dropped.length} dropped`)
if (dropped.length) {
  console.log('      dropped: ' + JSON.stringify(dropped, null, 1))
  console.log('      model emitted: ' + JSON.stringify({
    characterLocations: data.characterLocations,
    characterPlotThreads: data.characterPlotThreads,
    plotThreadLinks: data.plotThreadLinks
  }, null, 1))
}

const named = new Set()
for (const r of data.characterRelationships || []) {
  named.add(String(r.from).toLowerCase())
  named.add(String(r.to).toLowerCase())
}
check('every character appears in the network',
  characters.every((c) => named.has(c.name.toLowerCase())),
  [...named].join(', '))

console.log(
  '\n' + JSON.stringify(data.characterRelationships, null, 1)
)
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
