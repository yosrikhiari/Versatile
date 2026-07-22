import { db } from './db-core'
import { api, hasToken } from './api'
import { findSyncConfig, SYNC_ENTITIES } from './sync-mapper'
import { SyncIdMap } from './sync-id-map'
import { SyncTransport } from './sync-transport'


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
    this._destroyed = false
    this._idMap = new SyncIdMap(db, SYNC_ENTITIES)
    this._transport = new SyncTransport(api)
  }

  async init() {
    if (this.initialized || this._destroyed) return
    this._installHooks()
    await this._idMap.rebuild()
    await this._idMap.restoreStoryId()
    this._startFlushTimer()
    this.initialized = true
  }

  destroy() {
    this._destroyed = true
    this.initialized = false
    this._uninstallHooks()
    this._stopFlushTimer()
    this._idMap.clear()
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
    const storyApiId = await this._idMap.resolveStoryApiId()
    if (!storyApiId) {
      await this._transport.pushTable('projects', null, this._idMap, findSyncConfig, db)
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
    for (const tableName of order) {
      await this._transport.pushTable(tableName, storyApiId, this._idMap, findSyncConfig, db)
    }
    await this._transport.pushDeletions(storyApiId, this._idMap, db, findSyncConfig)
  }

  // ── Pull ─────────────────────────────────────────────────────

  async pull() {
    if (!hasToken()) return
    const storyApiId = await this._idMap.resolveStoryApiId()
    if (!storyApiId) return

    for (const entity of SYNC_ENTITIES) {
      await this._transport.pullTable(entity, storyApiId, this._idMap, db)
    }
  }

  // ── Flush timer ──────────────────────────────────────────────

  _startFlushTimer() {
    this._stopFlushTimer()
    this._flushTimer = setInterval(async () => {
      if (this._destroyed) return
      try {
        await this.push()
      } catch {
        /* ignore */
      }
    }, 30_000)
  }

  _stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
  }

  async syncNow() {
    await this.push()
    await this.pull()
  }
}

export default SyncEngine
