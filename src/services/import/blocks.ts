/**
 * The one shape every manuscript format is read into before its structure is
 * worked out (WHATIF-AND-IMPORT-PLAN.md, step 2). Decoders only have to say
 * what is a heading, what is a paragraph and where the author put a break;
 * `structure.ts` decides what is a part, a chapter or a scene.
 */

export type Block =
  /** An explicit heading (docx Heading n, epub/html h1-h6, markdown #). */
  | { kind: 'heading'; level: number; text: string }
  /**
   * A paragraph. `lines` keeps the source's line breaks, which is how a
   * heading looks in a plain-text book ("I." over "Introduction"); `html` is
   * the paragraph's inline markup when the source had any.
   */
  | { kind: 'para'; text: string; lines: string[]; html?: string }
  /** A scene break the author typed (`***`, `#`, a rule). */
  | { kind: 'break' }
  /** The start of a new file inside an epub (a chapter boundary when there are no headings). */
  | { kind: 'file'; name: string }

const BREAK_RE = /^\s*(?:[*#~•·×◇◆⁂]\s*){1,7}\s*$|^\s*(?:-\s*){3,}$|^\s*(?:_\s*){3,}$/

export function isBreakLine(line: string): boolean {
  return BREAK_RE.test(line)
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function wordCount(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)
  return m ? m.length : 0
}

// Gutenberg's own header and licence are not the book.
const START_RE = /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*$/im
const END_RE = /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*$/im

export interface StrippedText {
  text: string
  /** `Title:` / `Author:` from a Project Gutenberg header, when present. */
  title?: string
  author?: string
}

export function stripGutenberg(raw: string): StrippedText {
  const start = raw.match(START_RE)
  if (!start || start.index == null) return { text: raw }
  const header = raw.slice(0, start.index)
  const title = header.match(/^Title:\s*(.+)$/m)?.[1]?.trim()
  const author = header.match(/^Author:\s*(.+)$/m)?.[1]?.trim()
  let body = raw.slice(start.index + start[0].length)
  const end = body.match(END_RE)
  if (end && end.index != null) body = body.slice(0, end.index)
  return { text: body, title, author }
}

/** Plain text: paragraphs are separated by blank lines; hard-wrapped lines are joined. */
export function blocksFromText(text: string, { italics = true } = {}): Block[] {
  const blocks: Block[] = []
  const paras = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)
  for (const p of paras) {
    const lines = p
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim())
    if (!lines.length) continue
    if (lines.length === 1 && isBreakLine(lines[0])) {
      blocks.push({ kind: 'break' })
      continue
    }
    const joined = lines.map((l) => l.trim()).join(' ')
    // Project Gutenberg marks italics as _word_.
    const html = italics
      ? escapeHtml(joined).replace(
          /(^|[\s(“"‘'])_([^_\n]+?)_(?=[\s.,;:!?)”"’']|$)/g,
          '$1<em>$2</em>'
        )
      : undefined
    const text = italics ? joined.replace(/(^|[\s(“"‘'])_([^_\n]+?)_/g, '$1$2') : joined
    blocks.push({
      kind: 'para',
      text,
      lines: lines.map((l) => l.trim()),
      ...(html && html !== escapeHtml(text) ? { html } : {})
    })
  }
  return blocks
}

/** Markdown: `#` headings, `***` / `---` breaks, `*em*` and `**strong**`. */
export function blocksFromMarkdown(md: string): Block[] {
  const out: Block[] = []
  const text = md.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '') // front matter
  for (const p of text.split(/\n[ \t]*\n+/)) {
    const lines = p.split('\n').filter((l) => l.trim())
    if (!lines.length) continue
    const h = lines[0].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (h) {
      out.push({ kind: 'heading', level: h[1].length, text: h[2].trim() })
      if (lines.length > 1) out.push(...blocksFromMarkdown(lines.slice(1).join('\n')))
      continue
    }
    if (lines.length === 1 && isBreakLine(lines[0])) {
      out.push({ kind: 'break' })
      continue
    }
    const joined = lines.map((l) => l.trim()).join(' ')
    const plain = joined
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2')
      .replace(/(^|\s)_(.+?)_/g, '$1$2')
    const html = escapeHtml(joined)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/(^|\s)_(.+?)_/g, '$1<em>$2</em>')
    out.push({
      kind: 'para',
      text: plain,
      lines: lines.map((l) => l.trim()),
      ...(html !== escapeHtml(plain) ? { html } : {})
    })
  }
  return out
}

/** Inline markup worth keeping from HTML/XHTML/docx: emphasis only. */
function inlineHtml(el: Element): string {
  let out = ''
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += escapeHtml(n.textContent || '')
    else if (n.nodeType === 1) {
      const tag = (n as Element).tagName.toLowerCase()
      const inner = inlineHtml(n as Element)
      if (tag === 'em' || tag === 'i') out += `<em>${inner}</em>`
      else if (tag === 'strong' || tag === 'b') out += `<strong>${inner}</strong>`
      else if (tag === 'br') out += ' '
      else out += inner
    }
  })
  return out
}

const BLOCK_TAGS = new Set(['p', 'div', 'blockquote', 'li', 'pre'])

/** HTML / XHTML (an epub chapter, a saved web page). */
export function blocksFromHtml(doc: Document): Block[] {
  const out: Block[] = []
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase().replace(/^.*:/, '')
      const h = tag.match(/^h([1-6])$/)
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim()
      if (h) {
        if (text) out.push({ kind: 'heading', level: Number(h[1]), text })
      } else if (tag === 'hr') {
        out.push({ kind: 'break' })
      } else if (BLOCK_TAGS.has(tag) && !child.querySelector('p, div, h1, h2, h3, h4, h5, h6')) {
        if (!text) continue
        if (isBreakLine(text)) {
          out.push({ kind: 'break' })
          continue
        }
        const html = inlineHtml(child).replace(/\s+/g, ' ').trim()
        out.push({
          kind: 'para',
          text,
          lines: [text],
          ...(html !== escapeHtml(text) ? { html } : {})
        })
      } else if (tag !== 'script' && tag !== 'style' && tag !== 'head' && tag !== 'nav') {
        walk(child)
      }
    }
  }
  walk(doc.body || doc.documentElement)
  return out
}
