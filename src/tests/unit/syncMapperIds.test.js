import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '@/services/db-core'
import { findSyncConfig } from '@/services/sync-mapper'

/**
 * Foreign keys cross the sync boundary as SERVER ids. `sectionId` and
 * `volumeId` always did; `branches.sourceBranchId` and `volumeEntities.entityId`
 * were sent as local ids, so a synced fork pointed at a branch the server did
 * not know and a volume membership at an entity it could not find.
 */
beforeAll(async () => {
  await db.open()
})

beforeEach(async () => {
  await db.branches.clear()
  await db.characters.clear()
  await db.locations.clear()
  await db.volumes.clear()
})

describe('sync-mapper id translation', () => {
  it('sends a fork with its source branch as the server id, and reads it back as the local id', async () => {
    await db.branches.add({ id: 'b-main', projectId: 'p1', name: 'main', apiId: 'srv-main' })
    const cfg = findSyncConfig('branches')

    const out = await cfg.toApi({ id: 'b-fork', name: 'fork', sourceBranchId: 'b-main' })
    expect(out.sourceBranchId).toBe('srv-main')

    const back = await cfg.fromApi({ id: 'srv-fork', name: 'fork', sourceBranchId: 'srv-main' })
    expect(back.sourceBranchId).toBe('b-main')

    const root = await cfg.toApi({ id: 'b-main', name: 'main', sourceBranchId: null })
    expect(root.sourceBranchId).toBeNull()
  })

  it('sends a volume membership with the entity server id, per entity type, and reads it back', async () => {
    await db.volumes.add({ id: 'v1', projectId: 'p1', name: 'Vol 1', apiId: 'srv-v1' })
    await db.characters.add({ id: 'c1', projectId: 'p1', name: 'Ines', apiId: 'srv-c1' })
    await db.locations.add({ id: 'l1', projectId: 'p1', name: 'Docks', apiId: 'srv-l1' })
    const cfg = findSyncConfig('volumeEntities')

    const ch = await cfg.toApi({ volumeId: 'v1', entityType: 'character', entityId: 'c1' })
    expect(ch).toMatchObject({ volumeId: 'srv-v1', entityType: 'character', entityId: 'srv-c1' })
    const loc = await cfg.toApi({ volumeId: 'v1', entityType: 'location', entityId: 'l1' })
    expect(loc.entityId).toBe('srv-l1')

    const back = await cfg.fromApi({
      id: 'srv-ve',
      volumeId: 'srv-v1',
      entityType: 'character',
      entityId: 'srv-c1'
    })
    expect(back).toMatchObject({ volumeId: 'v1', entityType: 'character', entityId: 'c1' })
  })

  it("sends a chapter's volume and branch as server ids, the empty GUID for none, and reads them back", async () => {
    await db.volumes.add({ id: 'v1', projectId: 'p1', title: 'Vol 1', apiId: 'srv-v1' })
    await db.branches.add({ id: 'b1', projectId: 'p1', name: 'main', apiId: 'srv-b1' })
    const cfg = findSyncConfig('sections')

    const out = await cfg.toApi({ title: 'Ch 3', order: 3, volumeId: 'v1', branchId: 'b1' })
    expect(out).toMatchObject({ order: 3, volumeId: 'srv-v1', branchId: 'srv-b1' })

    // The server reads null as "leave the link"; only the empty GUID clears it.
    const loose = await cfg.toApi({ title: 'Ch 4', volumeId: null, branchId: null })
    expect(loose.volumeId).toBe('00000000-0000-0000-0000-000000000000')
    expect(loose.branchId).toBe('00000000-0000-0000-0000-000000000000')

    const back = await cfg.fromApi({
      id: 'srv-s1',
      title: 'Ch 3',
      volumeId: 'srv-v1',
      branchId: 'srv-b1'
    })
    expect(back).toMatchObject({ volumeId: 'v1', branchId: 'b1' })
  })

  it('fails a chapter whose volume has not reached the server, rather than sending it linkless', async () => {
    await db.volumes.add({ id: 'v-new', projectId: 'p1', title: 'Unsynced' })
    const cfg = findSyncConfig('sections')

    await expect(cfg.toApi({ title: 'Ch 5', volumeId: 'v-new' })).rejects.toThrow(/no server id/)
  })

  it("sends a scene's order and branch", async () => {
    await db.branches.add({ id: 'b2', projectId: 'p1', name: 'fork', apiId: 'srv-b2' })
    const out = await findSyncConfig('subsections').toApi({ title: 'S', order: 4, branchId: 'b2' })
    expect(out).toMatchObject({ order: 4, branchId: 'srv-b2' })
  })

  it('posts research documents to the route that exists, with the fields the server reads', async () => {
    const cfg = findSyncConfig('researchDocuments')
    expect(cfg.endpoint('story-1')).toBe('/story/story-1/research-document')
    expect(cfg.toApi({ fileName: 'notes.md', fileType: 'md', text: 'hello' })).toEqual({
      fileName: 'notes.md',
      fileType: 'md',
      content: 'hello'
    })
    expect(
      cfg.fromApi({ id: 'r1', fileName: 'notes.md', fileType: 'md', content: 'hello' })
    ).toMatchObject({ fileName: 'notes.md', text: 'hello', charCount: 5 })
  })

  it('gives a manuscript the title the server requires', () => {
    expect(findSyncConfig('manuscripts').toApi({ content: 'x', wordCount: 1 }).title).toBe(
      'Manuscript'
    )
  })

  it('falls back to the raw id when the entity has not been pushed yet', async () => {
    const cfg = findSyncConfig('volumeEntities')
    const out = await cfg.toApi({ volumeId: null, entityType: 'character', entityId: 'c-unsynced' })
    // Not silently dropped: the row still goes up, and re-push PUT-updates it
    // once the character has an apiId.
    expect(out.entityId).toBe('c-unsynced')
  })
})
