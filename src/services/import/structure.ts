import { type Block, escapeHtml, wordCount } from './blocks'

/**
 * Parts, chapters and scenes from a flat list of blocks
 * (WHATIF-AND-IMPORT-PLAN.md, step 2).
 *
 * The author's structure wins; nothing is invented. In order of trust:
 *
 * 1. Explicit headings (docx/epub/markdown/html). The two most used levels
 *    become parts and chapters when the upper one is rare, otherwise the most
 *    used level is the chapter level; headings below it split scenes.
 * 2. The book's own table of contents. Its entries are found again, in order,
 *    as standalone lines later in the text. A contents page is the author's
 *    list of chapters, which no line-shape guess can beat -- it is how
 *    "THE SISTERS" is known to be a story title and "SACRED TO THE MEMORY OF"
 *    (an epitaph in Ethan Frome) is not.
 * 3. Numbered headings ("CHAPTER 4", "IV.", "Stave Three") whose numbers run
 *    1, 2, 3... A numbering that restarts at 1 is a level below chapters.
 *
 * Inside a chapter, scenes are split at the author's breaks (`***`) and at
 * numbered sub-headings that run from 1 ("I." "II." inside a Holmes story).
 * Text before the first chapter is front matter unless it is long, in which
 * case it is the book's opening (Ethan Frome's frame story) and becomes a
 * prologue. Every word ends up in a scene, in front/back matter, or in a
 * heading -- `accounting` says how many in each, so a lost word is a test failure.
 */

export interface ImportedScene {
  title: string
  paragraphs: Array<{ text: string; html?: string }>
  words: number
}

export interface ImportedChapter {
  title: string
  kind: 'chapter' | 'prologue' | 'epilogue'
  scenes: ImportedScene[]
}

export interface ImportedPart {
  title: string | null
  chapters: ImportedChapter[]
}

export interface ImportedBook {
  title: string
  author: string
  parts: ImportedPart[]
  frontMatter: string[]
  backMatter: string[]
  method: 'headings' | 'contents' | 'numbering' | 'files' | 'none'
  warnings: string[]
  accounting: {
    total: number
    scenes: number
    frontMatter: number
    backMatter: number
    headings: number
  }
}

// ── small helpers ──────────────────────────────────────────────────────────

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }

export function romanToInt(s: string): number | null {
  const r = s.toLowerCase()
  if (!/^[ivxlcdm]+$/.test(r)) return null
  let total = 0
  for (let i = 0; i < r.length; i++) {
    const v = ROMAN[r[i]]
    const next = ROMAN[r[i + 1]] || 0
    total += v < next ? -v : v
  }
  return total > 0 && total < 4000 ? total : null
}

const WORD_NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty'
]

function numberOf(token: string): number | null {
  if (/^\d{1,3}$/.test(token)) return Number(token)
  const w = WORD_NUMBERS.indexOf(token.toLowerCase())
  if (w > 0) return w
  return romanToInt(token)
}

/** Lower-case letters and digits only, words single-spaced: how headings are compared. */
export function key(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const NUMERAL_RE = /^(\d{1,3}|[ivxlcdm]{1,7})\b\.?\s*/i

/** An entry or heading without its leading numeral: "IV. The Morlocks" -> "the morlocks". */
function titleKey(s: string): string {
  return key(s.replace(NUMERAL_RE, ''))
}

function numeralKey(s: string): string {
  const m = s.trim().match(NUMERAL_RE)
  return m ? String(numberOf(m[1]) ?? '') : ''
}

// A paragraph's `text` is what is stored (Gutenberg `_italics_` already
// unmarked, which changes the word count: "_maman_'s" is one word).
function textOf(b: Block): string {
  return b.kind === 'para' || b.kind === 'heading' ? b.text : ''
}

/** A paragraph shaped like a heading: one or two short lines. */
function isShort(b: Block): boolean {
  if (b.kind !== 'para') return false
  return b.lines.length <= 2 && wordCount(b.text) <= 12 && b.text.length <= 100
}

const KEYWORD_RE =
  /^(chapter|chapitre|cap[ií]tulo|kapitel|stave|book|part|volume|letter)\s+(\d{1,3}|[ivxlcdm]{1,7}|[a-z]+)\b[.:]?\s*(.*)$/i
const BARE_RE = /^(\d{1,3}|[ivxlcdm]{1,7})\.?$/i
const BARE_TITLED_RE = /^(\d{1,3}|[ivxlcdm]{1,7})\.\s+(\S.*)$/i
const SPECIAL_RE = /^(prologue|epilogue|introduction|interlude|afterword|foreword|preface)\b/i
const END_MARK_RE = /^(the end|finis|fin|end)\.?$/i

interface Numbered {
  kind: string
  n: number
}

/** The numbering a heading-shaped paragraph carries, if any. */
function numbering(b: Block): Numbered | null {
  if (b.kind !== 'para' && b.kind !== 'heading') return null
  if (b.kind === 'para' && !isShort(b)) return null
  const first = b.kind === 'para' ? b.lines[0] : b.text
  const kw = first.match(KEYWORD_RE)
  if (kw) {
    const n = numberOf(kw[2])
    if (n != null) return { kind: kw[1].toLowerCase(), n }
  }
  const bare = first.match(BARE_RE)
  if (bare) {
    const n = numberOf(bare[1])
    if (n != null) return { kind: 'bare', n }
  }
  const titled = first.match(BARE_TITLED_RE)
  // "I. A SCANDAL IN BOHEMIA": a numeral then a title in capitals.
  if (titled && titled[2] === titled[2].toUpperCase() && /\p{L}/u.test(titled[2])) {
    const n = numberOf(titled[1])
    if (n != null) return { kind: 'titled', n }
  }
  return null
}

/** Longest run 1, 2, 3... in order, and whether the numbering restarts at 1 later. */
function sequence(nums: number[]): { run: number; restarts: boolean } {
  let expected = 1
  let run = 0
  let restarts = false
  for (const n of nums) {
    if (n === expected) {
      run++
      expected++
    } else if (n === 1 && run > 0) {
      restarts = true
    }
  }
  return { run, restarts }
}

function displayTitle(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t !== t.toUpperCase() || !/\p{L}/u.test(t)) return t
  // ALL CAPS -> Title Case, keeping small words small and Roman numerals whole.
  const small = new Set([
    'a',
    'an',
    'the',
    'of',
    'in',
    'on',
    'and',
    'to',
    'at',
    'with',
    'for',
    'by'
  ])
  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) =>
      /^[ivxlc]+\.?$/.test(w) && romanToInt(w.replace('.', '')) != null
        ? w.toUpperCase()
        : i > 0 && small.has(w)
          ? w
          : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ')
}

// ── chapter boundaries ─────────────────────────────────────────────────────

interface Boundary {
  index: number
  title: string
  kind: ImportedChapter['kind']
  /** Blocks from `index` that are the heading itself (1, or 2 for "I." + "Introduction"). */
  span: number
  /** A part/book heading above this chapter, if the chapter opens a part. */
  part?: string
  /** Where that part heading is, so it is not read as the previous chapter's text. */
  partIndex?: number
}

function kindOf(title: string): ImportedChapter['kind'] {
  const m = title.match(SPECIAL_RE)
  if (!m) return 'chapter'
  const w = m[1].toLowerCase()
  return w === 'epilogue' || w === 'afterword' ? 'epilogue' : 'prologue'
}

function fromHeadings(blocks: Block[]): { bounds: Boundary[]; sceneLevel: number | null } | null {
  const levels = new Map<number, number>()
  for (const b of blocks)
    if (b.kind === 'heading') levels.set(b.level, (levels.get(b.level) || 0) + 1)
  const total = [...levels.values()].reduce((a, b) => a + b, 0)
  if (total < 2) return null
  const sorted = [...levels.keys()].sort((a, b) => a - b)
  // The chapter level is the most used level; a rarer level above it is parts.
  const chapterLevel = [...levels.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
  const partLevel = sorted.find((l) => l < chapterLevel) ?? null
  const sceneLevel = sorted.find((l) => l > chapterLevel) ?? null
  const bounds: Boundary[] = []
  let part: { title: string; index: number } | undefined
  blocks.forEach((b, i) => {
    if (b.kind !== 'heading') return
    if (partLevel != null && b.level === partLevel) part = { title: b.text, index: i }
    if (b.level === chapterLevel) {
      bounds.push({
        index: i,
        title: b.text,
        kind: kindOf(b.text),
        span: 1,
        ...(part ? { part: part.title, partIndex: part.index } : {})
      })
      part = undefined
    }
  })
  return { bounds, sceneLevel }
}

function fromContents(blocks: Block[]): Boundary[] | null {
  const at = blocks.findIndex((b) => isShort(b) && /^(table of )?contents$/.test(key(textOf(b))))
  if (at < 0) return null
  // A contents page is one block per entry, or one block holding every entry
  // on its own line.
  const entries: string[] = []
  let i = at + 1
  const first = () => entries[0]
  const matches = (entry: string, b: Block) => {
    const t = textOf(b)
    return (
      key(t) === key(entry) ||
      (titleKey(entry) !== '' && titleKey(t) === titleKey(entry)) ||
      (titleKey(entry) === '' && numeralKey(t) !== '' && numeralKey(t) === numeralKey(entry))
    )
  }
  for (; i < blocks.length && entries.length < 300; i++) {
    const b = blocks[i]
    if (b.kind !== 'para') break
    if (entries.length && isShort(b) && matches(first(), b)) break
    if (isShort(b)) {
      entries.push(b.lines.length === 2 && numeralKey(b.lines[0]) ? b.lines.join(' ') : b.text)
    } else if (b.lines.every((l) => wordCount(l) <= 12)) {
      entries.push(...b.lines)
    } else break
  }
  if (entries.length < 2) return null
  const tocEnd = i
  const bounds: Boundary[] = []
  let from = tocEnd
  for (const entry of entries) {
    for (let j = from; j < blocks.length; j++) {
      const b = blocks[j]
      if (!isShort(b) && b.kind !== 'heading') continue
      if (matches(entry, b)) {
        // "I." over "Introduction" as two paragraphs: the title is the next block.
        const next = blocks[j + 1]
        const twoBlock =
          next && isShort(next) && titleKey(entry) !== '' && key(textOf(next)) === titleKey(entry)
        const title = displayTitle(entry.replace(NUMERAL_RE, '').trim() || entry)
        bounds.push({ index: j, title, kind: kindOf(title), span: twoBlock ? 2 : 1 })
        from = j + (twoBlock ? 2 : 1)
        break
      }
    }
  }
  if (bounds.length < Math.max(2, Math.ceil(entries.length * 0.6))) return null
  return bounds
}

function fromNumbering(blocks: Block[]): Boundary[] | null {
  const byKind = new Map<string, Array<{ index: number; n: number }>>()
  blocks.forEach((b, index) => {
    const num = numbering(b)
    if (!num) return
    if (!byKind.has(num.kind)) byKind.set(num.kind, [])
    byKind.get(num.kind)!.push({ index, n: num.n })
  })
  let best: { kind: string; run: number } | null = null
  for (const [kind, list] of byKind) {
    if (kind === 'part' || kind === 'book' || kind === 'volume') continue
    const { run, restarts } = sequence(list.map((x) => x.n))
    if (restarts || run < 2) continue
    if (!best || run > best.run) best = { kind, run }
  }
  if (!best) return null
  const parts = [...(byKind.get('part') || []), ...(byKind.get('book') || [])].sort(
    (a, b) => a.index - b.index
  )
  const bounds: Boundary[] = []
  let expected = 1
  for (const { index } of byKind.get(best.kind)!) {
    const num = numbering(blocks[index])!
    if (num.n !== expected) continue
    expected++
    const b = blocks[index]
    const lines = b.kind === 'para' ? b.lines : [textOf(b)]
    const rest = lines[0].replace(KEYWORD_RE, '$3').replace(BARE_TITLED_RE, '$2')
    const subtitle = [best.kind === 'bare' ? '' : rest, ...lines.slice(1)]
      .filter((s) => s && !BARE_RE.test(s))
      .join(' ')
    const label =
      best.kind === 'bare' || best.kind === 'titled'
        ? String(
            romanToInt(lines[0].replace(/[.\s].*$/, '')) ? lines[0].replace(/\..*$/, '') : num.n
          )
        : `${best.kind.charAt(0).toUpperCase()}${best.kind.slice(1)} ${num.n}`
    const title = displayTitle(subtitle ? `${label}. ${subtitle}` : label)
    const part = [...parts]
      .reverse()
      .find((p) => p.index < index && p.index > (bounds.at(-1)?.index ?? -1))
    bounds.push({
      index,
      title,
      kind: 'chapter',
      span: 1,
      ...(part ? { part: displayTitle(textOf(blocks[part.index])), partIndex: part.index } : {})
    })
  }
  return bounds
}

function fromFiles(blocks: Block[]): Boundary[] | null {
  const bounds: Boundary[] = []
  blocks.forEach((b, i) => {
    if (b.kind !== 'file') return
    const next = blocks.slice(i + 1).find((x) => x.kind !== 'file')
    if (!next) return
    const title =
      next && isShort(next) ? displayTitle(textOf(next)) : `Chapter ${bounds.length + 1}`
    bounds.push({ index: i, title, kind: kindOf(title), span: next && isShort(next) ? 2 : 1 })
  })
  return bounds.length >= 2 ? bounds : null
}

// ── scenes ─────────────────────────────────────────────────────────────────

function para(b: Block) {
  return b.kind === 'para'
    ? { text: b.text, ...(b.html ? { html: b.html } : {}) }
    : { text: textOf(b) }
}

/** Split one chapter's body into scenes; returns the heading words consumed. */
function scenesOf(
  body: Block[],
  chapterTitle: string,
  sceneLevel: number | null
): { scenes: ImportedScene[]; headingWords: number } {
  // Numbered sub-headings count only when they run from 1 inside this chapter.
  const subs = new Set<number>()
  const nums = body.map((b) => {
    const n = numbering(b)
    return n && (n.kind === 'bare' || n.kind === 'titled') ? n.n : null
  })
  let expected = 1
  nums.forEach((n, i) => {
    if (n === expected) {
      subs.add(i)
      expected++
    }
  })
  if (subs.size < 2) subs.clear()

  const scenes: ImportedScene[] = []
  let cur: ImportedScene | null = null
  let headingWords = 0
  const open = (title: string) => {
    if (cur && cur.paragraphs.length === 0 && !title) return
    cur = { title, paragraphs: [], words: 0 }
    scenes.push(cur)
  }
  body.forEach((b, i) => {
    // A file boundary inside a chapter is where a publisher split a long
    // chapter across files, not a scene break; only the author's breaks count.
    if (b.kind === 'file') return
    if (b.kind === 'break') {
      if (cur && cur.paragraphs.length) open('')
      return
    }
    if (subs.has(i)) {
      headingWords += wordCount(textOf(b))
      open(displayTitle(textOf(b).replace(/^(\S+)\.$/, '$1')))
      return
    }
    if (b.kind === 'heading') {
      // A scene-level heading opens a scene; any other (a part heading, a
      // stray level) is structure, not prose.
      headingWords += wordCount(b.text)
      if (sceneLevel != null && b.level >= sceneLevel) open(b.text)
      return
    }
    if (!cur) open('')
    const p = para(b)
    cur!.paragraphs.push(p)
    cur!.words += wordCount(p.text)
  })
  const kept = scenes.filter((s) => s.paragraphs.length)
  const single = kept.length === 1
  kept.forEach((s, k) => {
    if (!s.title) s.title = single ? chapterTitle : `Scene ${k + 1}`
  })
  return { scenes: kept, headingWords }
}

// ── the book ───────────────────────────────────────────────────────────────

export interface DetectOptions {
  title?: string
  author?: string
  /** Words before the first chapter above which that text is the book's opening, not front matter. */
  prologueWords?: number
}

export function detectStructure(blocks: Block[], opts: DetectOptions = {}): ImportedBook {
  const prologueWords = opts.prologueWords ?? 300
  const warnings: string[] = []
  const total = blocks.reduce((n, b) => n + wordCount(textOf(b)), 0)

  let method: ImportedBook['method'] = 'none'
  let bounds: Boundary[] | null = null
  let sceneLevel: number | null = null
  const headed = fromHeadings(blocks)
  if (headed && headed.bounds.length >= 1) {
    method = 'headings'
    bounds = headed.bounds
    sceneLevel = headed.sceneLevel
  }
  if (!bounds) {
    bounds = fromContents(blocks)
    if (bounds) method = 'contents'
  }
  if (!bounds) {
    bounds = fromNumbering(blocks)
    if (bounds) method = 'numbering'
  }
  if (!bounds) {
    bounds = fromFiles(blocks)
    if (bounds) method = 'files'
  }
  if (!bounds || !bounds.length) {
    warnings.push('No chapters were found; the whole text is one chapter. Split it in the preview.')
    bounds = [
      {
        index: blocks.findIndex((b) => b.kind === 'para'),
        title: 'Chapter 1',
        kind: 'chapter',
        span: 0
      }
    ]
    if (bounds[0].index < 0) bounds[0].index = 0
  }

  // Front matter / prologue: everything before the first chapter.
  const frontMatter: string[] = []
  let frontWords = 0
  let headingWords = 0
  const chapters: Array<ImportedChapter & { part?: string }> = []
  const partAt = new Set(bounds.map((b) => b.partIndex).filter((i): i is number => i != null))
  const pre = blocks.slice(0, bounds[0].index).filter((_, i) => !partAt.has(i))
  const firstLong = pre.findIndex((b) => b.kind === 'para' && !isShort(b))
  const contentsAt = pre.findIndex(
    (b) => isShort(b) && /^(table of )?contents$/.test(key(textOf(b)))
  )
  const openingStart = firstLong < 0 ? pre.length : firstLong
  const opening = pre.slice(openingStart).filter((b) => b.kind === 'para' || b.kind === 'break')
  const openingWords = opening.reduce((n, b) => n + wordCount(textOf(b)), 0)
  const openingIsBook =
    openingWords >= prologueWords && (contentsAt < 0 || contentsAt < openingStart)
  for (const b of openingIsBook ? pre.slice(0, openingStart) : pre) {
    const t = textOf(b)
    if (!t) continue
    frontMatter.push(t)
    frontWords += wordCount(t)
  }
  if (openingIsBook) {
    const { scenes, headingWords: hw } = scenesOf(opening, 'Prologue', sceneLevel)
    headingWords += hw
    chapters.push({ title: 'Prologue', kind: 'prologue', scenes })
  }

  // Chapters. Part headings sit just before a chapter, inside the previous
  // chapter's range; they are taken out and counted as headings.
  for (const i of partAt) headingWords += wordCount(textOf(blocks[i]))
  bounds.forEach((bd, k) => {
    const end = k + 1 < bounds!.length ? bounds![k + 1].index : blocks.length
    for (let s = 0; s < bd.span; s++) {
      const hb = blocks[bd.index + s]
      if (hb) headingWords += wordCount(textOf(hb))
    }
    const body = blocks
      .slice(bd.index + bd.span, end)
      .filter((_, j) => !partAt.has(bd.index + bd.span + j))
    const { scenes, headingWords: hw } = scenesOf(body, bd.title, sceneLevel)
    headingWords += hw
    chapters.push({ title: bd.title, kind: bd.kind, scenes, ...(bd.part ? { part: bd.part } : {}) })
  })

  // Back matter: a closing "THE END" (and anything after it) in the last scene.
  const backMatter: string[] = []
  let backWords = 0
  const last = chapters.at(-1)?.scenes.at(-1)
  if (last) {
    const endAt = last.paragraphs.findIndex((p) => END_MARK_RE.test(p.text.trim()))
    if (endAt >= 0) {
      for (const p of last.paragraphs.splice(endAt)) {
        backMatter.push(p.text)
        backWords += wordCount(p.text)
      }
      last.words = last.paragraphs.reduce((n, p) => n + wordCount(p.text), 0)
    }
  }
  for (const c of chapters) c.scenes = c.scenes.filter((s) => s.paragraphs.length)
  const emptyChapters = chapters.filter((c) => !c.scenes.length)
  if (emptyChapters.length) {
    warnings.push(
      `${emptyChapters.length} chapter heading(s) had no text under them: ${emptyChapters
        .slice(0, 3)
        .map((c) => `"${c.title}"`)
        .join(', ')}`
    )
  }

  // Parts.
  const parts: ImportedPart[] = []
  for (const c of chapters.filter((c) => c.scenes.length)) {
    const { part, ...chapter } = c
    if (!parts.length || part) parts.push({ title: part ? displayTitle(part) : null, chapters: [] })
    parts.at(-1)!.chapters.push(chapter)
  }

  const sceneWords = parts
    .flatMap((p) => p.chapters)
    .flatMap((c) => c.scenes)
    .reduce((n, s) => n + s.words, 0)

  return {
    title: opts.title || frontMatter[0] || 'Imported book',
    author: opts.author || frontMatter.find((t) => /^by\s+/i.test(t))?.replace(/^by\s+/i, '') || '',
    parts,
    frontMatter,
    backMatter,
    method,
    warnings,
    accounting: {
      total,
      scenes: sceneWords,
      frontMatter: frontWords,
      backMatter: backWords,
      headings: headingWords
    }
  }
}

/** A scene's paragraphs as the HTML a subsection stores. */
export function sceneHtml(scene: ImportedScene): string {
  return scene.paragraphs.map((p) => `<p>${p.html ?? escapeHtml(p.text)}</p>`).join('')
}
