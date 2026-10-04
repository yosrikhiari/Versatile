import Dexie from 'dexie'
import { db } from './db-core'
import { api, hasToken } from './api'
import { findSyncConfig, SYNC_ENTITIES, SYNC_ORDER } from './sync-mapper'
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

/** A Dexie table hook, as subscribed and later unsubscribed (same function). */
type HookFn = (...args: never[]) => unknown
/** The slice of a Dexie transaction a hook uses. */
interface HookTransaction {
  on(event: 'complete', fn: () => void): void
}

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
  private _hooks: Array<{ table: any; creating: HookFn; updating: HookFn; deleting: HookFn }> = []
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

      // `_suppressHooks` marks a write made by sync itself. It is consumed
      // here, not stored: a stored flag rode along when a row was copied
      // (a branch fork copies its chapters) and the copy never synced.
      const creating = (_primKey: unknown, obj: Record<string, unknown>) => {
        if (obj._suppressHooks) {
          delete obj._suppressHooks
          return
        }
        obj.syncStatus = 'pending-create'
        obj.lastSyncedAt = null
        obj.apiId = null
      }

      const updating = (
        modifications: Record<string, unknown>,
        _primKey: unknown,
        obj: Record<string, unknown>
      ) => {
        if (modifications._suppressHooks) return { _suppressHooks: undefined }
        if (obj.syncStatus !== 'pending-create') {
          return { syncStatus: 'pending-update', lastSyncedAt: null }
        }
      }

      // The hook runs inside the delete's own transaction, which does not
      // include `pendingDeletions` (or `projects` / `volumes`, read to find
      // the story); writing there threw NotFoundError, so no delete of a
      // synced row was ever recorded or sent. Record it once the delete has
      // committed, outside that transaction.
      const deleting = (
        _primKey: unknown,
        obj: Record<string, unknown>,
        trans: HookTransaction
      ) => {
        if (!obj?.apiId) return
        const row = { ...obj }
        trans.on('complete', () => {
          Dexie.ignoreTransaction(async () => {
            const storyApiId =
              entity.table === 'projects'
                ? null
                : await this._transport.storyApiIdFor(entity.table, row, this._idMap, db)
            await db.pendingDeletions.put({
              table: entity.table,
              apiId: row.apiId,
              storyApiId,
              deletedAt: new Date().toISOString()
            })
          }).catch((err: Error) =>
            console.warn(`[SyncEngine] Could not queue delete ${entity.table}`, err.message)
          )
        })
      }

      table.hook('creating').subscribe(creating)
      table.hook('updating').subscribe(updating)
      table.hook('deleting').subscribe(deleting)
      this._hooks.push({ table, creating, updating, deleting })
    }

    this._hooksInstalled = true
  }

  private _uninstallHooks(): void {
    if (!this._hooksInstalled) return
    // Dexie's unsubscribe needs the very function subscribed; the old bare
    // `unsubscribe()` removed nothing, so every logout / login stacked
    // another set of hooks on each table.
    for (const { table, creating, updating, deleting } of this._hooks) {
      table.hook('creating').unsubscribe(creating)
      table.hook('updating').unsubscribe(updating)
      table.hook('deleting').unsubscribe(deleting)
    }
    this._hooks = []
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

    // Parents before children (SYNC_ORDER): projects first, so every other
    // row can find its story; a row whose project has no story yet is
    // deferred to the next cycle, not counted as a failure.
    let anyFailed = false
    for (const tableName of SYNC_ORDER) {
      try {
        const { failed } = await this._transport.pushTable(
          tableName,
          this._idMap,
          findSyncConfig,
          db
        )
        if (failed > 0) {
          anyFailed = true
          this._failedTables.add(tableName)
          syncStatus.lastError = `Push failed — ${tableName}: ${failed} row(s) still pending`
        } else {
          this._failedTables.delete(tableName)
        }
      } catch (err) {
        anyFailed = true
        this._failedTables.add(tableName)
        console.error(`[SyncEngine] Push failed for ${tableName}:`, (err as Error).message)
        syncStatus.lastError = `Push failed — ${tableName}: ${(err as Error).message}`
      }
    }

    try {
      const fallback = await this._idMap.resolveStoryApiId()
      await this._transport.pushDeletions(fallback, db, findSyncConfig)
    } catch (err) {
      anyFailed = true
      console.error('[SyncEngine] Push deletions failed:', (err as Error).message)
      syncStatus.lastError = `Push deletions failed — ${(err as Error).message}`
    }

    // lastSync means "everything known pushed" — stamping it after a
    // partial failure is what made failed rows read as synced.
    if (!anyFailed) {
      syncStatus.lastSync = new Date().toISOString()
    }
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
    syncStatus.state = 'syncing'
    let anyFailed = false
    const pullOne = async (table: string, storyApiId: string | null, localProjectId: unknown) => {
      const config = findSyncConfig(table)
      if (!config) return
      try {
        await this._transport.pullTable(
          config as never,
          storyApiId,
          localProjectId as string | null,
          this._idMap,
          db
        )
      } catch (err) {
        anyFailed = true
        console.error(`[SyncEngine] Pull failed for ${table}:`, (err as Error).message)
        syncStatus.lastError = `Pull failed — ${table}: ${(err as Error).message}`
      }
    }

    // Stories first (new ones from another device become local projects),
    // then every table of every synced project, parents before children so
    // a pulled chapter can find its volume and branch.
    await pullOne('projects', null, null)
    const projects: Array<{ id: unknown; apiId?: string | null }> = await db.projects.toArray()
    for (const project of projects) {
      if (!project.apiId) continue
      for (const table of SYNC_ORDER) {
        if (table === 'projects') continue
        await pullOne(table, project.apiId, project.id)
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
          const { failed } = await this._transport.pushTable(
            tableName,
            this._idMap,
            findSyncConfig,
            db
          )
          if (failed === 0) this._failedTables.delete(tableName)
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
