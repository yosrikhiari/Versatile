// Database Recovery Service
// Use this if your IndexedDB data becomes corrupted or inaccessible

import { db, table } from './dbService'
import { trackError } from '../composables/useErrorTracker'

/**
 * Check database integrity and connection
 */
export async function checkDatabaseHealth() {
  try {
    // Try to access each store
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

    const results: Record<string, { status: string; count?: number; error?: string }> = {}
    for (const store of stores) {
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
 * Clear all data from the database (DESTRUCTIVE - use with caution)
 */
export async function clearAllData() {
  const stores = [
    'volumeEntities',
    'graphEdges',
    'groupEdges',
    'graphNodeInstances',
    'snapshots',
    'revisions',
    'annotations',
    'snippets',
    'dailyGoals',
    'characterRelationships',
    'storyElements',
    'plotThreads',
    'locations',
    'characters',
    'manuscripts',
    'projects',
    'sparkHistory',
    'volumes'
  ]

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

  for (const store of stores) {
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
 * Import data back into database
 */
export async function importData(backupData: Record<string, any[]>) {
  // Clear existing data first
  await clearAllData()

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

  for (const store of stores) {
    if (backupData[store] && backupData[store].length > 0) {
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
