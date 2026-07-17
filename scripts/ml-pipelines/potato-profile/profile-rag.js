/**
 * RAG search latency vs corpus size — the data that decides worker offload.
 *
 * Moving search into a Web Worker was deferred because it needs a cache-coherence
 * design (the chunker worker has no DB access, and the invalidation counter lives
 * on the main thread). Whether it is worth designing at all depends on one
 * number: how long a search blocks the main thread at realistic corpus sizes,
 * AFTER the optimisation work (unit-length Float32Array vectors -> dot product;
 * one-pass lexical scoring with a per-query regex).
 *
 * Rule of thumb: a main-thread stall under ~16ms is invisible (one frame);
 * under ~50ms is fine for something that runs once per scene; over ~100ms is
 * worth engineering away.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/profile-rag.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/profile-rag.js --sizes 1000,5000
 */

import 'fake-indexeddb/auto'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import { db } from '../../../src/services/db-core.js'
import { addResearchChunks, searchLexical, semanticSearch } from '../../../src/services/researchDb.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const SIZES = arg('sizes', '500,1500,4000,10000').split(',').map(Number)
const DIMS = 768 // nomic-embed-text
const QUERIES = 20
const say = (s = '') => console.log(s)

// Deterministic PRNG so runs are comparable.
let seed = 42
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const WORDS =
  'harbor ledger debt tide stove pier boat rope lamp oil net fleet chapel rumor signature brother collector town winter salt'.split(' ')

function sentence() {
  const n = 8 + Math.floor(rand() * 12)
  return Array.from({ length: n }, () => WORDS[Math.floor(rand() * WORDS.length)]).join(' ') + '.'
}

function chunkText() {
  return Array.from({ length: 12 }, sentence).join(' ')
}

function vector() {
  // Plain float64 arrays on purpose — that is what the API path stores today,
  // so the cache-boundary conversion cost is included in the first query.
  const v = new Array(DIMS)
  for (let i = 0; i < DIMS; i++) v[i] = rand() * 2 - 1
  return v
}

async function seedProject(projectId, n) {
  await db.researchChunks.where({ projectId }).delete()
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({
      projectId,
      documentId: `doc-${i % 20}`,
      chunkIndex: i,
      text: chunkText(),
      embedding: vector(),
      embeddingStatus: 'READY'
    })
  }
  await addResearchChunks(rows)
}

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b)
  const pick = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { p50: pick(0.5), p95: pick(0.95), max: s[s.length - 1] }
}

async function main() {
  say('RAG SEARCH LATENCY vs CORPUS SIZE  (post-optimisation, main thread)')
  say('='.repeat(78))
  say(`dims: ${DIMS}   queries/size: ${QUERIES}   vectors seeded as float64 (API shape)`)
  say()
  say(
    ['chunks'.padStart(7), 'lex p50'.padStart(9), 'lex p95'.padStart(9), 'sem p50'.padStart(9), 'sem p95'.padStart(9), 'cold*'.padStart(9)].join(' ')
  )
  say('-'.repeat(78))

  const rows = []
  for (const n of SIZES) {
    const projectId = `rag-profile-${n}`
    await seedProject(projectId, n)

    // Cold query: includes the IndexedDB read + Float32Array normalisation that
    // the chunk cache performs once per project per invalidation.
    const coldStart = performance.now()
    await semanticSearch(projectId, vector(), 5)
    const cold = performance.now() - coldStart

    const lex = []
    const sem = []
    for (let q = 0; q < QUERIES; q++) {
      const term = `${WORDS[q % WORDS.length]} ${WORDS[(q + 7) % WORDS.length]}`
      let t = performance.now()
      await searchLexical(projectId, term, 20)
      lex.push(performance.now() - t)

      t = performance.now()
      await semanticSearch(projectId, vector(), 5)
      sem.push(performance.now() - t)
    }

    const L = stats(lex)
    const S = stats(sem)
    rows.push({ chunks: n, lexical: L, semantic: S, coldMs: Math.round(cold) })
    say(
      [
        String(n).padStart(7),
        `${L.p50.toFixed(1)}ms`.padStart(9),
        `${L.p95.toFixed(1)}ms`.padStart(9),
        `${S.p50.toFixed(1)}ms`.padStart(9),
        `${S.p95.toFixed(1)}ms`.padStart(9),
        `${Math.round(cold)}ms`.padStart(9)
      ].join(' ')
    )
  }

  say()
  say('* cold = first query after (re)load: IndexedDB read + normalisation, paid')
  say('  once per project per cache invalidation, not per query.')
  say()

  const worst = rows[rows.length - 1]
  const worstWarm = Math.max(worst.lexical.p95, worst.semantic.p95)
  say('VERDICT')
  say('='.repeat(78))
  if (worstWarm < 16) {
    say(`  Warm p95 at ${worst.chunks} chunks is ${worstWarm.toFixed(1)}ms — under one frame.`)
    say('  Worker offload of SEARCH is not worth its cache-coherence design cost.')
  } else if (worstWarm < 50) {
    say(`  Warm p95 at ${worst.chunks} chunks is ${worstWarm.toFixed(1)}ms — noticeable but`)
    say('  acceptable for a once-per-scene operation. Worker offload optional.')
  } else {
    say(`  Warm p95 at ${worst.chunks} chunks is ${worstWarm.toFixed(1)}ms — a real stall.`)
    say('  Worker offload (or an ANN index) is justified at this corpus size.')
  }
  if (worst.coldMs > 100) {
    say(`  NOTE: the cold path costs ${worst.coldMs}ms and is retriggered by every`)
    say('  chunk mutation (global invalidation counter). If ingestion happens during')
    say('  generation, per-project invalidation matters more than worker search.')
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(
    resolve(REPORTS_DIR, 'rag-latency.json'),
    JSON.stringify({ generatedBy: 'profile-rag', dims: DIMS, rows }, null, 2)
  )
  say()
  say('Wrote reports/rag-latency.json')
}

main()
