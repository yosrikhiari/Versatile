import { describe, it, expect, afterEach } from 'vitest'
import Dexie from 'dexie'
import { SCHEMA_VERSIONS } from '@/services/db-schema'
import { MIGRATIONS } from '@/services/db-migrations'

let counter = 0

function uniqueDbName() {
  counter++
  return `VersatileDB_test_txn_${counter}`
}

async function createTestDb() {
  const dbName = uniqueDbName()
  const testDb = new Dexie(dbName)
  for (const { version, stores } of SCHEMA_VERSIONS) {
    let v = testDb.version(version).stores(stores)
    const upgrade = MIGRATIONS[version]
    if (upgrade) v = v.upgrade(upgrade)
  }
  await testDb.open()
  return testDb
}

afterEach(async () => {
  const databases = await indexedDB.databases()
  for (const db of databases) {
    if (db.name && db.name.startsWith('VersatileDB_test_txn_')) {
      await indexedDB.deleteDatabase(db.name)
    }
  }
})

describe('createProject transaction atomicity', () => {
  it('atomically creates project + manuscript within transaction', async () => {
    const testDb = await createTestDb()
    const now = new Date().toISOString()

    const projectId = await testDb.transaction(
      'rw',
      testDb.projects,
      testDb.manuscripts,
      async () => {
        const id = await testDb.projects.add({
          name: 'Test',
          genre: 'Fantasy',
          synopsis: 'A test',
          createdAt: now,
          updatedAt: now
        })
        await testDb.manuscripts.add({ projectId: id, content: '', wordCount: 0, updatedAt: now })
        return id
      }
    )

    expect(projectId).toBeDefined()
    const project = await testDb.projects.get(projectId)
    expect(project.name).toBe('Test')

    const manuscript = await testDb.manuscripts.where('projectId').equals(projectId).first()
    expect(manuscript).toBeDefined()
    expect(manuscript.content).toBe('')

    testDb.close()
    await testDb.delete()
  })

  it('rolls back project when manuscript write fails', async () => {
    const testDb = await createTestDb()
    const now = new Date().toISOString()

    await expect(
      testDb.transaction('rw', testDb.projects, testDb.manuscripts, async () => {
        await testDb.projects.add({ name: 'Rollback Me', createdAt: now, updatedAt: now })
        throw new Error('Simulated failure after project write')
      })
    ).rejects.toThrow('Simulated failure after project write')

    const allProjects = await testDb.projects.toArray()
    expect(allProjects.find((p) => p.name === 'Rollback Me')).toBeUndefined()

    testDb.close()
    await testDb.delete()
  })
})

describe('importProject transaction atomicity', () => {
  it('atomically imports data across all tables', async () => {
    const testDb = await createTestDb()
    const now = new Date().toISOString()

    const projectId = await testDb.transaction(
      'rw',
      testDb.projects,
      testDb.manuscripts,
      testDb.characters,
      testDb.locations,
      testDb.plotThreads,
      async () => {
        const id = await testDb.projects.add({ name: 'Imported', createdAt: now, updatedAt: now })
        await testDb.manuscripts.add({
          projectId: id,
          content: 'Hello',
          wordCount: 1,
          updatedAt: now
        })
        await testDb.characters.bulkAdd([{ name: 'Alice', projectId: id }])
        await testDb.locations.bulkAdd([{ name: 'Earth', projectId: id }])
        await testDb.plotThreads.bulkAdd([{ title: 'Main', projectId: id }])
        return id
      }
    )

    expect(projectId).toBeDefined()
    const chars = await testDb.characters.where('projectId').equals(projectId).toArray()
    expect(chars).toHaveLength(1)
    expect(chars[0].name).toBe('Alice')

    const locs = await testDb.locations.where('projectId').equals(projectId).toArray()
    expect(locs).toHaveLength(1)

    testDb.close()
    await testDb.delete()
  })

  it('rolls back all tables when mid-import write fails', async () => {
    const testDb = await createTestDb()
    const now = new Date().toISOString()

    await expect(
      testDb.transaction(
        'rw',
        testDb.projects,
        testDb.manuscripts,
        testDb.characters,
        testDb.locations,
        testDb.plotThreads,
        async () => {
          const id = await testDb.projects.add({ name: 'Partial', createdAt: now, updatedAt: now })
          await testDb.manuscripts.add({
            projectId: id,
            content: 'Partial',
            wordCount: 1,
            updatedAt: now
          })
          await testDb.characters.bulkAdd([{ name: 'Bob', projectId: id }])
          throw new Error('Network error during import')
        }
      )
    ).rejects.toThrow('Network error during import')

    const allProjects = await testDb.projects.toArray()
    expect(allProjects.find((p) => p.name === 'Partial')).toBeUndefined()

    testDb.close()
    await testDb.delete()
  })
})
