/**
 * Offline audit of committed prose — repetition, cross-scene reuse, opening
 * collapse — read straight out of the browser's IndexedDB.
 *
 * Written because the reports/ corpus only ever held old smoke-test output while
 * the real manuscript lived in the browser and could not be inspected. A live
 * audit found 45% of committed prose was duplicate text and one scene carried a
 * single sentence 131 times; none of the existing tooling could see any of it.
 *
 * No AI calls, no dev server, no app running. Pure computation over stored text,
 * so it can run any time and its numbers are reproducible.
 *
 *   node scripts/audit-manuscript.mjs                    # autodetect the browser profile
 *   node scripts/audit-manuscript.mjs --idb <leveldb-dir>
 *   node scripts/audit-manuscript.mjs --json <export.json>
 *   node scripts/audit-manuscript.mjs --fail-over 0.15   # non-zero exit past a threshold
 *
 * The IndexedDB files are copied before reading and never written to.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
  statSync
} from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', 'reports')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const say = (...a) => console.log(...a)

// ── Locating the database ────────────────────────────────────────────────────
// IndexedDB is origin- AND profile-scoped, so the same app in two browsers has
// two unrelated databases. Ranking by mtime picks the one actually in use.
const PROFILE_CANDIDATES = [
  ['Edge', 'Microsoft/Edge/User Data/Default/IndexedDB'],
  ['Chrome', 'Google/Chrome/User Data/Default/IndexedDB'],
  ['Brave', 'BraveSoftware/Brave-Browser/User Data/Default/IndexedDB']
]

function autodetectIdb(port) {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null
  const found = []
  for (const [label, rel] of PROFILE_CANDIDATES) {
    const dir = join(localAppData, rel, `http_localhost_${port}.indexeddb.leveldb`)
    if (!existsSync(dir)) continue
    let newest = 0
    for (const f of readdirSync(dir)) {
      if (!/\.(log|ldb)$/.test(f)) continue
      const { mtimeMs } = statSafe(join(dir, f))
      if (mtimeMs > newest) newest = mtimeMs
    }
    found.push({ label, dir, newest })
  }
  if (found.length === 0) return null
  found.sort((a, b) => b.newest - a.newest)
  return found[0]
}

function statSafe(p) {
  try {
    return statSync(p)
  } catch {
    return { mtimeMs: 0 }
  }
}

/** Copy out of the live profile; the browser holds a lock on LOCK. */
function snapshotIdb(dir) {
  const dest = join(tmpdir(), `versatile-idb-${Date.now()}`)
  mkdirSync(dest, { recursive: true })
  const copied = []
  for (const f of readdirSync(dir)) {
    if (!/\.(log|ldb)$/.test(f)) continue
    try {
      copyFileSync(join(dir, f), join(dest, f))
      copied.push(join(dest, f))
    } catch {
      // A file being compacted mid-read is expected; the rest still gives a
      // representative sample.
    }
  }
  return copied
}

// ── LevelDB write-ahead log ──────────────────────────────────────────────────
// 32 KiB blocks, each record prefixed with crc(4) len(2) type(1). A value larger
// than the remaining block is split across records, so scanning raw bytes
// truncates long scenes at block boundaries — the records must be reassembled.
const BLOCK = 32768

function readWal(buf) {
  const out = []
  let off = 0
  let partial = []
  while (off + 7 <= buf.length) {
    const inBlock = off % BLOCK
    if (BLOCK - inBlock < 7) {
      off += BLOCK - inBlock
      continue
    }
    const len = buf.readUInt16LE(off + 4)
    const type = buf[off + 6]
    if (len === 0 && type === 0) {
      off += BLOCK - inBlock
      continue
    }
    const payload = buf.subarray(off + 7, off + 7 + len)
    off += 7 + len
    if (type === 1) out.push(payload)
    else if (type === 2) partial = [payload]
    else if (type === 3) partial.push(payload)
    else if (type === 4) {
      partial.push(payload)
      out.push(Buffer.concat(partial))
      partial = []
    } else break
  }
  return Buffer.concat(out)
}

// ── Extracting prose ─────────────────────────────────────────────────────────
// V8 stores these strings two-byte (UTF-16LE). A naive "high byte is zero" scan
// breaks on em-dashes and curly quotes — which is every other sentence in real
// prose — so runs were capped around 1.4k chars until this decoded properly.
function isTextCp(cp) {
  if (cp === 9 || cp === 10 || cp === 13) return true
  if (cp < 32) return false
  if (cp >= 0xd800 && cp <= 0xdfff) return false
  return cp <= 0x2e7f
}

function extractUtf16Runs(buf, minLen = 400) {
  const runs = []
  for (const start of [0, 1]) {
    let cur = []
    for (let i = start; i + 1 < buf.length; i += 2) {
      const cp = buf[i] | (buf[i + 1] << 8)
      if (isTextCp(cp)) cur.push(String.fromCharCode(cp))
      else {
        if (cur.length >= minLen) runs.push(cur.join(''))
        cur = []
      }
    }
    if (cur.length >= minLen) runs.push(cur.join(''))
  }
  return runs
}

function collectScenes(files) {
  const raw = []
  for (const f of files) {
    const buf = readFileSync(f)
    const body = f.endsWith('.log') ? readWal(buf) : buf
    for (const run of extractUtf16Runs(body)) {
      if (run.includes('<p>')) raw.push(run.slice(run.indexOf('<p>')))
    }
  }
  // The WAL keeps every historical version of an edited scene, and the two-parity
  // scan sees each twice. Keep only runs that are not a substring of a longer one.
  const sorted = [...new Set(raw)].sort((a, b) => b.length - a.length)
  const kept = []
  for (const t of sorted) if (!kept.some((k) => k.includes(t))) kept.push(t)
  return kept.filter((t) => words(strip(t)).length >= 200)
}

// ── Analysis ─────────────────────────────────────────────────────────────────
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const words = (t) => t.toLowerCase().match(/[a-z']+/g) || []
const sentences = (t) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)

function duplicateStats(text) {
  const seen = new Set()
  const kept = []
  for (const s of sentences(text)) {
    const key = s.toLowerCase().replace(/\s+/g, ' ')
    if (key.split(' ').length >= 5) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    kept.push(s)
  }
  const total = words(text).length
  const unique = words(kept.join(' ')).length
  return { total, unique, ratio: total ? +(1 - unique / total).toFixed(3) : 0 }
}

function worstNgram(text, n = 6) {
  const w = words(text)
  const counts = new Map()
  for (let i = 0; i + n <= w.length; i++) {
    const g = w.slice(i, i + n).join(' ')
    counts.set(g, (counts.get(g) || 0) + 1)
  }
  let best = ['', 0]
  for (const [g, c] of counts) if (c > best[1]) best = [g, c]
  return { ngram: best[0], count: best[1] }
}

function crossSceneReuse(texts, minWords = 8) {
  const where = new Map()
  texts.forEach((t, i) => {
    for (const s of sentences(t)) {
      if (s.split(/\s+/).length < minWords) continue
      const key = s.toLowerCase().replace(/\s+/g, ' ')
      if (!where.has(key)) where.set(key, { scenes: new Set(), count: 0, sample: s })
      const e = where.get(key)
      e.scenes.add(i)
      e.count++
    }
  })
  return [...where.values()]
    .filter((e) => e.scenes.size > 1)
    .sort((a, b) => b.scenes.size - a.scenes.size || b.count - a.count)
    .map((e) => ({ scenes: e.scenes.size, occurrences: e.count, sentence: e.sample.slice(0, 120) }))
}

/** Shared leading words between two openings — scene-beat collapse, cheaply. */
function openingCollapse(texts) {
  const openings = texts.map((t) => sentences(t)[0] || '')
  const groups = []
  openings.forEach((o, i) => {
    const w = words(o).slice(0, 6).join(' ')
    const hit = groups.find((g) => g.prefix === w)
    if (hit) hit.scenes.push(i)
    else groups.push({ prefix: w, scenes: [i] })
  })
  return groups.filter((g) => g.scenes.length > 1)
}

// ── Main ─────────────────────────────────────────────────────────────────────
const jsonPath = arg('json', null)
const idbPath = arg('idb', null)
const port = arg('port', '5173')
const failOver = Number(arg('fail-over', NaN))

let scenes = []
let source = ''

if (jsonPath) {
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const rows = data.subsections || data.scenes || (Array.isArray(data) ? data : [])
  scenes = rows.map((r) => r.content || r.prose || '').filter((t) => words(strip(t)).length >= 200)
  source = jsonPath
} else {
  let dir = idbPath
  if (!dir) {
    const found = autodetectIdb(port)
    if (!found) {
      say(`No IndexedDB found for http://localhost:${port}. Pass --idb <dir> or --json <export>.`)
      process.exit(2)
    }
    dir = found.dir
    say(`Using ${found.label} profile: ${dir}`)
  }
  scenes = collectScenes(snapshotIdb(dir))
  source = dir
}

if (scenes.length === 0) {
  say('No prose found. If the app stores scenes elsewhere, pass --json an export instead.')
  process.exit(2)
}

const plain = scenes.map(strip)
const perScene = plain.map((t, i) => {
  const dup = duplicateStats(t)
  const ng = worstNgram(t)
  return { scene: i, words: dup.total, uniqueWords: dup.unique, duplicateRatio: dup.ratio, worstNgram: ng }
})

const totalWords = perScene.reduce((s, r) => s + r.words, 0)
const totalUnique = perScene.reduce((s, r) => s + r.uniqueWords, 0)
const overall = totalWords ? +(1 - totalUnique / totalWords).toFixed(3) : 0
const reuse = crossSceneReuse(plain)
const openings = openingCollapse(plain)

say('')
say('MANUSCRIPT AUDIT')
say('='.repeat(78))
say(`  source: ${source}`)
say(`  scenes: ${scenes.length}   words: ${totalWords}   unique: ${totalUnique}`)
say(`  overall duplicate share: ${Math.round(overall * 100)}%`)
say('')
say('  scene    words    uniq    dup%   worst 6-gram')
say('  ' + '-'.repeat(74))
for (const r of perScene) {
  say(
    `  ${String(r.scene).padStart(5)} ${String(r.words).padStart(8)} ${String(r.uniqueWords).padStart(7)} ${String(Math.round(r.duplicateRatio * 100)).padStart(6)}%   ${r.worstNgram.count}x "${r.worstNgram.ngram.slice(0, 40)}"`
  )
}

if (reuse.length) {
  say('')
  say(`  CROSS-SCENE REUSE — ${reuse.length} sentences appear verbatim in 2+ scenes:`)
  for (const r of reuse.slice(0, 8)) {
    say(`    in ${r.scenes} scenes (${r.occurrences}x): "${r.sentence}"`)
  }
}

if (openings.length) {
  say('')
  say('  OPENING COLLAPSE — scenes sharing their first six words:')
  for (const g of openings) say(`    scenes [${g.scenes.join(', ')}]: "${g.prefix}"`)
}

mkdirSync(REPORTS_DIR, { recursive: true })
const outPath = resolve(REPORTS_DIR, 'manuscript-audit.json')
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedBy: 'audit-manuscript',
      source,
      sceneCount: scenes.length,
      totalWords,
      totalUniqueWords: totalUnique,
      overallDuplicateRatio: overall,
      perScene,
      crossSceneReuse: reuse.slice(0, 50),
      openingCollapse: openings
    },
    null,
    2
  )
)
if (!jsonPath) {
  say('')
  say('  NOTE — coverage is partial when reading IndexedDB directly. The write-ahead')
  say('  log holds writes since the last compaction, and SSTable blocks are usually')
  say('  Snappy-compressed and unreadable here, so older scenes may be missing. The')
  say('  per-scene ratios are exact for what was read; the scene COUNT is a floor.')
  say('  Export the project and pass --json for a complete audit.')
}

say('')
say(`  wrote ${outPath}`)

if (Number.isFinite(failOver) && overall > failOver) {
  say(`  FAIL: duplicate share ${Math.round(overall * 100)}% exceeds threshold ${Math.round(failOver * 100)}%`)
  process.exit(1)
}
