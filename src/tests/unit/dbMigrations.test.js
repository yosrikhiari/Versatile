import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { SCHEMA_VERSIONS } from '@/services/db-schema'
import { MIGRATIONS } from '@/services/db-migrations'

let counter = 0

function uniqueDbName() {
  counter++
  return `VersatileDB_test_migration_${counter}`
}

/**
 * Helper: create a Dexie at a target version range, run the upgrade handler,
 * and call verify() after the upgrade completes.
 */
async function withMigration({ version, beforeSchemas, seed }) {
  const dbName = uniqueDbName()

  // Phase 1: Open at old version, seed data, close
  const oldDb = new Dexie(dbName)
  for (const v of beforeSchemas) {
    oldDb.version(v.version).stores(v.stores)
  }
  await oldDb.open()
  if (seed) {
    await seed(oldDb)
  }
  oldDb.close()

  // Phase 2: Open with full schemas up to `version`, triggering upgrade
  const newDb = new Dexie(dbName)
  const allVersions = SCHEMA_VERSIONS.filter((v) => v.version <= version)
  for (const v of allVersions) {
    let dv = newDb.version(v.version).stores(v.stores)
    const upgrade = MIGRATIONS[v.version]
    if (upgrade) dv = dv.upgrade(upgrade)
  }
  await newDb.open()
  return newDb
}

afterEach(async () => {
  // Clean all test databases
  const databases = await indexedDB.databases()
  for (const db of databases) {
    if (db.name && db.name.startsWith('VersatileDB_test_migration_')) {
      await indexedDB.deleteDatabase(db.name)
    }
  }
})

describe('v11 migration', () => {
  it('backfills volumeId: null on graphEdges', async () => {
    const seed = async (db) => {
      await db.graphEdges.bulkAdd([
        { projectId: 'p1', sourceId: 'a', targetId: 'b' },
        { projectId: 'p1', sourceId: 'c', targetId: 'd', volumeId: 'v1' }
      ])
    }

    const verify = async (db) => {
      const edges = await db.graphEdges.toArray()
      expect(edges).toHaveLength(2)
      expect(edges.find((e) => e.sourceId === 'a').volumeId).toBeNull()
      expect(edges.find((e) => e.sourceId === 'c').volumeId).toBe('v1')
    }

    const beforeVersion11 = [
      {
        version: 10,
        stores: {
          graphEdges:
            '++id, projectId, sourceId, sourceType, targetId, targetType, relationshipType'
        }
      }
    ]
    const db = await withMigration({ version: 11, beforeSchemas: beforeVersion11, seed })
    await verify(db)
    db.close()
    await db.delete()
  })
})

describe('v13 migration (chapters → sections, scenes → subsections)', () => {
  it('copies all chapters into sections and scenes into subsections', async () => {
    const seed = async (db) => {
      await db.chapters.bulkAdd([
        { id: 1, projectId: 'p1', title: 'Ch1', summary: 'Sum1', order: 0, status: 'active', tags: ['a'], volumeId: 'v1' },
        { id: 2, projectId: 'p1', title: 'Ch2', summary: 'Sum2', order: 1, status: 'draft', tags: ['b'], volumeId: null }
      ])
      await db.scenes.bulkAdd([
        { id: 10, projectId: 'p1', chapterId: 1, title: 'Sc1', summary: 'Ssum1', order: 0, content: 'Hello', tags: ['x'] },
        { id: 11, projectId: 'p1', chapterId: 1, title: 'Sc2', summary: 'Ssum2', order: 1, content: 'World', tags: ['y'] }
      ])
    }

    const verify = async (db) => {
      const sections = await db.sections.toArray()
      expect(sections).toHaveLength(2)
      const ch1 = sections.find((s) => s.title === 'Ch1')
      expect(ch1).toBeDefined()
      expect(ch1.status).toBe('active')
      expect(ch1.volumeId).toBe('v1')

      const subs = await db.subsections.toArray()
      expect(subs).toHaveLength(2)
      const sc1 = subs.find((s) => s.title === 'Sc1')
      expect(sc1).toBeDefined()
      expect(sc1.sectionId).toBe(1)
      expect(sc1.content).toBe('Hello')
    }

    const beforeVersion13 = SCHEMA_VERSIONS.filter(
      (v) => v.version <= 12 && v.version !== 13
    )

    const db = await withMigration({ version: 13, beforeSchemas: beforeVersion13, seed })
    await verify(db)
    db.close()
    await db.delete()
  })
})

describe('v26 migration (DEV_MODE=false, no-op)', () => {
  it('does nothing when DEV_MODE is false', async () => {
    const beforeVersion26 = SCHEMA_VERSIONS.filter(
      (v) => v.version <= 25
    )
    const db = await withMigration({ version: 26, beforeSchemas: beforeVersion26, seed: undefined })
    // v26 handler checks DEV_MODE (false) and returns early — no crash expected
    const userCount = await db.users.count()
    expect(userCount).toBe(0)
    db.close()
    await db.delete()
  })
})

describe('v31 migration (generation/content statuses)', () => {
  it('backfills generationStatus, createdAt, updatedAt, contentStatus', async () => {
    const seed = async (db) => {
      await db.characters.bulkAdd([
        { id: 1, projectId: 'p1', name: 'Alice', generationStatus: 'pending' },
        { id: 2, projectId: 'p1', name: 'Bob' }
      ])
      await db.locations.bulkAdd([
        { id: 1, projectId: 'p1', name: 'Forest', generationStatus: 'approved' },
        { id: 2, projectId: 'p1', name: 'Cave' }
      ])
      await db.plotThreads.bulkAdd([
        { id: 1, projectId: 'p1', title: 'Main' },
        { id: 2, projectId: 'p1', title: 'Side', generationStatus: 'draft' }
      ])
      await db.subsections.bulkAdd([
        { id: 1, projectId: 'p1', sectionId: 1, title: 'Para1', content: 'some text' },
        { id: 2, projectId: 'p1', sectionId: 1, title: 'Para2', content: '' }
      ])
    }

    const verify = async (db) => {
      const chars = await db.characters.toArray()
      expect(chars.find((c) => c.name === 'Alice').generationStatus).toBe('pending')
      expect(chars.find((c) => c.name === 'Bob').generationStatus).toBe('approved')

      const locs = await db.locations.toArray()
      expect(locs.find((l) => l.name === 'Forest').generationStatus).toBe('approved')
      expect(locs.find((l) => l.name === 'Cave').generationStatus).toBe('approved')

      const threads = await db.plotThreads.toArray()
      expect(threads.find((t) => t.title === 'Main').generationStatus).toBe('approved')
      expect(threads.find((t) => t.title === 'Side').generationStatus).toBe('draft')

      const subs = await db.subsections.toArray()
      expect(subs.find((s) => s.title === 'Para1').contentStatus).toBe('generated')
      expect(subs.find((s) => s.title === 'Para2').contentStatus).toBe('draft')

      // createdAt/updatedAt backfilled for chars/locs/threads that were missing them
      for (const c of chars) {
        expect(c.createdAt).toBeDefined()
        expect(c.updatedAt).toBeDefined()
      }
    }

    const beforeVersion31 = SCHEMA_VERSIONS.filter(
      (v) => v.version <= 30
    )
    const db = await withMigration({ version: 31, beforeSchemas: beforeVersion31, seed })
    await verify(db)
    db.close()
    await db.delete()
  })
})

describe('v35 migration (branches description/status)', () => {
  it('backfills description and status on branches', async () => {
    const seed = async (db) => {
      await db.branches.bulkAdd([
        { id: 1, projectId: 'p1', name: 'main', description: 'Main branch', status: 'active', sourceBranchId: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: 2, projectId: 'p1', name: 'feature-x', sourceBranchId: 'main', createdAt: '2024-01-02', updatedAt: '2024-01-02' }
      ])
    }

    const verify = async (db) => {
      const branches = await db.branches.toArray()
      const main = branches.find((b) => b.name === 'main')
      expect(main.description).toBe('Main branch')

      const feat = branches.find((b) => b.name === 'feature-x')
      expect(feat.description).toBe('')
      expect(feat.status).toBe('active')
    }

    const beforeVersion35 = SCHEMA_VERSIONS.filter(
      (v) => v.version <= 34
    )
    const db = await withMigration({ version: 35, beforeSchemas: beforeVersion35, seed })
    await verify(db)
    db.close()
    await db.delete()
  })
})

describe('full schema version chain smoke test', () => {
  it('opens at latest version without error', async () => {
    const db = new Dexie(uniqueDbName())
    for (const v of SCHEMA_VERSIONS) {
      let dv = db.version(v.version).stores(v.stores)
      const upgrade = MIGRATIONS[v.version]
      if (upgrade) dv = dv.upgrade(upgrade)
    }
    await db.open()
    expect(db.version).toBeDefined()
    db.close()
    await db.delete()
  })
})
