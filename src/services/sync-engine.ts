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

/**
 * A push may stamp `lastSync` only when nothing failed AND nothing was
 * deferred. Deferred rows are waiting for a parent (a project without a server
 * story yet); stamping "everything known pushed" while they sit pending is the
 * same lie a partial failure used to tell.
 */
export function isPushComplete(outcome: { failed: number; deferred: number }): boolean {
  return outcome.failed === 0 && outcome.deferred === 0
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
        // Lets a push prove the row did not change while its request was in
        // flight. Without it a local edit made during the request was marked
        // synced with the server still holding the old body.
        obj._syncRevision = 1
      }

      const updating = (
        modifications: Record<string, unknown>,
        _primKey: unknown,
        obj: Record<string, unknown>
      ) => {
        if (modifications._suppressHooks) {
          const rest = { ...modifications }
          delete rest._suppressHooks
          return Object.keys(rest).length > 0
            ? { ...rest, _suppressHooks: undefined }
            : { _suppressHooks: undefined }
        }
        if (obj.syncStatus !== 'pending-create') {
          return {
            syncStatus: 'pending-update',
            lastSyncedAt: null,
            _syncRevision: (Number(obj._syncRevision) || 0) + 1
          }
        }
        return { _syncRevision: (Number(obj._syncRevision) || 0) + 1 }
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
        // A delete the sync engine performs itself (a remote tombstone applied
        // on pull) must not come back as an outbound local delete.
        if (this._idMap.consumeSuppressedDelete(entity.table, String(_primKey))) return
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

  // ── Online/offline detection + cross-browser convergence ────

  private _visibilityHandler: (() => void) | null = null
  private _focusHandler: (() => void) | null = null
  private _lastVisibilitySyncAt = 0
  private static VISIBILITY_SYNC_THROTTLE_MS = 15_000

  private _scheduleCrossBrowserSync(): void {
    if (!hasToken() || !this._online || this._destroyed) return
    if (syncStatus.state === 'syncing') return
    const now = Date.now()
    if (now - this._lastVisibilitySyncAt < SyncEngine.VISIBILITY_SYNC_THROTTLE_MS) return
    this._lastVisibilitySyncAt = now
    this.syncNow().catch(() => {})
  }

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
    // Pull on return to the tab so edits made in another browser converge sooner.
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') this._scheduleCrossBrowserSync()
    }
    this._focusHandler = () => this._scheduleCrossBrowserSync()
    window.addEventListener('online', this._onlineHandler)
    window.addEventListener('offline', this._offlineHandler)
    document.addEventListener('visibilitychange', this._visibilityHandler)
    window.addEventListener('focus', this._focusHandler)
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
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler)
      this._visibilityHandler = null
    }
    if (this._focusHandler) {
      window.removeEventListener('focus', this._focusHandler)
      this._focusHandler = null
    }
  }

  // ── ID map delegation ────────────────────────────────────────

  getApiId(tableName: string, localId: string): string | null {
    return this._idMap.getApiId(tableName, localId)
  }

  getLocalId(tableName: string, apiId: string): string | null {
    return this._idMap.getLocalId(tableName, apiId)
  }

  suppressNextDelete(tableName: string, localId: string): void {
    this._idMap.suppressNextDelete(tableName, localId)
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
    let failedTotal = 0
    let deferredTotal = 0
    for (const tableName of SYNC_ORDER) {
      try {
        const { failed, deferred } = await this._transport.pushTable(
          tableName,
          this._idMap,
          findSyncConfig,
          db
        )
        failedTotal += failed
        deferredTotal += deferred
        if (failed > 0) {
          anyFailed = true
          this._failedTables.add(tableName)
          syncStatus.lastError = `Push failed — ${tableName}: ${failed} row(s) still pending`
        } else if (deferred > 0) {
          // Waiting on a parent is not a failure, but it is not "pushed"
          // either: keep it visible without spinning the retry queue.
          syncStatus.lastError = `Push deferred — ${tableName}: ${deferred} row(s) waiting for their story`
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

    let deletionsFailed = false
    try {
      const fallback = await this._idMap.resolveStoryApiId()
      const { failed } = await this._transport.pushDeletions(fallback, db, findSyncConfig)
      if (failed > 0) {
        anyFailed = true
        deletionsFailed = true
        this._failedTables.add('deletions')
        syncStatus.lastError = `Push deletions failed — ${failed} row(s) still queued`
      } else {
        this._failedTables.delete('deletions')
      }
    } catch (err) {
      anyFailed = true
      deletionsFailed = true
      console.error('[SyncEngine] Push deletions failed:', (err as Error).message)
      syncStatus.lastError = `Push deletions failed — ${(err as Error).message}`
    }

    // lastSync means "everything known pushed" — stamping it after a
    // partial failure or with rows deferred behind a parent is what made
    // unsent rows read as synced. A rejected delete is a failure too: it
    // was not part of `failedTotal` before, so the stamp hid it.
    if (
      isPushComplete({
        failed: failedTotal + (deletionsFailed ? 1 : 0),
        deferred: deferredTotal
      })
    ) {
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
    const isStoryGoneError = (err: unknown) => {
      const status = (err as { status?: number } | null)?.status
      const message = (err as Error | null)?.message || ''
      return status === 404 || /story not found/i.test(message)
    }
    const pullOne = async (table: string, storyApiId: string | null, localProjectId: unknown) => {
      const config = findSyncConfig(table)
      if (!config) return null as Error | null
      try {
        await this._transport.pullTable(
          config as never,
          storyApiId,
          localProjectId as string | null,
          this._idMap,
          db
        )
        return null
      } catch (err) {
        console.error(`[SyncEngine] Pull failed for ${table}:`, (err as Error).message)
        return err as Error
      }
    }

    // Stories first (new ones from another device become local projects),
    // then every table of every synced project, parents before children so
    // a pulled chapter can find its volume and branch.
    {
      const err = await pullOne('projects', null, null)
      if (err) {
        anyFailed = true
        syncStatus.lastError = `Pull failed — projects: ${err.message}`
      }
    }
    const projects: Array<{ id: unknown; apiId?: string | null }> = await db.projects.toArray()
    for (const project of projects) {
      if (!project.apiId) continue
      const projectErrors: Error[] = []
      for (const table of SYNC_ORDER) {
        if (table === 'projects') continue
        const err = await pullOne(table, project.apiId, project.id)
        if (err) projectErrors.push(err)
      }
      // Remote deletes last: a row deleted on another device leaves the
      // local copy only when it carries unpushed local edits (local wins).
      try {
        await this._transport.pullTombstones(project.apiId, this._idMap, findSyncConfig, db)
      } catch (err) {
        anyFailed = true
        console.error('[SyncEngine] Tombstone pull failed:', (err as Error).message)
        syncStatus.lastError = `Tombstone pull failed — ${(err as Error).message}`
      }

      const unresolved = projectErrors.filter((err) => !isStoryGoneError(err))
      const storyGone = projectErrors.length > 0 && unresolved.length === 0
      if (unresolved.length > 0) {
        anyFailed = true
        syncStatus.lastError = `Pull failed — ${project.apiId}: ${unresolved[0].message}`
      } else if (storyGone) {
        // A deleted story 404s child pulls until tombstones converge. If the
        // root tombstone preserved a dirty subtree, keep the pull honest.
        const stillLocal = project.id == null ? null : await db.projects.get(project.id)
        if (stillLocal) {
          anyFailed = true
          syncStatus.lastError = `Pull incomplete — story ${project.apiId} was deleted remotely but local edits prevent cleanup`
        }
      }
    }

    if (!anyFailed) {
      syncStatus.lastError = null
      // lastSync means "everything known pulled" — stamping it after a
      // partial failure is what made failed pulls read as synced. Push
      // already guards its stamp the same way.
      syncStatus.lastSync = new Date().toISOString()
    }
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
          if (tableName === 'deletions') {
            const fallback = await this._idMap.resolveStoryApiId()
            const { failed } = await this._transport.pushDeletions(fallback, db, findSyncConfig)
            if (failed === 0) this._failedTables.delete(tableName)
            continue
          }
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

  private _isLocalRowEligibleForSync(row: Record<string, unknown>): boolean {
    if (row.apiId) return false
    const status = String(row.syncStatus || '')
    if (status.startsWith('pending') || status === 'synced') return false
    return true
  }

  /**
   * Count local rows that were never synced and would be queued by
   * queueLocalRowsForSync(). Read-only preview for migration UX.
   */
  async countLocalRowsForSync(): Promise<{ eligible: number; tables: Record<string, number> }> {
    let eligible = 0
    const tables: Record<string, number> = {}
    for (const entity of SYNC_ENTITIES) {
      const table = db.table(entity.table)
      if (!table) continue
      const rows = (await table.toArray()) as Record<string, unknown>[]
      const count = rows.filter((row) => this._isLocalRowEligibleForSync(row)).length
      if (count > 0) {
        tables[entity.table] = count
        eligible += count
      }
    }
    return { eligible, tables }
  }

  /**
   * Mark local rows that were never synced (no apiId, not pending/synced) as
   * pending-create so an authenticated sync can push them. Used for the
   * "migrate local data to cloud account" flow. Safe to run repeatedly; rows
   * that already have an apiId or are pending/synced are left untouched.
   */
  async queueLocalRowsForSync(): Promise<{ queued: number; tables: Record<string, number> }> {
    if (!hasToken())
      throw new Error('Sign in to a server account before syncing local data to the cloud.')
    let queued = 0
    const tables: Record<string, number> = {}
    for (const entity of SYNC_ENTITIES) {
      const table = db.table(entity.table)
      if (!table) continue
      const rows = (await table.toArray()) as Record<string, unknown>[]
      const toQueue = rows.filter((row) => this._isLocalRowEligibleForSync(row))
      if (toQueue.length === 0) continue
      for (const row of toQueue) {
        const keyPath = table.schema?.primKey?.keyPath
        const key = Array.isArray(keyPath)
          ? keyPath.map((k) => (row as Record<string, unknown>)[String(k)])
          : typeof keyPath === 'string'
            ? row[keyPath]
            : row.id
        if (key == null || (Array.isArray(key) && key.some((k) => k == null))) continue
        await table.update(
          key as string | number,
          {
            syncStatus: 'pending-create',
            lastSyncedAt: null,
            _syncRevision: 1,
            _suppressHooks: true
          } as Record<string, unknown>
        )
      }
      tables[entity.table] = toQueue.length
      queued += toQueue.length
    }
    return { queued, tables }
  }
}

export default SyncEngine
