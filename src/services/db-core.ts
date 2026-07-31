import Dexie, { type Table } from 'dexie'
import { SCHEMA_VERSIONS } from './db-schema'
import { MIGRATIONS } from './db-migrations'

const DEV_MODE = false

/**
 * Row shapes are not modelled yet — every table is `any`-rowed. What this buys us is
 * *table-name* safety: `db.charcters` is a compile error, `db.characters` is not.
 * Narrowing the row types is a separate, per-table exercise.
 */
export type VersatileTable = Table<any, any>

/** Every table declared across all `SCHEMA_VERSIONS` in `db-schema.ts`. */
export interface VersatileTables {
  aiResponseCache: VersatileTable
  annotations: VersatileTable
  authorProfile: VersatileTable
  branches: VersatileTable
  characterRelationships: VersatileTable
  characters: VersatileTable
  chatSessions: VersatileTable
  dailyGoals: VersatileTable
  dialogueIndex: VersatileTable
  embeddingCache: VersatileTable
  evalPreferences: VersatileTable
  evalResults: VersatileTable
  genRuns: VersatileTable
  generatedStories: VersatileTable
  graphEdges: VersatileTable
  graphGroupsV2: VersatileTable
  graphNodeInstances: VersatileTable
  graphNodeParents: VersatileTable
  graphNodePositions: VersatileTable
  groupEdges: VersatileTable
  locations: VersatileTable
  manuscripts: VersatileTable
  optimizationSessions: VersatileTable
  pendingDeletions: VersatileTable
  plotThreads: VersatileTable
  projectBlurbs: VersatileTable
  projects: VersatileTable
  researchChunks: VersatileTable
  researchDocuments: VersatileTable
  researchTags: VersatileTable
  revisionComments: VersatileTable
  sections: VersatileTable
  sessionArchive: VersatileTable
  snapshots: VersatileTable
  snippets: VersatileTable
  sparkHistory: VersatileTable
  storyDocuments: VersatileTable
  storyElements: VersatileTable
  storyShapeAnalysis: VersatileTable
  storyStateSnapshots: VersatileTable
  subsections: VersatileTable
  users: VersatileTable
  voiceProfiles: VersatileTable
  volumeEntities: VersatileTable
  volumes: VersatileTable
}

export type VersatileDB = Dexie & VersatileTables

export const db = new Dexie('VersatileDB') as VersatileDB

/**
 * Table lookup by runtime-computed name. Use this instead of `db[name]` — the index
 * signature that would allow that on `VersatileDB` would also swallow typos on every
 * *static* access, which is the whole point of `VersatileTables`.
 */
export function table(name: string): VersatileTable {
  return (db as unknown as Record<string, VersatileTable>)[name]
}

for (const { version, stores } of SCHEMA_VERSIONS) {
  let v = db.version(version).stores(stores as Record<string, string | null>)
  const upgrade = MIGRATIONS[version as keyof typeof MIGRATIONS]
  if (upgrade) v = v.upgrade(upgrade)
}

const recoveryFlag = 'versatile_db_recovery'

let _ready: Promise<void> | undefined
export async function ready() {
  if (!_ready) {
    _ready = db
      .open()
      .then(() => {
        localStorage.removeItem(recoveryFlag)
      })
      .catch((err: Error) => {
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
      const projectsWithoutUser = await db.projects.filter((p: any) => !p.userId).toArray()
      for (const p of projectsWithoutUser) {
        await db.projects.update(p.id, { userId: testUser })
      }
    }
  }
})

export async function exportDatabase() {
  const dump: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    dump[table.name] = await table.toArray()
  }
  return dump
}

export async function importDatabase(data: Record<string, unknown[]>) {
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
