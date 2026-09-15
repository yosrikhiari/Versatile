import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '@/services/db-core'
import { writeSceneAnalysis } from '@/services/generation/sceneAnalysis'

/**
 * Schema v49: the subsection's `pov` / `location` / `charactersPresent` are the
 * single authority for scene context. The digest writer reads them back when
 * the author has set them, and hydrates them when they are empty — fill only,
 * never overwrite.
 */
beforeAll(async () => {
  await db.open()
})

beforeEach(async () => {
  await db.subsections.clear()
  await db.sceneDigests.clear()
  await db.entityStates.clear()
  await db.characters.clear()
  await db.locations.clear()
})

const PROSE =
  '<p>Ines counted the bollards while Tomas watched from the customs house. The tide was wrong.</p>'

describe('scene context authority', () => {
  it('hydrates empty columns from the digest and stores the word count', async () => {
    await db.subsections.add({
      id: 's1',
      projectId: 'p1',
      sectionId: 'sec1',
      title: 'Low tide',
      content: PROSE,
      order: 0
    })
    const { digest, errors } = await writeSceneAnalysis({
      projectId: 'p1',
      subsectionId: 's1',
      prose: PROSE,
      structured: {
        summary: 'Ines finds the body.',
        usedEntities: { characterNames: ['Ines', 'Tomas'], locationNames: ['The Docks'] },
        keyFacts: []
      },
      scene: { title: 'Low tide', pov: 'Ines', location: 'The Docks' }
    })
    expect(errors).toEqual([])
    expect(digest.pov).toBe('Ines')
    const row = await db.subsections.get('s1')
    expect(row.pov).toBe('Ines')
    expect(row.location).toBe('The Docks')
    expect(row.charactersPresent).toEqual(['Ines', 'Tomas'])
    expect(row.wordCount).toBe(15)
  })

  it("prefers the author's columns over the writer's metadata and never overwrites them", async () => {
    await db.subsections.add({
      id: 's2',
      projectId: 'p1',
      sectionId: 'sec1',
      title: 'Low tide',
      content: PROSE,
      order: 0,
      pov: 'Tomas',
      location: 'The Customs House',
      charactersPresent: ['Tomas']
    })
    const { digest } = await writeSceneAnalysis({
      projectId: 'p1',
      subsectionId: 's2',
      prose: PROSE,
      structured: {
        summary: 'x',
        usedEntities: { characterNames: ['Ines', 'Tomas'], locationNames: ['The Docks'] },
        keyFacts: []
      },
      scene: { title: 'Low tide', pov: 'Ines', location: 'The Docks' }
    })
    expect(digest.pov).toBe('Tomas')
    expect(digest.location).toBe('The Customs House')
    expect(digest.charactersPresent).toEqual(['Tomas'])
    const row = await db.subsections.get('s2')
    expect(row.pov).toBe('Tomas')
    expect(row.location).toBe('The Customs House')
    expect(row.charactersPresent).toEqual(['Tomas'])
  })

  it('still writes a digest when there is no subsection row', async () => {
    const { digest, errors } = await writeSceneAnalysis({
      projectId: 'p1',
      subsectionId: 'ghost',
      prose: PROSE,
      structured: { summary: 'x', usedEntities: { characterNames: ['Ines'] }, keyFacts: [] },
      scene: { title: 't', location: 'The Docks' }
    })
    expect(errors).toEqual([])
    expect(digest.charactersPresent).toEqual(['Ines'])
    expect(digest.location).toBe('The Docks')
  })
})
