import { db } from './db-core'
import { api, hasToken } from './api'
import { findSyncConfig, SYNC_ENTITIES } from './sync-mapper'
import { SyncIdMap } from './sync-id-map'
import { SyncTransport } from './sync-transport'
import { reactive, ref } from 'vue'
import { trackError } from '../composables/useErrorTracker'

export const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

export const syncStatus = reactive<{
  state: string
  lastSync: string | null
  lastError: string | null
  failedTables: string[]
}>({
  state: 'idle',
  lastSync: null,
  lastError: null,
  failedTables: []
})

let instance: SyncEngine | null = null

export function getSyncEngine(): SyncEngine {
  if (!instance) instance = new SyncEngine()
  return instance
}

export function destroySyncEngine(): void {
  if (instance) {
    instance.destroy()
    instance = null
  }
}

class SyncEngine {
  initialized = false
  private _hooksInstalled = false
  private _flushTimer: ReturnType<typeof setInterval> | null = null
  private _retryTimer: ReturnType<typeof setInterval> | null = null
  private _destroyed = false
  private _failedTables = new Set<string>()
  private _online: boolean
  private _onlineHandler: (() => void) | null = null
  private _offlineHandler: (() => void) | null = null
  private _idMap: SyncIdMap
  private _transport: SyncTransport

  constructor() {
    this._online = navigator.onLine
    this._idMap = new SyncIdMap(db, SYNC_ENTITIES)
    this._transport = new SyncTransport(api)
  }

  async init(): Promise<void> {
    if (this.initialized || this._destroyed) return
    this._installHooks()
    this._installOnlineDetection()
    await this._idMap.rebuild()
    await this._idMap.restoreStoryId()
    this._startFlushTimer()
    this.initialized = true
  }

  destroy(): void {
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

  private _installHooks(): void {
    if (this._hooksInstalled) return

    for (const entity of SYNC_ENTITIES) {
      const table = (db as any)[entity.table]
      if (!table) continue

      table.hook('creating').subscribe((_primKey: unknown, obj: Record<string, unknown>) => {
        if (obj._suppressHooks) return
        obj.syncStatus = 'pending-create'
        obj.lastSyncedAt = null
        obj.apiId = null
      })

      table.hook('updating').subscribe((modifications: Record<string, unknown>, _primKey: unknown, obj: Record<string, unknown>) => {
        if (modifications._suppressHooks) return
        if (obj.syncStatus !== 'pending-create') {
          modifications.syncStatus = 'pending-update'
          modifications.lastSyncedAt = null
        }
      })

      table.hook('deleting').subscribe(async (primKey: string) => {
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

  private _uninstallHooks(): void {
    if (!this._hooksInstalled) return
    for (const entity of SYNC_ENTITIES) {
      const table = (db as any)[entity.table]
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

  private _installOnlineDetection(): void {
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

  private _uninstallOnlineDetection(): void {
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

  getApiId(tableName: string, localId: string): string | null {
    return this._idMap.getApiId(tableName, localId)
  }

  getLocalId(tableName: string, apiId: string): string | null {
    return this._idMap.getLocalId(tableName, apiId)
  }

  persistStoryId(apiId: string): void {
    this._idMap.persistStoryId(apiId)
  }

  clearStoryId(): void {
    this._idMap.clearStoryId()
  }

  async resolveStoryApiId(localProjectId?: string): Promise<string | null> {
    return this._idMap.resolveStoryApiId(localProjectId)
  }

  // ── Push ─────────────────────────────────────────────────────

  async push(): Promise<void> {
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
        console.error('[SyncEngine] Push failed for projects:', (err as Error).message)
        syncStatus.lastError = `Push failed on projects — ${(err as Error).message}`
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
        console.error(`[SyncEngine] Push failed for ${tableName}:`, (err as Error).message)
        syncStatus.lastError = `Push failed — ${tableName}: ${(err as Error).message}`
      }
    }

    try {
      await this._transport.pushDeletions(storyApiId, this._idMap, db, findSyncConfig)
    } catch (err) {
      anyFailed = true
      console.error('[SyncEngine] Push deletions failed:', (err as Error).message)
      syncStatus.lastError = `Push deletions failed — ${(err as Error).message}`
    }

    syncStatus.lastSync = new Date().toISOString()
    this._updateSyncStatus()
    if (anyFailed && this._failedTables.size > 0) this._startRetryQueue()
  }

  // ── Pull ─────────────────────────────────────────────────────

  async pull(): Promise<void> {
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
        await this._transport.pullTable(entity as never, storyApiId, this._idMap, db)
      } catch (err) {
        anyFailed = true
        console.error(`[SyncEngine] Pull failed for ${entity.table}:`, (err as Error).message)
        syncStatus.lastError = `Pull failed — ${entity.table}: ${(err as Error).message}`
      }
    }

    if (!anyFailed) syncStatus.lastError = null
    syncStatus.lastSync = new Date().toISOString()
    if (!anyFailed && syncStatus.state !== 'error') syncStatus.state = 'idle'
  }

  // ── Flush timer ──────────────────────────────────────────────

  private _startFlushTimer(): void {
    this._stopFlushTimer()
    this._flushTimer = setInterval(async () => {
      if (this._destroyed) return
      try {
        await this.push()
      } catch (err) {
        syncStatus.lastError = `Flush cycle error — ${(err as Error).message}`
        syncStatus.state = 'error'
        trackError(err, { source: 'sync', severity: 'error', context: { phase: 'flush-cycle' } })
      }
    }, 30_000)
  }

  private _stopFlushTimer(): void {
    if (this._flushTimer) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
  }

  // ── Retry queue ──────────────────────────────────────────────

  private _startRetryQueue(): void {
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
          console.warn(`[SyncEngine] Retry failed for ${tableName}: ${(err as Error).message}`)
        }
      }
      this._updateSyncStatus()
      if (this._failedTables.size === 0) this._stopRetryQueue()
    }, 5_000)
  }

  private _stopRetryQueue(): void {
    if (this._retryTimer) {
      clearInterval(this._retryTimer)
      this._retryTimer = null
    }
  }

  private _updateSyncStatus(): void {
    syncStatus.failedTables = [...this._failedTables]
    if (this._failedTables.size > 0) {
      syncStatus.state = 'error'
    }
  }

  // ── Sync now ─────────────────────────────────────────────────

  async syncNow(): Promise<void> {
    syncStatus.state = 'syncing'
    try {
      await this.push()
    } catch (err) {
      console.error('[SyncEngine] syncNow push failed:', (err as Error).message)
      syncStatus.lastError = `syncNow push failed — ${(err as Error).message}`
    }
    try {
      await this.pull()
    } catch (err) {
      console.error('[SyncEngine] syncNow pull failed:', (err as Error).message)
      syncStatus.lastError = `syncNow pull failed — ${(err as Error).message}`
    }
    if (this._failedTables.size > 0) this._startRetryQueue()
  }
}

export default SyncEngine
