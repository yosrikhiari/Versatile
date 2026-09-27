import {
  type Block,
  blocksFromHtml,
  blocksFromMarkdown,
  blocksFromText,
  escapeHtml,
  isBreakLine,
  stripGutenberg
} from './blocks'

/**
 * File -> blocks, for every format the novel importer takes. No new
 * dependencies: .docx and .epub are zip files of XML, read with `jszip`
 * (already used for export) and the browser's `DOMParser`.
 */

export type ManuscriptFormat = 'txt' | 'md' | 'docx' | 'epub' | 'html'

export interface Decoded {
  format: ManuscriptFormat
  blocks: Block[]
  title?: string
  author?: string
  /** How the text was decoded, when that was a guess worth showing. */
  encoding?: string
}

export function formatOf(name: string): ManuscriptFormat | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'txt' || ext === 'text') return 'txt'
  if (ext === 'md' || ext === 'markdown') return 'md'
  if (ext === 'docx') return 'docx'
  if (ext === 'epub') return 'epub'
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return 'html'
  return null
}

/**
 * Bytes -> text. UTF-8 when it is valid UTF-8, UTF-16 when a byte-order mark
 * says so, and Windows-1252 otherwise: an older .txt saved on Windows is
 * rarely anything else, and decoding it as UTF-8 turns every curly quote and
 * accented letter into U+FFFD.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8' }
  } catch {
    return { text: decodeWindows1252(bytes), encoding: 'windows-1252' }
  }
}

// 0x80-0x9F in Windows-1252 (curly quotes, dashes, the euro). Done by hand:
// runtimes without full ICU decode the label as Latin-1 and turn these into
// control characters.
const CP1252_HIGH =
  '\u20ac\ufffd\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\ufffd\u017d\ufffd' +
  '\ufffd\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\ufffd\u017e\u0178'

function decodeWindows1252(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) {
    out += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b)
  }
  return out
}

function parseXml(xml: string, type: DOMParserSupportedType = 'application/xml'): Document {
  return new DOMParser().parseFromString(xml, type)
}

/** Elements by local name, whatever namespace prefix the file uses. */
function byLocal(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === name)
}

function attrLocal(el: Element, name: string): string | null {
  for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value
  return null
}

// ── docx ───────────────────────────────────────────────────────────────────

/**
 * word/document.xml -> blocks. A paragraph whose style is a heading (Heading1,
 * Title, or a style whose name says "heading"), or whose outline level is set,
 * is a heading; a page break before a paragraph is not a scene break (Word
 * users put one before every chapter), but a centred "***" is.
 */
export async function docxBlocks(data: ArrayBuffer): Promise<Decoded> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(data)
  const docXml = await zip.file('word/document.xml')?.async('string')
  if (!docXml) throw new Error('This .docx has no document body (word/document.xml).')

  // Style id -> heading level, from the style names ("heading 1", "Title").
  const levels = new Map<string, number>()
  const stylesXml = await zip.file('word/styles.xml')?.async('string')
  if (stylesXml) {
    for (const st of byLocal(parseXml(stylesXml), 'style')) {
      const id = attrLocal(st, 'styleId') || ''
      const name = (byLocal(st, 'name')[0] && attrLocal(byLocal(st, 'name')[0], 'val')) || ''
      const m = name.match(/^heading\s*(\d)$/i)
      if (m) levels.set(id, Number(m[1]))
      else if (/^title$/i.test(name)) levels.set(id, 1)
    }
  }

  let title: string | undefined
  let author: string | undefined
  const core = await zip.file('docProps/core.xml')?.async('string')
  if (core) {
    const doc = parseXml(core)
    title = byLocal(doc, 'title')[0]?.textContent?.trim() || undefined
    author = byLocal(doc, 'creator')[0]?.textContent?.trim() || undefined
  }

  const blocks: Block[] = []
  for (const p of byLocal(parseXml(docXml), 'p')) {
    const pPr = byLocal(p, 'pPr')[0]
    const styleEl = pPr && byLocal(pPr, 'pStyle')[0]
    const styleId = styleEl ? attrLocal(styleEl, 'val') || '' : ''
    const outline = pPr && byLocal(pPr, 'outlineLvl')[0]
    let level =
      levels.get(styleId) ?? (/^heading(\d)$/i.test(styleId) ? Number(styleId.slice(7)) : 0)
    if (!level && outline) level = Number(attrLocal(outline, 'val') || 0) + 1

    let text = ''
    let html = ''
    for (const r of byLocal(p, 'r')) {
      const rPr = byLocal(r, 'rPr')[0]
      const on = (name: string) => {
        const el = rPr && byLocal(rPr, name)[0]
        if (!el) return false
        const v = attrLocal(el, 'val')
        return v == null || (v !== 'false' && v !== '0')
      }
      let piece = ''
      for (const c of Array.from(r.children)) {
        if (c.localName === 't') piece += c.textContent || ''
        else if (c.localName === 'tab') piece += ' '
        else if (c.localName === 'br' && attrLocal(c, 'type') !== 'page') piece += ' '
      }
      if (!piece) continue
      text += piece
      let h = escapeHtml(piece)
      if (on('i')) h = `<em>${h}</em>`
      if (on('b')) h = `<strong>${h}</strong>`
      html += h
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (level) {
      blocks.push({ kind: 'heading', level, text })
    } else if (isBreakLine(text)) {
      blocks.push({ kind: 'break' })
    } else {
      html = html
        .replace(/<\/em><em>|<\/strong><strong>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      blocks.push({
        kind: 'para',
        text,
        lines: [text],
        ...(html !== escapeHtml(text) ? { html } : {})
      })
    }
  }
  return { format: 'docx', blocks, title, author }
}

// ── epub ───────────────────────────────────────────────────────────────────

function resolvePath(base: string, href: string): string {
  const parts = (base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '')
    .concat(decodeURIComponent(href.split('#')[0]))
    .split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return out.join('/')
}

/**
 * container.xml -> the package (.opf) -> the spine, in reading order. Each
 * spine document is read as HTML; a `file` block marks where it starts, which
 * is the chapter boundary of an epub that has no headings.
 */
export async function epubBlocks(data: ArrayBuffer): Promise<Decoded> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(data)
  const container = await zip.file('META-INF/container.xml')?.async('string')
  if (!container) throw new Error('This .epub has no META-INF/container.xml.')
  const rootfile = byLocal(parseXml(container), 'rootfile')[0]
  const opfPath = rootfile && attrLocal(rootfile, 'full-path')
  const opfXml = opfPath && (await zip.file(opfPath)?.async('string'))
  if (!opfPath || !opfXml) throw new Error('This .epub has no package document.')
  const opf = parseXml(opfXml)

  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const item of byLocal(opf, 'item')) {
    manifest.set(attrLocal(item, 'id') || '', {
      href: attrLocal(item, 'href') || '',
      type: attrLocal(item, 'media-type') || '',
      props: attrLocal(item, 'properties') || ''
    })
  }
  const title = byLocal(opf, 'title')[0]?.textContent?.trim() || undefined
  const author = byLocal(opf, 'creator')[0]?.textContent?.trim() || undefined

  const blocks: Block[] = []
  for (const ref of byLocal(opf, 'itemref')) {
    if (attrLocal(ref, 'linear') === 'no') continue
    const item = manifest.get(attrLocal(ref, 'idref') || '')
    if (!item || item.props.includes('nav') || !/html/.test(item.type)) continue
    const path = resolvePath(opfPath, item.href)
    const xhtml = await zip.file(path)?.async('string')
    if (!xhtml) continue
    const doc = parseXml(xhtml, 'application/xhtml+xml')
    const parsed = doc.getElementsByTagName('parsererror').length
      ? parseXml(xhtml, 'text/html')
      : doc
    const inner = blocksFromHtml(parsed)
    if (!inner.length) continue
    blocks.push({ kind: 'file', name: path }, ...inner)
  }
  return { format: 'epub', blocks, title, author }
}

// ── everything ─────────────────────────────────────────────────────────────

export async function decodeFile(name: string, data: ArrayBuffer): Promise<Decoded> {
  const format = formatOf(name)
  if (!format) {
    throw new Error(
      `"${name}" is not a manuscript format Versatile reads (.txt, .md, .docx, .epub, .html).`
    )
  }
  if (format === 'docx') return docxBlocks(data)
  if (format === 'epub') return epubBlocks(data)
  const { text, encoding } = decodeText(new Uint8Array(data))
  if (format === 'md') return { format, blocks: blocksFromMarkdown(text), encoding }
  if (format === 'html') {
    return { format, blocks: blocksFromHtml(parseXml(text, 'text/html')), encoding }
  }
  const g = stripGutenberg(text)
  return { format, blocks: blocksFromText(g.text), title: g.title, author: g.author, encoding }
}
