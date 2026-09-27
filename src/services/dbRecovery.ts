// Database Recovery Service
// Use this if your IndexedDB data becomes corrupted or inaccessible

import { db, table } from './dbService'
import { trackError } from '../composables/useErrorTracker'

/**
 * Rebuildable caches: left out of a backup (they are large and regenerate on
 * their own) and never cleared by a restore.
 */
const CACHE_STORES = new Set([
  'aiResponseCache',
  'embeddingCache',
  'contentVectors',
  'analysisQueue',
  'graphCheckpoints'
])

/**
 * Every store a backup covers, read from the live schema. These lists used to
 * be written out by hand and had fallen behind it: chapters and scenes
 * (`sections`, `subsections`), branches and every later table were missing,
 * so a recovery backup held no prose and restoring it -- which clears first --
 * deleted all of it.
 */
export function backupStores(): string[] {
  return (db as unknown as { tables: Array<{ name: string }> }).tables
    .map((t) => t.name)
    .filter((n) => !CACHE_STORES.has(n))
}

/**
 * Check database integrity and connection
 */
export async function checkDatabaseHealth() {
  try {
    const results: Record<string, { status: string; count?: number; error?: string }> = {}
    for (const store of backupStores()) {
      try {
        const count = await table(store).count()
        results[store] = { status: 'ok', count }
      } catch (err: any) {
        results[store] = { status: 'error', error: err.message }
      }
    }

    return { healthy: true, stores: results }
  } catch (err: any) {
    return { healthy: false, error: err.message }
  }
}

/**
 * Clear data from the database (DESTRUCTIVE - use with caution). With no
 * argument, every backed-up store; caches are never touched.
 */
export async function clearAllData(stores: string[] = backupStores()) {
  for (const store of stores) {
    try {
      await table(store).clear()
    } catch (err) {
      console.warn(`Failed to clear ${store}:`, err)
    }
  }
}

/**
 * Export all data from database
 */
export async function exportAllData() {
  const data: Record<string, any[]> = {}
  for (const store of backupStores()) {
    try {
      data[store] = await table(store).toArray()
    } catch (err) {
      console.warn(`Failed to export ${store}:`, err)
      data[store] = []
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    version: 'recovery-backup',
    ...data
  }
}

/**
 * Import data back into database. Only the stores the backup actually holds
 * are cleared and restored: a backup written before a store existed (every
 * older backup lacks chapters and scenes) must not wipe that store.
 */
export async function importData(backupData: Record<string, any[]>) {
  const stores = backupStores().filter((s) => Array.isArray(backupData[s]))
  await clearAllData(stores)

  for (const store of stores) {
    if (backupData[store].length > 0) {
      try {
        await table(store).bulkAdd(backupData[store])
        console.info(`Restored ${backupData[store].length} ${store}`)
      } catch (err) {
        console.warn(`Failed to restore ${store}:`, err)
      }
    }
  }
}

/**
 * Force database version reset (use if migrations failed)
 */
export async function resetDatabaseVersion() {
  try {
    await db.close()

    // This will delete all data - warn user first!
    const request = indexedDB.deleteDatabase('VersatileDB')

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        console.info('Database deleted successfully')
        resolve()
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        console.warn('Database deletion blocked - close all tabs')
        resolve()
      }
    })
  } catch (err) {
    trackError(err, { source: 'db', severity: 'critical', context: { op: 'reset-database' } })
    throw err
  }
}

/**
 * Get database size estimate
 */
export async function getDatabaseSize() {
  try {
    const stores = [
      'projects',
      'manuscripts',
      'characters',
      'locations',
      'plotThreads',
      'sparkHistory',
      'annotations',
      'snippets',
      'dailyGoals',
      'revisionComments',
      'characterRelationships',
      'storyElements',
      'graphEdges',
      'groupEdges',
      'graphNodeInstances',
      'snapshots',
      'volumes',
      'volumeEntities'
    ]

    let totalSize = 0
    const counts: Record<string, number> = {}

    for (const store of stores) {
      const count = await table(store).count()
      counts[store] = count
      // Rough estimate: average 500 bytes per record
      totalSize += count * 500
    }

    return {
      sizeBytes: totalSize,
      sizeKB: Math.round(totalSize / 1024),
      sizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100,
      counts
    }
  } catch (err: any) {
    return { error: err.message }
  }
}
