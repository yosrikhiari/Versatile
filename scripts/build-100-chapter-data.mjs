// Deterministic generator for the 100-chapter "Fractured Lattice" validation dataset.
// Produces validation/novel-100-data.json consumed by the validation harness.
// No randomness: the dataset is fully reproducible so the harness is a stable test.
//
// Run: node scripts/build-100-chapter-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs'

const CAST = [
  { id: 'C1', name: 'Elias Varn' },
  { id: 'C2', name: 'Morrin Kael' },
  { id: 'C3', name: 'Lysara' },
  { id: 'C4', name: 'Captain Brann Oru' },
  { id: 'C5', name: 'Sister Yvane' },
  { id: 'C6', name: 'Torvan Esh' },
  { id: 'C7', name: 'The Hierarch Duskwane' },
  { id: 'C8', name: 'Mireille Voss' },
  { id: 'C9', name: 'Seraph Duskbane' },
  { id: 'C10', name: 'The Echo of Morthaen' },
  { id: 'C11', name: 'Pell the Cartographer' },
  { id: 'C12', name: 'Warden Cas' }
]
const LOCATIONS = [
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'
]
const LOC_NAME = {
  L1: 'the Archives of Veylthar', L2: 'the Lattice Spire', L3: 'the Sunken Quarter',
  L4: 'the Convergence Plateau', L5: 'the Threnody Sanctum', L6: 'the Floating Market of Cinder',
  L7: 'the Ashlands', L8: "Duskwane's Redoubt", L9: 'the Silent Library', L10: 'the Shattered Causeway'
}
const THREADS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']

// Chapter -> scenario tag from NOVEL_100_CHAPTER_SPEC.md §7
const SCENARIO = {
  3: 'missing-data', 7: 'invalid-data', 11: 'duplicate-data', 14: 'conflicting-updates',
  18: 'out-of-order', 22: 'long-chain-intro', 27: 'retry', 30: 'partial-failure',
  33: 'failed-transaction', 41: 'concurrent-update', 46: 'stale-data', 52: 'referential-violation',
  60: 'consequence', 63: 'payoff', 70: 'flashback', 74: 'boundary', 81: 'large-payload',
  88: 'flashback', 90: 'entity-change', 94: 'recovery', 99: 'idempotency', 100: 'final'
}
const FLASHBACK = new Set([70, 88])

// Progressive introduction of cast members (firstSeen).
const INTRO = {
  1: ['C1', 'C2', 'C3', 'L1', 'T1', 'T2', 'T3'],
  2: ['C4', 'L2', 'T4', 'T8'],
  3: ['L3'],
  4: ['C6'],
  5: ['C7', 'L4', 'L5'],
  8: ['C8', 'T9'],
  9: ['L6'],
  12: ['C9'],
  15: ['L7'],
  20: ['C10'],
  22: ['C11'],
  30: ['C12'],
  33: ['L8'],
  48: ['L9'],
  71: ['L10']
}
const firstSeen = {}
for (const [ch, ids] of Object.entries(INTRO)) for (const id of ids) if (!(id in firstSeen)) firstSeen[id] = Number(ch)

// Accumulated established entity set per chapter.
const established = new Set()
const chapters = []
let prevLoc = null
const ledgerByChapter = {} // ch -> keyFacts (for out-of-order / dedup tests)

for (let ch = 1; ch <= 100; ch++) {
  const intro = INTRO[ch] || []
  for (const id of intro) established.add(id)
  const charsPresent = CAST.filter(c => (firstSeen[c.id] ?? 999) <= ch).map(c => c.id)
  const loc = LOCATIONS[Math.min(LOCATIONS.length - 1, Math.floor((ch - 1) / 10))]
  const scenario = SCENARIO[ch] || null
  const flashback = FLASHBACK.has(ch)

  // Base key facts accumulate from prior established threads + chapter-specific beats.
  const keyFacts = []
  if (ch === 1) keyFacts.push('Elias Varn found the Tome of the First Convergence')
  if (ch === 5) keyFacts.push('The Threnody cult secretly plans to reignite the Convergence')
  if (ch === 20) keyFacts.push('The Echo of Morthaen awakens within the Lattice')
  if (ch === 22) keyFacts.push('Pell the Cartographer maps a hidden route to the Silent Library')
  if (ch === 48) keyFacts.push('The Silent Library is discovered beyond the Ashlands')
  if (ch === 59) keyFacts.push('The Second Tome is recovered from the Silent Library')
  if (ch === 62) keyFacts.push('Mireille Voss is revealed as a Threnody mole')
  if (ch === 66) keyFacts.push('Morrin Kael proves his loyalty to Elias')
  if (ch === 90) keyFacts.push('The Echo of Morthaen possesses Elias Varn')
  if (ch === 100) keyFacts.push('The Final Convergence resets the Lattice')

  // Scenario-specific mutations
  let metadataFailed = false
  let edges = []
  let references = []
  let negations = []
  let wordCount = 3000
  let prose = ''
  const introducedEntities = [...intro]

  switch (scenario) {
    case 'missing-data':
      keyFacts.length = 0 // no key facts extracted -> integrity guard should flag, not crash
      break
    case 'invalid-data':
      // marked so harness feeds a malformed structured object to schema/integrity guard
      break
    case 'duplicate-data':
      keyFacts.push('The Threnody cult secretly plans to reignite the Convergence') // dup of ch5
      break
    case 'conflicting-updates':
      keyFacts.push('Elias Varn trusts Morrin Kael') // contradicts below with no transition
      keyFacts.push('Elias Varn distrusts Morrin Kael')
      break
    case 'out-of-order':
      // delivered out of order by the harness; ledger must still be chapter-ordered
      break
    case 'retry':
    case 'idempotency':
      // harness delivers this chapter id twice / re-pushes; must be idempotent
      break
    case 'partial-failure':
      metadataFailed = true // prose written, metadata extract failed (salvage path W1)
      break
    case 'failed-transaction':
      // harness makes pushOne throw once; must not duplicate on retry
      break
    case 'concurrent-update':
      // ch41 and ch42 both modify C1 trait; harness asserts deterministic resolution
      keyFacts.push('Elias Varn grows more paranoid after the Lattice tremor')
      break
    case 'stale-data':
      references.push({ to: 'ch-0033', kind: 'stale-read', note: 'reads pre-edit state of Duskwane Redoubt' })
      break
    case 'referential-violation':
      edges.push(['C1', 'C99', 'allied']) // C99 does not exist -> orphan
      break
    case 'flashback':
      // retroactive establishment allowed only because flashback:true
      introducedEntities.push('FX' + ch) // a pre-ch1 figure
      keyFacts.push(`Flashback: the First Convergence occurred generations before chapter 1`)
      break
    case 'boundary':
      wordCount = 0
      prose = ''
      keyFacts.push('(empty chapter placeholder)')
      break
    case 'large-payload':
      for (let i = 0; i < 200; i++) keyFacts.push(`Bulk fact ${i} recorded at the Convergence Plateau`)
      break
    case 'entity-change':
      negations.push('Elias Varn is free of the Echo') // ch20 established awake; ch90 possesses -> explicit transition
      break
    case 'recovery':
      // a chapter previously failed; harness re-delivers and expects consistency
      break
    case 'consequence':
      keyFacts.push('Pell the Cartographer influence is felt in the Ashlands')
      break
    case 'payoff':
      keyFacts.push('Pell the Cartographer map cipher unlocks the Second Tome')
      break
    case 'final':
      for (const t of THREADS) keyFacts.push(`Thread ${t} is resolved at the Final Convergence`)
      break
  }

  // Location transition between adjacent chapters must be acknowledged, or it is
  // a silent teleport at the seam. Record the journey so the seam validator can
  // confirm the move is justified rather than letting it pass silently.
  if (prevLoc && loc !== prevLoc) {
    keyFacts.push(`The company travels from ${LOC_NAME[prevLoc]} to ${LOC_NAME[loc]}.`)
  }

  if (!prose) {
    const names = charsPresent.map(id => CAST.find(c => c.id === id)?.name).filter(Boolean)
    prose = `Chapter ${ch}. At ${LOC_NAME[loc]}, ${names.slice(0, 3).join(', ') || 'the company'} moved through the fraying Lattice. ` +
      (keyFacts.length ? keyFacts.map(f => f + '.').join(' ') : 'The silence of the archive pressed close.')
  }

  const ending = flashback
    ? `Flashback: the memory of ${LOC_NAME[loc]} surfaces.`
    : `Chapter ${ch} ends with the Lattice unresolved at ${LOC_NAME[loc]}.`
  const continuesFrom = flashback ? null : (ch === 1 ? null : `ch-${String(ch - 1).padStart(4, '0')}`)

  chapters.push({
    id: `ch-${String(ch).padStart(4, '0')}`,
    chapterNumber: ch,
    title: scenario ? `Chapter ${ch} (${scenario})` : `Chapter ${ch}`,
    flashback,
    ending,
    continuesFrom,
    prose,
    summary: `Chapter ${ch} at ${LOC_NAME[loc]}.`,
    wordCount,
    location: loc,
    charactersPresent: charsPresent,
    introducedEntities,
    keyFacts,
    plotThreadsTouched: THREADS.filter((_, i) => (ch + i) % 3 === 0).slice(0, 3),
    edges,
    references,
    negations,
    scenario,
    metadataFailed,
    ingestOrder: scenario === 'out-of-order' ? 900 : ch // harness uses ingestOrder to deliver ch18 early
  })
  ledgerByChapter[ch] = keyFacts
  prevLoc = loc
}

mkdirSync('validation', { recursive: true })
writeFileSync('validation/novel-100-data.json', JSON.stringify({ cast: CAST, locations: LOCATIONS, threads: THREADS, firstSeen, chapters }, null, 2))
console.log(`Wrote validation/novel-100-data.json with ${chapters.length} chapters.`)
