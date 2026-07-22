import Dexie from 'dexie'
import { SCHEMA_VERSIONS } from './db-schema'
import { MIGRATIONS } from './db-migrations'

const DEV_MODE = false

export const db = new Dexie('VersatileDB')

for (const { version, stores } of SCHEMA_VERSIONS) {
  let v = db.version(version).stores(stores)
  const upgrade = MIGRATIONS[version]
  if (upgrade) v = v.upgrade(upgrade)
}

const recoveryFlag = 'versatile_db_recovery'

let _ready
export async function ready() {
  if (!_ready) {
    _ready = db
      .open()
      .then(() => {
        localStorage.removeItem(recoveryFlag)
      })
      .catch((err) => {
        if (localStorage.getItem(recoveryFlag)) {
          console.error('[DB] Automatic recovery failed. Please clear IndexedDB manually.')
          return
        }
        console.warn('[DB] Database error:', err.name, '- recovering...')
        localStorage.setItem(recoveryFlag, '1')
        db.close()

        const delReq = indexedDB.deleteDatabase('VersatileDB')
        delReq.onsuccess = () => window.location.reload()
        delReq.onerror = () => window.location.reload()
        delReq.onblocked = () => window.location.reload()
      })
  }
  return _ready
}

db.on('ready', async () => {
  const volumeCount = await db.volumes.count()
  if (volumeCount === 0) {
    await db.volumes.add({
      title: 'Default',
      description: 'Default volume for all content',
      color: '#6366f1',
      sectionIds: []
    })
  }

  if (DEV_MODE) {
    const userCount = await db.users.count()
    if (userCount === 0) {
      const testUser = await db.users.add({
        username: 'test',
        passwordHash: 'ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae',
        displayName: 'Test User',
        createdAt: new Date().toISOString()
      })
      const projectsWithoutUser = await db.projects.filter((p) => !p.userId).toArray()
      for (const p of projectsWithoutUser) {
        await db.projects.update(p.id, { userId: testUser })
      }
    }
  }
})

export async function exportDatabase() {
  const dump = {}
  for (const table of db.tables) {
    dump[table.name] = await table.toArray()
  }
  return dump
}

export async function importDatabase(data) {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear()
      const rows = data[table.name]
      if (rows && rows.length > 0) {
        await table.bulkAdd(rows)
      }
    }
  })
}
