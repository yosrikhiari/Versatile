import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { blocksFromText, blocksFromMarkdown, stripGutenberg } from '@/services/import/blocks'
import { detectStructure, romanToInt } from '@/services/import/structure'

/**
 * WHATIF-AND-IMPORT-PLAN.md gates G1 (no word lost) and G2 (chapters found)
 * on six real books (Project Gutenberg, public domain; reports/live/ is local,
 * so these skip on a checkout without them) plus small hand-made texts.
 */

const RAW = 'reports/live/masterpieces/raw'
const BOOKS = [
  // file, expected chapters, the first and last chapter titles
  ['pg13415.txt', 9, 'The Lady with the Dog', 'The Husband'],
  ['pg1429.txt', 15, 'At the Bay', 'The Lady’s Maid'],
  ['pg1661.txt', 12, 'A Scandal in Bohemia', 'The Adventure of the Copper Beeches'],
  ['pg2814.txt', 15, 'The Sisters', 'The Dead'],
  ['pg35.txt', 17, 'Introduction', 'Epilogue'],
  ['pg4517.txt', 10, 'Prologue', 'IX']
]

function parse(file) {
  const g = stripGutenberg(readFileSync(`${RAW}/${file}`, 'utf8'))
  return detectStructure(blocksFromText(g.text), { title: g.title, author: g.author })
}

const chaptersOf = (book) => book.parts.flatMap((p) => p.chapters)

describe.skipIf(!existsSync(RAW))('Gutenberg books', () => {
  it.each(BOOKS)('%s: %i chapters, every word accounted for', (file, n, first, last) => {
    const book = parse(file)
    const ch = chaptersOf(book)
    const a = book.accounting
    expect(a.scenes + a.frontMatter + a.backMatter + a.headings).toBe(a.total)
    // Front/back matter and headings are a sliver of a book, not a chapter of it.
    expect((a.frontMatter + a.backMatter + a.headings) / a.total).toBeLessThan(0.03)
    expect(ch.map((c) => c.title)).toHaveLength(n)
    expect(ch[0].title).toBe(first)
    expect(ch.at(-1).title).toBe(last)
    expect(ch.every((c) => c.scenes.length > 0)).toBe(true)
  })

  it('reads the parts inside a Holmes story as its scenes', () => {
    const ch = chaptersOf(parse('pg1661.txt'))
    expect(ch[0].scenes.map((s) => s.title)).toEqual(['I', 'II', 'III'])
  })

  it('keeps Ethan Frome’s epitaph as prose, not a chapter', () => {
    const ch = chaptersOf(parse('pg4517.txt'))
    const text = ch[4].scenes.flatMap((s) => s.paragraphs.map((p) => p.text)).join(' ')
    expect(text).toContain('SACRED TO THE MEMORY OF')
  })
})

describe('small texts', () => {
  it('CHAPTER headings, scene breaks, a closing THE END', () => {
    const text = [
      'My Book',
      'By A. Writer',
      'CHAPTER 1',
      'It began here. '.repeat(20),
      '* * *',
      'Later that night. '.repeat(10),
      'CHAPTER 2: The Turn',
      'Then it turned. '.repeat(20),
      'THE END'
    ].join('\n\n')
    const book = detectStructure(blocksFromText(text))
    const ch = chaptersOf(book)
    expect(book.method).toBe('numbering')
    expect(ch.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2. The Turn'])
    expect(ch[0].scenes.map((s) => s.title)).toEqual(['Scene 1', 'Scene 2'])
    expect(ch[1].scenes[0].title).toBe('Chapter 2. The Turn')
    expect(book.backMatter).toEqual(['THE END'])
    expect(book.author).toBe('A. Writer')
    const a = book.accounting
    expect(a.scenes + a.frontMatter + a.backMatter + a.headings).toBe(a.total)
  })

  it('markdown headings: # parts over ## chapters, ### scenes', () => {
    const md = [
      '# Part One',
      '## The Arrival',
      'She came by boat.',
      '### Later',
      'The boat left.',
      '## The Storm',
      'Rain.',
      '# Part Two',
      '## After',
      'Quiet.'
    ].join('\n\n')
    const book = detectStructure(blocksFromMarkdown(md))
    expect(book.method).toBe('headings')
    expect(book.parts.map((p) => [p.title, p.chapters.map((c) => c.title)])).toEqual([
      ['Part One', ['The Arrival', 'The Storm']],
      ['Part Two', ['After']]
    ])
    expect(book.parts[0].chapters[0].scenes.map((s) => s.title)).toEqual(['Scene 1', 'Later'])
    const a = book.accounting
    expect(a.scenes + a.frontMatter + a.backMatter + a.headings).toBe(a.total)
  })

  it('a text with no structure is one chapter, with a warning', () => {
    const book = detectStructure(blocksFromText('Just words. '.repeat(50)))
    expect(chaptersOf(book)).toHaveLength(1)
    expect(book.warnings[0]).toMatch(/No chapters/)
  })

  it('Gutenberg _italics_ become <em>', () => {
    const [b] = blocksFromText('She was _very_ tired.')
    expect(b.text).toBe('She was very tired.')
    expect(b.html).toBe('She was <em>very</em> tired.')
  })

  it('roman numerals', () => {
    expect([romanToInt('IV'), romanToInt('xiv'), romanToInt('MCMXC'), romanToInt('bad')]).toEqual([
      4,
      14,
      1990,
      null
    ])
  })
})

describe('preview edits', async () => {
  const { renameChapter, mergeIntoPrevious, excludeChapter, allChapters } =
    await import('@/services/import/bookEdits')
  const text = ['CHAPTER 1', 'One one.', 'CHAPTER 2', 'Two two.', 'CHAPTER 3', 'Three.'].join(
    '\n\n'
  )
  const base = () => detectStructure(blocksFromText(text))
  const sum = (b) =>
    b.accounting.scenes + b.accounting.frontMatter + b.accounting.backMatter + b.accounting.headings

  it('rename keeps everything else', () => {
    const b = renameChapter(base(), 1, '  The Turn ')
    expect(allChapters(b).map((c) => c.title)).toEqual(['Chapter 1', 'The Turn', 'Chapter 3'])
    expect(allChapters(base())[1].title).toBe('Chapter 2')
  })

  it('merge folds a chapter and its heading into the previous one, losing no word', () => {
    const before = base()
    const b = mergeIntoPrevious(before, 1)
    expect(allChapters(b).map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 3'])
    expect(allChapters(b)[0].scenes.map((s) => s.title)).toEqual(['Scene 1', 'Scene 2'])
    expect(allChapters(b)[0].scenes[1].paragraphs.map((p) => p.text)).toEqual([
      'Chapter 2',
      'Two two.'
    ])
    expect(sum(b)).toBe(before.accounting.total)
    expect(mergeIntoPrevious(before, 0)).toBe(before)
  })

  it('exclude moves the chapter text out and keeps the accounting whole', () => {
    const before = base()
    const b = excludeChapter(before, 2)
    expect(allChapters(b)).toHaveLength(2)
    expect(b.frontMatter).toContain('Three.')
    expect(sum(b)).toBe(before.accounting.total)
  })
})
