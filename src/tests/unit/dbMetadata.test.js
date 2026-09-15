import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '@/services/db-core'
import { backfillSceneContextV48, countWords } from '@/services/dbMetadata'

beforeAll(async () => {
  await db.open()
})

beforeEach(async () => {
  await db.subsections.clear()
  await db.sceneDigests.clear()
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3)
  })
  it('treats empty/undefined as zero', () => {
    expect(countWords('')).toBe(0)
    expect(countWords(null)).toBe(0)
    expect(countWords(undefined)).toBe(0)
  })
})

describe('backfillSceneContextV48', () => {
  it('fills empty scene-context columns from the digest', async () => {
    await db.subsections.add({
      id: 's1',
      projectId: 'p1',
      sectionId: 'sec1',
      order: 0,
      content: 'some prose here',
      title: 'S1'
    })
    await db.sceneDigests.add({
      id: 'd1',
      projectId: 'p1',
      subsectionId: 's1',
      sceneNumber: 1,
      charactersPresent: ['Halden'],
      location: 'Lighthouse',
      wordCount: 99
    })

    const updated = await backfillSceneContextV48('p1')

    expect(updated).toBe(1)
    const sub = await db.subsections.get('s1')
    expect(sub.charactersPresent).toEqual(['Halden'])
    expect(sub.location).toBe('Lighthouse')
    expect(sub.wordCount).toBe(99)
  })

  it('does not overwrite an existing manual edit', async () => {
    await db.subsections.add({
      id: 's2',
      projectId: 'p1',
      sectionId: 'sec2',
      order: 1,
      content: 'prose',
      title: 'S2',
      charactersPresent: ['Morgath']
    })
    await db.sceneDigests.add({
      id: 'd2',
      projectId: 'p1',
      subsectionId: 's2',
      sceneNumber: 2,
      charactersPresent: ['Halden'],
      location: 'Cove'
    })

    await backfillSceneContextV48('p1')

    const sub = await db.subsections.get('s2')
    expect(sub.charactersPresent).toEqual(['Morgath'])
    expect(sub.location).toBe('Cove')
  })

  it('falls back to content word count when no digest exists', async () => {
    await db.subsections.add({
      id: 's3',
      projectId: 'p1',
      sectionId: 'sec3',
      order: 2,
      content: 'alpha beta gamma delta',
      title: 'S3'
    })

    await backfillSceneContextV48('p1')

    const sub = await db.subsections.get('s3')
    expect(sub.wordCount).toBe(4)
  })

  it('returns 0 for a project with no subsections', async () => {
    expect(await backfillSceneContextV48('empty-project')).toBe(0)
  })
})
