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

  it('falls back to the raw id when the entity has not been pushed yet', async () => {
    const cfg = findSyncConfig('volumeEntities')
    const out = await cfg.toApi({ volumeId: null, entityType: 'character', entityId: 'c-unsynced' })
    // Not silently dropped: the row still goes up, and re-push PUT-updates it
    // once the character has an apiId.
    expect(out.entityId).toBe('c-unsynced')
  })
})
