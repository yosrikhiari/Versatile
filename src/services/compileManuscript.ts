/**
 * Compile — stitch the manuscript into one document (Longform Compile analog,
 * roadmap Phase 4).
 *
 * `compileMarkdown` is pure: volumes / sections / subsections in, Markdown
 * and stats out. The order is the narrative order — volumes by `order`, each
 * volume's sections by `order`, then sections that belong to no volume, then
 * each section's subsections by `order`. `volume.sectionIds` is not read: it
 * is derived on load and empty on disk (`volumeStore.ts`), and `chapterIds`
 * is a deleted legacy field.
 *
 * DOCX and EPUB writers are lazy: the libraries load only when that format
 * is asked for.
 */
import { getVolumes, getSections, getSubsections } from './db-structure'
import { getProject } from './db-projects'

export type TitleStyle = 'none' | 'section' | 'numbered'

export interface CompileWorkflow {
  /** How each section (chapter) is headed. */
  titleStyle?: TitleStyle
  /** Include scene titles as `###` headings. */
  includeSceneTitles?: boolean
  /** Drop a leading YAML `--- … ---` block from each scene. */
  stripFrontmatter?: boolean
  /** Between scenes of one section. */
  separator?: string
  /** Trim trailing whitespace, collapse 3+ blank lines. */
  postProcess?: boolean
  /** Only these section ids (in narrative order); empty = all. */
  sectionIds?: string[]
}

export interface CompileInput {
  volumes: any[]
  sections: any[]
  subsections: any[]
}

export interface CompiledSection {
  id: string
  title: string
  number: number
  volumeTitle: string | null
  scenes: Array<{ id: string; title: string; text: string }>
}

export interface CompileResult {
  markdown: string
  sections: CompiledSection[]
  stats: { volumes: number; sections: number; subsections: number; words: number }
}

const DEFAULTS: Required<Omit<CompileWorkflow, 'sectionIds'>> = {
  titleStyle: 'section',
  includeSceneTitles: false,
  stripFrontmatter: true,
  separator: '\n\n* * *\n\n',
  postProcess: true
}

export function stripFrontmatter(text: string): string {
  const t = text ?? ''
  if (!t.startsWith('---')) return t
  const end = t.indexOf('\n---', 3)
  if (end === -1) return t
  const after = t.indexOf('\n', end + 4)
  return after === -1 ? '' : t.slice(after + 1)
}

/** HTML from the editor → plain paragraphs; already-plain text passes through. */
export function proseToText(content: string | null | undefined): string {
  const raw = content ?? ''
  if (!/<[a-z][\s\S]*>/i.test(raw)) return raw
  return raw
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function byOrder(a: any, b: any): number {
  const d = (a?.order ?? a?.sortOrder ?? 0) - (b?.order ?? b?.sortOrder ?? 0)
  return d !== 0 ? d : String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
}

function countWords(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/** Sections in narrative order with the volume each belongs to. */
export function orderSections(volumes: any[], sections: any[]): Array<{ section: any; volume: any | null }> {
  const out: Array<{ section: any; volume: any | null }> = []
  const seen = new Set<string>()
  const vols = [...(volumes || [])].sort(byOrder)
  const secs = [...(sections || [])].sort(byOrder)
  for (const v of vols) {
    for (const s of secs) {
      if (String(s.volumeId) === String(v.id) && !seen.has(String(s.id))) {
        seen.add(String(s.id))
        out.push({ section: s, volume: v })
      }
    }
  }
  for (const s of secs) {
    if (!seen.has(String(s.id))) {
      seen.add(String(s.id))
      out.push({ section: s, volume: null })
    }
  }
  return out
}

export function compileMarkdown(input: CompileInput, workflow: CompileWorkflow = {}): CompileResult {
  const w = { ...DEFAULTS, ...workflow }
  const only = workflow.sectionIds?.length ? new Set(workflow.sectionIds.map(String)) : null
  const subsBySection = new Map<string, any[]>()
  for (const sub of input.subsections || []) {
    const key = String(sub.sectionId)
    const list = subsBySection.get(key)
    if (list) list.push(sub)
    else subsBySection.set(key, [sub])
  }
  for (const list of subsBySection.values()) list.sort(byOrder)

  const compiled: CompiledSection[] = []
  const parts: string[] = []
  let lastVolume: string | null = null
  let number = 0
  let words = 0
  let subsections = 0
  const volumesSeen = new Set<string>()

  for (const { section, volume } of orderSections(input.volumes, input.sections)) {
    if (only && !only.has(String(section.id))) continue
    number++
    const volumeTitle = volume?.name || volume?.title || null
    if (volume) volumesSeen.add(String(volume.id))
    if (volumeTitle && volumeTitle !== lastVolume && w.titleStyle !== 'none') {
      parts.push(`# ${volumeTitle}`)
      lastVolume = volumeTitle
    }
    const title = String(section.title || `Chapter ${number}`)
    if (w.titleStyle === 'section') parts.push(`## ${title}`)
    else if (w.titleStyle === 'numbered') parts.push(`## ${number}. ${title}`)

    const scenes: CompiledSection['scenes'] = []
    const sceneTexts: string[] = []
    const subs = subsBySection.get(String(section.id)) || []
    // A section with prose of its own and no scenes compiles its own body.
    const bodies = subs.length ? subs : section.content ? [{ id: section.id, title: '', content: section.content }] : []
    for (const sub of bodies) {
      let text = proseToText(sub.content)
      if (w.stripFrontmatter) text = stripFrontmatter(text)
      text = text.trim()
      if (!text) continue
      subsections++
      words += countWords(text)
      scenes.push({ id: String(sub.id), title: String(sub.title || ''), text })
      sceneTexts.push(w.includeSceneTitles && sub.title ? `### ${sub.title}\n\n${text}` : text)
    }
    if (sceneTexts.length) parts.push(sceneTexts.join(w.separator))
    compiled.push({ id: String(section.id), title, number, volumeTitle, scenes })
  }

  let markdown = parts.join('\n\n')
  if (w.postProcess) {
    markdown = markdown
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (markdown) markdown += '\n'
  }
  return {
    markdown,
    sections: compiled,
    stats: { volumes: volumesSeen.size, sections: compiled.length, subsections, words }
  }
}

export async function loadCompileInput(projectId: string): Promise<CompileInput> {
  const [volumes, sections, subsections] = await Promise.all([
    getVolumes(projectId),
    getSections(projectId),
    getSubsections(projectId)
  ])
  return { volumes, sections, subsections }
}

export async function compileManuscript(projectId: string, workflow: CompileWorkflow = {}): Promise<CompileResult> {
  return compileMarkdown(await loadCompileInput(projectId), workflow)
}

// ── DOCX ───────────────────────────────────────────────────────────────────

export async function buildDocx(result: CompileResult, title = 'Manuscript'): Promise<ArrayBuffer> {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docx
  const children: any[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE })
  ]
  let lastVolume: string | null = null
  result.sections.forEach((sec, i) => {
    if (sec.volumeTitle && sec.volumeTitle !== lastVolume) {
      children.push(new Paragraph({ text: sec.volumeTitle, heading: HeadingLevel.HEADING_1 }))
      lastVolume = sec.volumeTitle
    }
    children.push(
      new Paragraph({
        text: sec.title,
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: i > 0
      })
    )
    sec.scenes.forEach((scene, j) => {
      if (j > 0) children.push(new Paragraph({ children: [new TextRun('* * *')], alignment: 'center' as any }))
      for (const para of scene.text.split(/\n{2,}/)) {
        const p = para.replace(/\n/g, ' ').trim()
        if (p) children.push(new Paragraph({ children: [new TextRun(p)], spacing: { after: 200 } }))
      }
    })
  })
  const doc = new Document({ creator: 'Versatile', title, sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  return blob.arrayBuffer()
}

// ── EPUB (minimal, valid EPUB 3) ───────────────────────────────────────────

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function sceneHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${xmlEscape(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
}

export async function buildEpub(
  result: CompileResult,
  meta: { title?: string; author?: string; language?: string; identifier?: string } = {}
): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const title = meta.title || 'Manuscript'
  const author = meta.author || 'Versatile'
  const lang = meta.language || 'en'
  const id = meta.identifier || `urn:uuid:${crypto.randomUUID()}`
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  // The mimetype entry must be first and uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  )
  zip.file(
    'OEBPS/styles.css',
    `body{font-family:Georgia,serif;line-height:1.5;margin:1em}h1,h2{font-weight:normal}p{text-indent:1.2em;margin:0}p:first-of-type{text-indent:0}hr{border:0;text-align:center}`
  )

  const items: string[] = []
  const spine: string[] = []
  const nav: string[] = []
  const ncx: string[] = []
  result.sections.forEach((sec, i) => {
    const file = `chapter-${i + 1}.xhtml`
    const body = sec.scenes.map((s) => sceneHtml(s.text)).join('\n<hr/>\n')
    zip.file(
      `OEBPS/${file}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>${xmlEscape(sec.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body><section epub:type="chapter"><h2>${xmlEscape(sec.title)}</h2>
${body}
</section></body></html>`
    )
    items.push(`<item id="ch${i + 1}" href="${file}" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="ch${i + 1}"/>`)
    nav.push(`<li><a href="${file}">${xmlEscape(sec.title)}</a></li>`)
    ncx.push(
      `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlEscape(sec.title)}</text></navLabel><content src="${file}"/></navPoint>`
    )
  })

  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${nav.join('\n')}
</ol></nav></body></html>`
  )
  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${xmlEscape(id)}"/></head>
<docTitle><text>${xmlEscape(title)}</text></docTitle>
<navMap>${ncx.join('')}</navMap>
</ncx>`
  )
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${xmlEscape(id)}</dc:identifier>
<dc:title>${xmlEscape(title)}</dc:title>
<dc:creator>${xmlEscape(author)}</dc:creator>
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="styles.css" media-type="text/css"/>
${items.join('\n')}
</manifest>
<spine toc="ncx">${spine.join('')}</spine>
</package>`
  )
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
}

// ── downloads ──────────────────────────────────────────────────────────────

export function safeFilename(name: string, ext: string): string {
  const base = (name || 'manuscript').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'manuscript'
  return `${base}.${ext}`
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export type CompileFormat = 'markdown' | 'docx' | 'epub'

/** Compile the project and hand the file to the browser. Returns the stats. */
export async function exportCompiled(
  projectId: string,
  format: CompileFormat,
  workflow: CompileWorkflow = {}
): Promise<CompileResult['stats']> {
  const [result, project] = await Promise.all([compileManuscript(projectId, workflow), getProject(projectId)])
  const title = project?.name || 'Manuscript'
  if (format === 'markdown') {
    triggerDownload(new Blob([result.markdown], { type: 'text/markdown' }), safeFilename(title, 'md'))
  } else if (format === 'docx') {
    const buf = await buildDocx(result, title)
    triggerDownload(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      safeFilename(title, 'docx')
    )
  } else {
    const blob = await buildEpub(result, { title, author: project?.author || undefined })
    triggerDownload(blob, safeFilename(title, 'epub'))
  }
  return result.stats
}
