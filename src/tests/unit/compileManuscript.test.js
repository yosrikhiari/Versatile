import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import JSZip from 'jszip'
import { db } from '@/services/db-core'
import {
  compileMarkdown,
  compileManuscript,
  stripFrontmatter,
  proseToText,
  buildDocx,
  buildEpub,
  safeFilename
} from '@/services/compileManuscript'

const INPUT = {
  volumes: [
    { id: 'v2', name: 'Book Two', order: 1 },
    { id: 'v1', name: 'Book One', order: 0 }
  ],
  sections: [
    { id: 'c3', title: 'Return', order: 0, volumeId: 'v2' },
    { id: 'c2', title: 'Salt', order: 1, volumeId: 'v1' },
    { id: 'c1', title: 'Debt', order: 0, volumeId: 'v1' },
    { id: 'c4', title: 'Loose', order: 5, volumeId: null, content: '<p>An unfiled chapter.</p>' }
  ],
  subsections: [
    { id: 's2', sectionId: 'c1', title: 'The scale', order: 1, content: '<p>Two.</p>' },
    {
      id: 's1',
      sectionId: 'c1',
      title: 'The letter',
      order: 0,
      content: '---\npov: Nesrin\n---\n<p>One <b>bold</b>.</p>'
    },
    { id: 's3', sectionId: 'c2', title: '', order: 0, content: '<p>Three.</p><p>Still three.</p>' },
    { id: 's4', sectionId: 'c3', title: 'Home', order: 0, content: '<p>Four.</p>' },
    { id: 's5', sectionId: 'c3', title: 'Empty', order: 1, content: '' }
  ]
}

describe('compileMarkdown (pure)', () => {
  it('walks volumes → sections → scenes in narrative order, unfiled sections last', () => {
    const r = compileMarkdown(INPUT)
    expect(r.sections.map((s) => s.title)).toEqual(['Debt', 'Salt', 'Return', 'Loose'])
    expect(r.markdown).toBe(
      [
        '# Book One',
        '## Debt',
        'One bold.',
        '* * *',
        'Two.',
        '## Salt',
        'Three.',
        'Still three.',
        '# Book Two',
        '## Return',
        'Four.',
        '## Loose',
        'An unfiled chapter.'
      ].join('\n\n') + '\n'
    )
    expect(r.stats).toEqual({ volumes: 2, sections: 4, subsections: 5, words: 10 })
  })

  it('title style, scene titles, separator and frontmatter are workflow options', () => {
    const numbered = compileMarkdown(INPUT, {
      titleStyle: 'numbered',
      includeSceneTitles: true,
      separator: '\n\n---\n\n',
      stripFrontmatter: false
    })
    expect(numbered.markdown).toContain('## 1. Debt')
    expect(numbered.markdown).toContain('### The letter')
    expect(numbered.markdown).toContain('pov: Nesrin')
    expect(numbered.markdown).toContain('\n---\n')

    const bare = compileMarkdown(INPUT, { titleStyle: 'none' })
    expect(bare.markdown).not.toMatch(/^#/m)
  })

  it('can compile a subset of sections and stays total on empty input', () => {
    const one = compileMarkdown(INPUT, { sectionIds: ['c2'] })
    expect(one.sections.map((s) => s.id)).toEqual(['c2'])
    expect(compileMarkdown({ volumes: [], sections: [], subsections: [] }).markdown).toBe('')
  })

  it('helpers: frontmatter, html, filenames', () => {
    expect(stripFrontmatter('---\na: 1\n---\nbody')).toBe('body')
    expect(stripFrontmatter('no fm')).toBe('no fm')
    expect(proseToText('<p>A &amp; B</p><p>C</p>')).toBe('A & B\n\nC\n\n')
    expect(safeFilename('The Salt Road: run 6', 'docx')).toBe('The_Salt_Road_run_6.docx')
  })
})

describe('DOCX and EPUB writers', () => {
  const result = compileMarkdown(INPUT)

  it('builds a DOCX whose archive holds word/document.xml with the chapter headings', async () => {
    const buf = await buildDocx(result, 'Salt Road')
    const bytes = new Uint8Array(buf)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml').async('string')
    expect(xml).toContain('Salt Road')
    expect(xml).toContain('Debt')
    expect(xml).toContain('Return')
    expect(xml).toContain('An unfiled chapter.')
  }, 20_000)

  it('builds a valid EPUB 3: stored mimetype first, container, opf listing every chapter, nav and ncx', async () => {
    const blob = await buildEpub(result, { title: 'Salt Road', author: 'Y. K.' })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const names = Object.keys(zip.files)
    expect(names[0]).toBe('mimetype')
    expect(await zip.file('mimetype').async('string')).toBe('application/epub+zip')
    expect(names).toEqual(
      expect.arrayContaining([
        'META-INF/container.xml',
        'OEBPS/content.opf',
        'OEBPS/nav.xhtml',
        'OEBPS/toc.ncx',
        'OEBPS/styles.css'
      ])
    )
    const opf = await zip.file('OEBPS/content.opf').async('string')
    expect(opf).toContain('<dc:title>Salt Road</dc:title>')
    expect(opf).toContain('<dc:creator>Y. K.</dc:creator>')
    for (let i = 1; i <= 4; i++) {
      expect(opf).toContain(`href="chapter-${i}.xhtml"`)
      expect(names).toContain(`OEBPS/chapter-${i}.xhtml`)
    }
    const ncx = await zip.file('OEBPS/toc.ncx').async('string')
    expect((ncx.match(/<navPoint /g) || []).length).toBe(4)
    const ch1 = await zip.file('OEBPS/chapter-1.xhtml').async('string')
    expect(ch1).toContain('<h2>Debt</h2>')
    expect(ch1).toContain('<hr/>')
  }, 20_000)
})

describe('compileManuscript against Dexie', () => {
  beforeAll(async () => {
    await db.open()
  })
  beforeEach(async () => {
    await db.volumes.clear()
    await db.sections.clear()
    await db.subsections.clear()
  })

  it('reads the project in order without touching volume.sectionIds', async () => {
    await db.volumes.add({
      id: 'v1',
      projectId: 'p1',
      name: 'Vol',
      order: 0,
      sectionIds: ['wrong']
    })
    await db.sections.add({ id: 'c1', projectId: 'p1', title: 'One', order: 0, volumeId: 'v1' })
    await db.sections.add({ id: 'c2', projectId: 'p1', title: 'Two', order: 1, volumeId: 'v1' })
    await db.subsections.add({
      id: 's1',
      projectId: 'p1',
      sectionId: 'c2',
      order: 0,
      content: '<p>two</p>'
    })
    await db.subsections.add({
      id: 's2',
      projectId: 'p1',
      sectionId: 'c1',
      order: 0,
      content: '<p>one</p>'
    })
    const r = await compileManuscript('p1')
    expect(r.sections.map((s) => s.title)).toEqual(['One', 'Two'])
    expect(r.markdown).toContain('# Vol\n\n## One\n\none\n\n## Two\n\ntwo')
  })
})

describe('CompileManuscript.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('previews the workflow and exports each format', async () => {
    vi.doMock('@/services/compileManuscript', async (orig) => ({
      ...(await orig()),
      compileManuscript: vi.fn(async () => compileMarkdown(INPUT)),
      exportCompiled: vi.fn(async () => ({ sections: 4, subsections: 5, words: 10 }))
    }))
    const { default: CompileManuscript } = await import('@/components/export/CompileManuscript.vue')
    const svc = await import('@/services/compileManuscript')
    const stubs = {
      Modal: { template: '<div><slot /></div>', props: ['show'] },
      BaseIcon: { template: '<i />' }
    }
    const w = mount(CompileManuscript, {
      props: { show: true, projectId: 'p1' },
      global: { stubs }
    })
    await flushPromises()
    expect(w.find('[data-test="stats"]').text()).toContain('4 chapters')
    expect(w.find('[data-test="preview"]').text()).toContain('## Debt')

    await w.find('[data-test="export-docx"]').trigger('click')
    await flushPromises()
    expect(svc.exportCompiled).toHaveBeenLastCalledWith(
      'p1',
      'docx',
      expect.objectContaining({ titleStyle: 'section' })
    )
    await w.find('[data-test="export-epub"]').trigger('click')
    await flushPromises()
    expect(svc.exportCompiled).toHaveBeenLastCalledWith('p1', 'epub', expect.anything())
    await w.find('[data-test="export-markdown"]').trigger('click')
    await flushPromises()
    expect(svc.exportCompiled).toHaveBeenLastCalledWith('p1', 'markdown', expect.anything())
    await w.find('[data-test="export-pdf"]').trigger('click')
    expect(w.emitted('export-pdf')).toBeTruthy()
    vi.doUnmock('@/services/compileManuscript')
  })
})
