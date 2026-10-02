/**
 * Opening-image reuse, measured (issue #66, UX-AUDIT #59). No model call:
 * the generated scenes already on disk against the chapter openings of six
 * published books, so the measure has a human baseline before it is used to
 * judge a fix.
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/openingReuse.measure.live.js
 *
 * Writes reports/live/opening-reuse/baseline.json.
 */
import { it } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { bookOpeningReuse } from '../../services/generation/openingReuse'

const ROOT = join(__dirname, '../../..')
const OUT = join(ROOT, 'reports/live/opening-reuse')

/**
 * Names the measure should not count as images: capitalised words a book
 * repeats and never writes in lower case ("Nesrin" opens sentences too, so
 * position alone does not find it). The shipped check takes names from the
 * story bible instead.
 */
export function guessNames(text) {
  const lower = new Set(text.match(/(?<![\p{L}'])\p{Ll}[\p{L}']*/gu) || [])
  const counts = new Map()
  for (const w of text.match(/(?<![\p{L}'])\p{Lu}\p{Ll}{2,}/gu) || [])
    counts.set(w, (counts.get(w) || 0) + 1)
  return [...counts.entries()]
    .filter(([w, n]) => n >= 3 && !lower.has(w.toLowerCase()))
    .map(([w]) => w)
}

/** A Gutenberg book's chapters (or stories): split at heading lines. */
function gutenbergChapters(file) {
  let text = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
  const start = text.search(/\*\*\* ?START OF/)
  const end = text.search(/\*\*\* ?END OF/)
  if (start >= 0) text = text.slice(text.indexOf('\n', start) + 1, end > start ? end : undefined)
  const blocks = text.split(/\n\s*\n/)
  const chapters = []
  let current = null
  for (const block of blocks) {
    const line = block.trim()
    // "I.\n Introduction" (The Time Machine) is a heading on two lines.
    const first = line.split('\n')[0].trim()
    const heading =
      line.length > 0 &&
      line.length <= 80 &&
      line.split('\n').length <= 2 &&
      /^[A-Z0-9 .,'’:;!?\-—"]+$/.test(first) &&
      /[A-Z]/.test(first)
    if (heading) {
      if (current) chapters.push(current)
      current = { title: line, text: '' }
    } else if (current) {
      current.text += line.replace(/\s+/g, ' ') + '\n\n'
    }
  }
  if (current) chapters.push(current)
  // Contents pages and part titles are headings with no prose under them.
  return chapters.filter((c) => c.text.split(/\s+/).length >= 400)
}

it('measures opening-image reuse in generated and published books', () => {
  mkdirSync(OUT, { recursive: true })
  const rows = []

  const labelled = JSON.parse(
    readFileSync(join(ROOT, 'reports/live/labelling/scenes.json'), 'utf-8')
  ).scenes
  const bySource = new Map()
  for (const s of labelled) {
    if (!bySource.has(s.source)) bySource.set(s.source, [])
    bySource.get(s.source).push(s)
  }
  for (const [source, scenes] of bySource) {
    scenes.sort((a, b) => Number(a.order) - Number(b.order))
    const proses = scenes.map((s) => String(s.prose || ''))
    const names = guessNames(proses.join('\n'))
    rows.push({ kind: 'generated', book: source, names, ...bookOpeningReuse(proses, names) })
  }

  const rawDir = join(ROOT, 'reports/live/masterpieces/raw')
  for (const f of readdirSync(rawDir).filter((x) => x.endsWith('.txt'))) {
    const chapters = gutenbergChapters(join(rawDir, f))
    const proses = chapters.map((c) => c.text)
    const names = guessNames(proses.join('\n'))
    const title = (readFileSync(join(rawDir, f), 'utf-8').match(/Title:\s*(.+)/) || [])[1]
    rows.push({
      kind: 'published',
      book: `${f} ${title?.trim()}`,
      names,
      ...bookOpeningReuse(proses, names)
    })
  }

  writeFileSync(join(OUT, 'baseline.json'), JSON.stringify(rows, null, 2))
  for (const r of rows) {
    console.log(
      `${r.kind.padEnd(9)} ${r.book.slice(0, 44).padEnd(44)} scenes ${String(r.scenes).padStart(3)}  reusing ${String(r.reusing).padStart(3)}  share ${(r.share * 100).toFixed(0).padStart(3)}%  top ${r.repeated
        .slice(0, 4)
        .map(([p, n]) => `${p}×${n}`)
        .join(', ')}`
    )
  }
})
