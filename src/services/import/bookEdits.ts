import type { ImportedBook, ImportedChapter } from './structure'

/**
 * The corrections the import preview offers, as pure functions over an
 * ImportedBook (each returns a new book). Chapters are addressed by their
 * position in reading order across all parts.
 */

function locate(book: ImportedBook, index: number) {
  let i = index
  for (const [pi, part] of book.parts.entries()) {
    if (i < part.chapters.length) return { pi, ci: i }
    i -= part.chapters.length
  }
  return null
}

function clone(book: ImportedBook): ImportedBook {
  return {
    ...book,
    parts: book.parts.map((p) => ({
      ...p,
      chapters: p.chapters.map((c) => ({ ...c, scenes: [...c.scenes] }))
    })),
    frontMatter: [...book.frontMatter],
    backMatter: [...book.backMatter],
    accounting: { ...book.accounting }
  }
}

export function allChapters(book: ImportedBook): ImportedChapter[] {
  return book.parts.flatMap((p) => p.chapters)
}

export function renameChapter(book: ImportedBook, index: number, title: string): ImportedBook {
  const at = locate(book, index)
  const t = title.trim()
  if (!at || !t) return book
  const out = clone(book)
  out.parts[at.pi].chapters[at.ci].title = t
  return out
}

/**
 * Fold a chapter into the one before it: its scenes follow that chapter's
 * scenes (a chapter detected at a false heading -- "SACRED TO THE MEMORY OF"
 * -- goes back to being text). The folded chapter's title becomes the first
 * line of its first scene, so no word is lost.
 */
export function mergeIntoPrevious(book: ImportedBook, index: number): ImportedBook {
  if (index <= 0) return book
  const at = locate(book, index)
  const prev = locate(book, index - 1)
  if (!at || !prev) return book
  const out = clone(book)
  const [moved] = out.parts[at.pi].chapters.splice(at.ci, 1)
  const target = out.parts[prev.pi].chapters[prev.ci]
  const scenes = moved.scenes.map((s) => ({ ...s, paragraphs: [...s.paragraphs] }))
  if (scenes.length) {
    scenes[0].paragraphs.unshift({ text: moved.title })
    const w = moved.title.split(/\s+/).filter(Boolean).length
    scenes[0].words += w
    out.accounting.scenes += w
    out.accounting.headings -= w
  }
  target.scenes = [...target.scenes, ...scenes].map((s, k, all) => ({
    ...s,
    title:
      /^Scene \d+$/.test(s.title) || s.title === target.title || s.title === moved.title
        ? all.length === 1
          ? target.title
          : `Scene ${k + 1}`
        : s.title
  }))
  out.parts = out.parts.filter((p) => p.chapters.length)
  return out
}

/** Leave a chapter out of the import (a contents page read as a chapter, an index). */
export function excludeChapter(book: ImportedBook, index: number): ImportedBook {
  const at = locate(book, index)
  if (!at) return book
  const out = clone(book)
  const [gone] = out.parts[at.pi].chapters.splice(at.ci, 1)
  const words = gone.scenes.reduce((n, s) => n + s.words, 0)
  out.accounting.scenes -= words
  out.accounting.frontMatter += words
  out.frontMatter.push(...gone.scenes.flatMap((s) => s.paragraphs.map((p) => p.text)))
  out.parts = out.parts.filter((p) => p.chapters.length)
  return out
}
