import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/db-core'
import { getProjectCover, saveProjectCover, deleteProjectCover } from '@/services/db-project-covers'

describe('project covers (local-only, v59)', () => {
  beforeEach(async () => {
    await db.open()
    await db.projectCovers.clear()
  })

  it('stores and retrieves a cover for a project', async () => {
    const blob = new Blob(['pixels'], { type: 'image/png' })
    await saveProjectCover(42, blob)

    const cover = await getProjectCover(42)
    expect(cover).toBeTruthy()
    expect(cover.projectId).toBe(42)
    expect(cover.mimeType).toBe('image/png')
    expect(cover.blob).toBeTruthy()
    // fake-indexeddb/jsdom may not round-trip Blob identity; accept Blob-like data.
    if (cover.blob instanceof Blob) {
      expect(cover.blob.size).toBe(blob.size)
    } else {
      expect(cover.blob).toBeDefined()
    }
    expect(cover.updatedAt).toBeTruthy()
  })

  it('replaces an existing cover for the same project', async () => {
    await saveProjectCover(7, new Blob(['a'], { type: 'image/png' }))
    await saveProjectCover(7, new Blob(['b'], { type: 'image/jpeg' }))

    const cover = await getProjectCover(7)
    expect(cover.mimeType).toBe('image/jpeg')
    expect(await db.projectCovers.where('projectId').equals(7).count()).toBe(1)
  })

  it('deletes a cover', async () => {
    await saveProjectCover(9, new Blob(['x'], { type: 'image/webp' }))
    await deleteProjectCover(9)
    expect(await getProjectCover(9)).toBeNull()
  })

  it('returns null when no cover exists', async () => {
    expect(await getProjectCover(999)).toBeNull()
  })
})
