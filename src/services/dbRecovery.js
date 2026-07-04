// Database Recovery Service
// Use this if your IndexedDB data becomes corrupted or inaccessible

import { db } from './dbService'

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
      'chapters',
      'scenes',
      'sparkHistory',
      'annotations',
      'snippets',
      'dailyGoals',
      'revisionComments',
      'characterRelationships',
      'storyElements',
      'graphEdges',
      'groupEdges',
      'nodePositions',
      'graphGroups',
      'snapshots',
      'volumes',
      'volumeEntities'
    ]

    const results = {}
    for (const store of stores) {
      try {
        const count = await db[store].count()
        results[store] = { status: 'ok', count }
      } catch (err) {
        results[store] = { status: 'error', error: err.message }
      }
    }

    return { healthy: true, stores: results }
  } catch (err) {
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
    'nodePositions',
    'graphGroups',
    'snapshots',
    'revisions',
    'annotations',
    'snippets',
    'dailyGoals',
    'characterRelationships',
    'storyElements',
    'scenes',
    'chapters',
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
      await db[store].clear()
    } catch (err) {
      console.warn(`Failed to clear ${store}:`, err)
    }
  }
}

/**
 * Export all data from database
 */
export async function exportAllData() {
  const data = {}
  const stores = [
    'projects',
    'manuscripts',
    'characters',
    'locations',
    'plotThreads',
    'chapters',
    'scenes',
    'sparkHistory',
    'annotations',
    'snippets',
    'dailyGoals',
    'revisionComments',
    'characterRelationships',
    'storyElements',
    'graphEdges',
    'groupEdges',
    'nodePositions',
    'graphGroups',
    'snapshots',
    'volumes',
    'volumeEntities'
  ]

  for (const store of stores) {
    try {
      data[store] = await db[store].toArray()
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
export async function importData(backupData) {
  // Clear existing data first
  await clearAllData()

  const stores = [
    'projects',
    'manuscripts',
    'characters',
    'locations',
    'plotThreads',
    'chapters',
    'scenes',
    'sparkHistory',
    'annotations',
    'snippets',
    'dailyGoals',
    'revisionComments',
    'characterRelationships',
    'storyElements',
    'graphEdges',
    'groupEdges',
    'nodePositions',
    'graphGroups',
    'snapshots',
    'volumes',
    'volumeEntities'
  ]

  for (const store of stores) {
    if (backupData[store] && backupData[store].length > 0) {
      try {
        await db[store].bulkAdd(backupData[store])
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

    return new Promise((resolve, reject) => {
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
    console.error('Failed to reset database:', err)
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
      'chapters',
      'scenes',
      'sparkHistory',
      'annotations',
      'snippets',
      'dailyGoals',
      'revisionComments',
      'characterRelationships',
      'storyElements',
      'graphEdges',
      'groupEdges',
      'nodePositions',
      'graphGroups',
      'snapshots',
      'volumes',
      'volumeEntities'
    ]

    let totalSize = 0
    const counts = {}

    for (const store of stores) {
      const count = await db[store].count()
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
  } catch (err) {
    return { error: err.message }
  }
}
