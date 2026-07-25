import { db } from './db-core'
import { api, hasToken } from './api'
import { findSyncConfig, SYNC_ENTITIES } from './sync-mapper'
import { SyncIdMap } from './sync-id-map'
import { SyncTransport } from './sync-transport'
import { reactive, ref } from 'vue'
import { trackError } from '../composables/useErrorTracker'

export const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

export const syncStatus = reactive({
  state: 'idle',
  lastSync: null,
  lastError: null,
  failedTables: []
})

let instance = null

export function getSyncEngine() {
  if (!instance) instance = new SyncEngine()
  return instance
}

export function destroySyncEngine() {
  if (instance) {
    instance.destroy()
    instance = null
  }
}

class SyncEngine {
  constructor() {
    this.initialized = false
    this._hooksInstalled = false
    this._flushTimer = null
    this._retryTimer = null
    this._destroyed = false
    this._failedTables = new Set()
    this._online = navigator.onLine
    this._onlineHandler = null
    this._offlineHandler = null
    this._idMap = new SyncIdMap(db, SYNC_ENTITIES)
    this._transport = new SyncTransport(api)
  }

  async init() {
    if (this.initialized || this._destroyed) return
    this._installHooks()
    this._installOnlineDetection()
    await this._idMap.rebuild()
    await this._idMap.restoreStoryId()
    this._startFlushTimer()
    this.initialized = true
  }

  destroy() {
    this._destroyed = true
    this.initialized = false
    this._uninstallHooks()
    this._uninstallOnlineDetection()
    this._stopFlushTimer()
    this._stopRetryQueue()
    this._idMap.clear()
    this._failedTables.clear()
    syncStatus.state = 'idle'
    syncStatus.failedTables = []
  }

  // ── Hooks ────────────────────────────────────────────────────

  _installHooks() {
    if (this._hooksInstalled) return

    for (const entity of SYNC_ENTITIES) {
      const table = db[entity.table]
      if (!table) continue

      table.hook('creating').subscribe((_primKey, obj) => {
        if (obj._suppressHooks) return
        obj.syncStatus = 'pending-create'
        obj.lastSyncedAt = null
        obj.apiId = null
      })

      table.hook('updating').subscribe((modifications, _primKey, obj) => {
        if (modifications._suppressHooks) return
        if (obj.syncStatus !== 'pending-create') {
          modifications.syncStatus = 'pending-update'
          modifications.lastSyncedAt = null
        }
      })

      table.hook('deleting').subscribe(async (primKey) => {
        const existing = await table.get(primKey)
        if (existing && existing.apiId) {
          await db.pendingDeletions.put({
            table: entity.table,
            apiId: existing.apiId,
            deletedAt: new Date().toISOString()
          })
        }
      })
    }

    this._hooksInstalled = true
  }

  _uninstallHooks() {
    if (!this._hooksInstalled) return
    for (const entity of SYNC_ENTITIES) {
      const table = db[entity.table]
      if (!table) continue
      try {
        table.hook('creating').unsubscribe()
        table.hook('updating').unsubscribe()
        table.hook('deleting').unsubscribe()
      } catch {
        // ignore
      }
    }
    this._hooksInstalled = false
  }

  // ── Online/offline detection ────────────────────────────────

  _installOnlineDetection() {
    this._onlineHandler = () => {
      this._online = true
      isOnline.value = true
      console.log('[SyncEngine] Online — resuming sync')
      this.syncNow().catch(() => {})
    }
    this._offlineHandler = () => {
      this._online = false
      isOnline.value = false
      console.warn('[SyncEngine] Offline — sync paused')
    }
    window.addEventListener('online', this._onlineHandler)
    window.addEventListener('offline', this._offlineHandler)
  }

  _uninstallOnlineDetection() {
    if (this._onlineHandler) {
      window.removeEventListener('online', this._onlineHandler)
      this._onlineHandler = null
    }
    if (this._offlineHandler) {
      window.removeEventListener('offline', this._offlineHandler)
      this._offlineHandler = null
    }
  }

  // ── ID map delegation ────────────────────────────────────────

  getApiId(tableName, localId) {
    return this._idMap.getApiId(tableName, localId)
  }

  getLocalId(tableName, apiId) {
    return this._idMap.getLocalId(tableName, apiId)
  }

  persistStoryId(apiId) {
    this._idMap.persistStoryId(apiId)
  }

  clearStoryId() {
    this._idMap.clearStoryId()
  }

  async resolveStoryApiId(localProjectId) {
    return this._idMap.resolveStoryApiId(localProjectId)
  }

  // ── Push ─────────────────────────────────────────────────────

  async push() {
    if (!hasToken()) return
    if (!this._online) {
      syncStatus.state = 'offline'
      return
    }
    syncStatus.state = 'syncing'

    const storyApiId = await this._idMap.resolveStoryApiId()
    if (!storyApiId) {
      try {
        await this._transport.pushTable('projects', null, this._idMap, findSyncConfig, db)
      } catch (err) {
        console.error('[SyncEngine] Push failed for projects:', err.message)
        syncStatus.lastError = `Push failed on projects — ${err.message}`
        syncStatus.state = 'error'
        return
      }
    }

    const order = [
      'projects',
      'volumes',
      'characters',
      'locations',
      'plotThreads',
      'sections',
      'subsections',
      'characterRelationships',
      'volumeEntities',
      'manuscripts',
      'researchDocuments'
    ]

    let anyFailed = false
    for (const tableName of order) {
      try {
        await this._transport.pushTable(tableName, storyApiId, this._idMap, findSyncConfig, db)
        this._failedTables.delete(tableName)
      } catch (err) {
        anyFailed = true
        this._failedTables.add(tableName)
        console.error(`[SyncEngine] Push failed for ${tableName}:`, err.message)
        syncStatus.lastError = `Push failed — ${tableName}: ${err.message}`
      }
    }

    try {
      await this._transport.pushDeletions(storyApiId, this._idMap, db, findSyncConfig)
    } catch (err) {
      anyFailed = true
      console.error('[SyncEngine] Push deletions failed:', err.message)
      syncStatus.lastError = `Push deletions failed — ${err.message}`
    }

    syncStatus.lastSync = new Date().toISOString()
    this._updateSyncStatus()
    if (anyFailed && this._failedTables.size > 0) this._startRetryQueue()
  }

  // ── Pull ─────────────────────────────────────────────────────

  async pull() {
    if (!hasToken()) return
    if (!this._online) {
      syncStatus.state = 'offline'
      return
    }
    const storyApiId = await this._idMap.resolveStoryApiId()
    if (!storyApiId) return

    syncStatus.state = 'syncing'
    let anyFailed = false

    for (const entity of SYNC_ENTITIES) {
      try {
        await this._transport.pullTable(entity, storyApiId, this._idMap, db)
      } catch (err) {
        anyFailed = true
        console.error(`[SyncEngine] Pull failed for ${entity.table}:`, err.message)
        syncStatus.lastError = `Pull failed — ${entity.table}: ${err.message}`
      }
    }

    if (!anyFailed) syncStatus.lastError = null
    syncStatus.lastSync = new Date().toISOString()
    if (!anyFailed && syncStatus.state !== 'error') syncStatus.state = 'idle'
  }

  // ── Flush timer ──────────────────────────────────────────────

  _startFlushTimer() {
    this._stopFlushTimer()
    this._flushTimer = setInterval(async () => {
      if (this._destroyed) return
      try {
        await this.push()
      } catch (err) {
        syncStatus.lastError = `Flush cycle error — ${err.message}`
        syncStatus.state = 'error'
        trackError(err, { source: 'sync', severity: 'error', context: { phase: 'flush-cycle' } })
      }
    }, 30_000)
  }

  _stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
  }

  // ── Retry queue ──────────────────────────────────────────────

  _startRetryQueue() {
    if (this._retryTimer) return
    this._retryTimer = setInterval(async () => {
      if (this._destroyed || this._failedTables.size === 0) {
        this._stopRetryQueue()
        return
      }
      const tables = [...this._failedTables]
      for (const tableName of tables) {
        try {
          const storyApiId = await this._idMap.resolveStoryApiId()
          await this._transport.pushTable(tableName, storyApiId, this._idMap, findSyncConfig, db)
          this._failedTables.delete(tableName)
        } catch (err) {
          console.warn(`[SyncEngine] Retry failed for ${tableName}: ${err.message}`)
        }
      }
      this._updateSyncStatus()
      if (this._failedTables.size === 0) this._stopRetryQueue()
    }, 5_000)
  }

  _stopRetryQueue() {
    if (this._retryTimer) {
      clearInterval(this._retryTimer)
      this._retryTimer = null
    }
  }

  _updateSyncStatus() {
    syncStatus.failedTables = [...this._failedTables]
    if (this._failedTables.size > 0) {
      syncStatus.state = 'error'
    }
  }

  // ── Sync now ─────────────────────────────────────────────────

  async syncNow() {
    syncStatus.state = 'syncing'
    try {
      await this.push()
    } catch (err) {
      console.error('[SyncEngine] syncNow push failed:', err.message)
      syncStatus.lastError = `syncNow push failed — ${err.message}`
    }
    try {
      await this.pull()
    } catch (err) {
      console.error('[SyncEngine] syncNow pull failed:', err.message)
      syncStatus.lastError = `syncNow pull failed — ${err.message}`
    }
    if (this._failedTables.size > 0) this._startRetryQueue()
  }
}

export default SyncEngine
