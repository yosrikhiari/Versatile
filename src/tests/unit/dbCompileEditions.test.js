import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/db-core'
import { listCompileEditions, recordCompileEdition } from '@/services/db-compile-editions'

describe('compile editions (local-only, v60)', () => {
  beforeEach(async () => {
    await db.open()
    await db.compileEditions.clear()
  })

  it('records and lists editions for a project, newest first', async () => {
    await recordCompileEdition({
      projectId: 'p1',
      format: 'markdown',
      title: 'Salt Road',
      filename: 'Salt_Road.md',
      workflow: { titleStyle: 'section', stripFrontmatter: true },
      stats: { volumes: 1, sections: 2, subsections: 3, words: 400 }
    })
    await recordCompileEdition({
      projectId: 'p1',
      format: 'epub',
      title: 'Salt Road',
      filename: 'Salt_Road.epub',
      workflow: { titleStyle: 'section' },
      stats: { volumes: 1, sections: 2, subsections: 3, words: 400 }
    })
    await recordCompileEdition({
      projectId: 'p2',
      format: 'pdf',
      title: 'Other',
      filename: 'Other.pdf',
      workflow: {},
      stats: { volumes: 0, sections: 1, subsections: 1, words: 10 }
    })

    const editions = await listCompileEditions('p1')
    expect(editions).toHaveLength(2)
    expect(editions.map((e) => e.format).sort()).toEqual(['epub', 'markdown'])
    expect(editions[0].createdAt).toBeTruthy()
    expect(editions[0].projectId).toBe('p1')
    expect(editions[0].stats.words).toBe(400)
    expect(editions[0].workflow.titleStyle).toBe('section')
  })

  it('returns empty for unknown project', async () => {
    expect(await listCompileEditions('none')).toEqual([])
  })
})
