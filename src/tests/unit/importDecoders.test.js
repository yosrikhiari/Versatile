import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { decodeFile, decodeText, formatOf } from '@/services/import/decoders'
import { detectStructure } from '@/services/import/structure'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function wp(text, { style, italic } = {}) {
  const ppr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
  const rpr = italic ? '<w:rPr><w:i/></w:rPr>' : ''
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

async function docx(paragraphs) {
  const zip = new JSZip()
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${W}><w:body>${paragraphs.join('')}</w:body></w:document>`
  )
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles ${W}><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Kapitel"><w:name w:val="heading 2"/></w:style></w:styles>`
  )
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Lighthouse</dc:title><dc:creator>M. Keeper</dc:creator></cp:coreProperties>`
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function epub(chapters, { headings = true } = {}) {
  const zip = new JSZip()
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  )
  const items = chapters
    .map((_, i) => `<item id="c${i}" href="text/ch${i}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('')
  const spine = chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Salt Road</dc:title><dc:creator>A. Caravan</dc:creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items}</manifest><spine>${spine}</spine></package>`
  )
  chapters.forEach(([title, paras], i) => {
    const h = headings ? `<h2>${title}</h2>` : `<p>${title}</p>`
    zip.file(
      `OEBPS/text/ch${i}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${h}${paras.map((p) => `<p>${p}</p>`).join('')}</body></html>`
    )
  })
  return zip.generateAsync({ type: 'arraybuffer' })
}

const chapters = (book) => book.parts.flatMap((p) => p.chapters)

describe('docx', () => {
  it('reads heading styles (by id and by style name), italics and core properties', async () => {
    const data = await docx([
      wp('One', { style: 'Heading1' }),
      wp('The lamp was lit.'),
      wp('She saw a ', {}) + wp('ship', { italic: true }),
      wp('***'),
      wp('Night fell.'),
      wp('Two', { style: 'Kapitel' }),
      wp('Morning.')
    ])
    const d = await decodeFile('book.docx', data)
    expect(d.title).toBe('The Lighthouse')
    expect(d.author).toBe('M. Keeper')
    const book = detectStructure(d.blocks)
    // One heading at each level: the upper one is the chapter, the lower a scene.
    expect(chapters(book).map((c) => c.title)).toEqual(['One'])
    expect(chapters(book)[0].scenes.map((s) => s.title)).toEqual(['Scene 1', 'Scene 2', 'Two'])
    expect(d.blocks.filter((b) => b.kind === 'heading').map((b) => b.level)).toEqual([1, 2])
    expect(d.blocks.find((b) => b.kind === 'para' && b.text === 'ship').html).toBe('<em>ship</em>')
    expect(d.blocks.some((b) => b.kind === 'break')).toBe(true)
  })

  it('chapters at Heading 1 with scene breaks', async () => {
    const data = await docx([
      wp('Chapter One', { style: 'Heading1' }),
      wp('A.'),
      wp('* * *'),
      wp('B.'),
      wp('Chapter Two', { style: 'Heading1' }),
      wp('C.')
    ])
    const book = detectStructure((await decodeFile('b.docx', data)).blocks)
    expect(chapters(book).map((c) => [c.title, c.scenes.length])).toEqual([
      ['Chapter One', 2],
      ['Chapter Two', 1]
    ])
  })
})

describe('epub', () => {
  it('follows the spine, skips the nav document, reads headings', async () => {
    const data = await epub([
      ['The Well', ['Water.', 'More <em>water</em>.']],
      ['The Dunes', ['Sand.']]
    ])
    const d = await decodeFile('salt.epub', data)
    expect(d.title).toBe('Salt Road')
    const book = detectStructure(d.blocks)
    expect(book.method).toBe('headings')
    expect(chapters(book).map((c) => c.title)).toEqual(['The Well', 'The Dunes'])
    expect(chapters(book)[0].scenes[0].paragraphs[1].html).toBe('More <em>water</em>.')
  })

  it('an epub without headings splits chapters at its files', async () => {
    const data = await epub(
      [
        ['I', ['First.']],
        ['II', ['Second.']],
        ['III', ['Third.']]
      ],
      { headings: false }
    )
    const book = detectStructure((await decodeFile('x.epub', data)).blocks)
    expect(chapters(book)).toHaveLength(3)
  })
})

describe('text decoding', () => {
  it('UTF-8, UTF-16 with a BOM, and Windows-1252 when it is not UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('﻿café')).text).toBe('café')
    const le = new Uint8Array([0xff, 0xfe, 0x63, 0, 0xe9, 0])
    expect(decodeText(le)).toEqual({ text: 'cé', encoding: 'utf-16le' })
    // "“Hé”" in Windows-1252: 0x93 H 0xE9 0x94
    expect(decodeText(new Uint8Array([0x93, 0x48, 0xe9, 0x94]))).toEqual({
      text: '“Hé”',
      encoding: 'windows-1252'
    })
  })

  it('knows its formats and refuses others', async () => {
    expect(['a.TXT', 'b.md', 'c.docx', 'd.epub', 'e.htm', 'f.pdf'].map(formatOf)).toEqual([
      'txt',
      'md',
      'docx',
      'epub',
      'html',
      null
    ])
    await expect(decodeFile('f.pdf', new ArrayBuffer(0))).rejects.toThrow(/not a manuscript format/)
  })
})
