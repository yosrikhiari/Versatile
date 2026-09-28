import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { setActivePinia, createPinia } from 'pinia'

/** WHATIF-AND-IMPORT-PLAN.md gate G3, over the real schema. */

let db, decodeFile, detectStructure, createProjectFromBook

beforeEach(async () => {
  setActivePinia(createPinia())
  db = (await import('@/services/db-core')).db
  ;({ decodeFile } = await import('@/services/import/decoders'))
  ;({ detectStructure } = await import('@/services/import/structure'))
  ;({ createProjectFromBook } = await import('@/services/import/writeProject'))
  for (const t of ['projects', 'manuscripts', 'sections', 'subsections', 'branches', 'volumes']) {
    await db[t].clear()
  }
})

async function importText(name, text) {
  const bytes = new TextEncoder().encode(text)
  const d = await decodeFile(name, bytes.buffer)
  const book = detectStructure(d.blocks, { title: d.title, author: d.author })
  return { book, written: await createProjectFromBook(book) }
}

describe('createProjectFromBook', () => {
  it('writes whole rows: main branch, order, book-wide scene numbers, word counts, HTML', async () => {
    const md = [
      '# Part One',
      '## Arrival',
      'She came *by boat*.',
      '***',
      'Night.',
      '## Storm',
      'Rain.',
      '# Part Two',
      '## After',
      'Quiet.'
    ].join('\n\n')
    const { written } = await importText('b.md', md)
    const pid = written.projectId
    const main = await db.branches.where({ projectId: pid }).first()
    const secs = await db.sections.where('projectId').equals(pid).sortBy('order')
    const subs = await db.subsections.where('projectId').equals(pid).toArray()
    const vols = await db.volumes.where('projectId').equals(pid).sortBy('order')

    expect(main.name).toBe('main')
    expect(vols.map((v) => v.title)).toEqual(['Part One', 'Part Two'])
    expect(secs.map((s) => [s.title, s.order, s.volumeId])).toEqual([
      ['Arrival', 0, vols[0].id],
      ['Storm', 1, vols[0].id],
      ['After', 2, vols[1].id]
    ])
    expect([...secs, ...subs].every((r) => r.branchId === main.id)).toBe(true)
    const bySceneNo = [...subs].sort((a, b) => a.sceneNumber - b.sceneNumber)
    expect(bySceneNo.map((s) => s.sceneNumber)).toEqual([1, 2, 3, 4])
    expect(bySceneNo[0]).toMatchObject({
      content: '<p>She came <em>by boat</em>.</p>',
      wordCount: 4,
      order: 0,
      type: 'scene'
    })
    expect(bySceneNo[1].order).toBe(1)
    expect(written).toMatchObject({ chapters: 3, scenes: 4 })
    expect((await db.projects.get(pid)).source).toBe('import')
    // The writing statistics start from here (an import is not a day of writing).
    expect((await db.projects.get(pid)).importedWords).toBe(written.words)
  })

  it('the editor load path sees every imported chapter and scene', async () => {
    const { written } = await importText('b.txt', 'CHAPTER 1\n\nOne.\n\nCHAPTER 2\n\nTwo.')
    const { useManuscriptStore } = await import('@/stores/manuscriptStore')
    const ms = useManuscriptStore()
    await ms.loadManuscript(written.projectId)
    expect(ms.sections).toHaveLength(2)
    expect(ms.subsections).toHaveLength(2)
    expect(ms.getFullText()).toBe('One.\n\nTwo.')
    // Every counter adds chapters and scenes; the book is counted once.
    expect(ms.structuredWordCount).toBe(2)
  })

  it.skipIf(!existsSync('reports/live/masterpieces/raw/pg35.txt'))(
    'The Time Machine: every scene word stored',
    async () => {
      const text = readFileSync('reports/live/masterpieces/raw/pg35.txt', 'utf8')
      const { book, written } = await importText('pg35.txt', text)
      const subs = await db.subsections.where('projectId').equals(written.projectId).toArray()
      expect(subs.reduce((n, s) => n + s.wordCount, 0)).toBe(book.accounting.scenes)
      expect(written.chapters).toBe(17)
      expect((await db.projects.get(written.projectId)).name).toBe('The Time Machine')
    }
  )
})
