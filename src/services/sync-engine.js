import { db } from './db-core'
import { api, hasToken } from './api'
import { findSyncConfig, SYNC_ENTITIES } from './sync-mapper'

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
    this._idMap = { localToApi: {}, apiToLocal: {} }
    this._storyApiId = null
    this._destroyed = false
  }

  async init() {
    if (this.initialized || this._destroyed) return
    this._installHooks()
    await this._rebuildIdMaps()
    await this._restoreStoryId()
    this._startFlushTimer()
    this.initialized = true
  }

  destroy() {
    this._destroyed = true
    this.initialized = false
    this._uninstallHooks()
    this._stopFlushTimer()
    this._idMap = { localToApi: {}, apiToLocal: {} }
    this._storyApiId = null
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

  // ── ID maps ──────────────────────────────────────────────────

  async _rebuildIdMaps() {
    const localToApi = {}
    const apiToLocal = {}
    for (const entity of SYNC_ENTITIES) {
      const table = db[entity.table]
      if (!table) continue
      const rows = await table.toArray()
      for (const row of rows) {
        if (row.apiId && row.id) {
          const key = `${entity.table}:${row.id}`
          localToApi[key] = row.apiId
          apiToLocal[`${entity.table}:${row.apiId}`] = row.id
        }
      }
    }
    this._idMap = { localToApi, apiToLocal }
  }

  getApiId(tableName, localId) {
    return this._idMap?.localToApi?.[`${tableName}:${localId}`] || null
  }

  getLocalId(tableName, apiId) {
    return this._idMap?.apiToLocal?.[`${tableName}:${apiId}`] || null
  }

  // ── Story ID ─────────────────────────────────────────────────

  async _restoreStoryId() {
    const stored = localStorage.getItem('versatile_story_api_id')
    if (stored) this._storyApiId = stored
  }

  persistStoryId(apiId) {
    this._storyApiId = apiId
    localStorage.setItem('versatile_story_api_id', apiId)
  }

  clearStoryId() {
    this._storyApiId = null
    localStorage.removeItem('versatile_story_api_id')
  }

  async resolveStoryApiId(localProjectId) {
    if (localProjectId) {
      const mapped = this.getApiId('projects', localProjectId)
      if (mapped) return mapped
    }
    if (this._storyApiId) return this._storyApiId
    const projects = await db.projects.toArray()
    for (const p of projects) {
      if (p.apiId) {
        this.persistStoryId(p.apiId)
        return p.apiId
      }
    }
    return null
  }

  // ── Helpers ──────────────────────────────────────────────────

  _resolveEndpoint(config, storyApiId) {
    return typeof config.endpoint === 'function' ? config.endpoint(storyApiId) : config.endpoint
  }

  // ── Retry ────────────────────────────────────────────────────

  async _withRetry(fn, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        if (attempt === maxRetries) throw err
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 800))
      }
    }
  }

  // ── Push ─────────────────────────────────────────────────────

  async push() {
    if (!hasToken()) return
    const storyApiId = await this.resolveStoryApiId()
    if (!storyApiId) {
      await this._pushTable('projects')
    }
    const order = [
      'projects', 'volumes', 'characters', 'locations',
      'plotThreads', 'sections', 'subsections',
      'characterRelationships', 'volumeEntities', 'manuscripts', 'researchDocuments'
    ]
    for (const tableName of order) {
      await this._pushTable(tableName, storyApiId)
    }
    await this._pushDeletions()
  }

  async _pushTable(tableName, storyApiId) {
    const config = findSyncConfig(tableName)
    if (!config) return

    if (tableName !== 'projects' && !storyApiId) {
      storyApiId = await this.resolveStoryApiId()
      if (!storyApiId) return
    }

    const pendings = await db[tableName]
      .where('syncStatus')
      .anyOf('pending-create', 'pending-update')
      .toArray()

    for (const local of pendings) {
      await this._pushOne(config, local, storyApiId)
    }
  }

  async _pushOne(config, local, storyApiId) {
    const { table, endpoint, isTopLevel, toApi } = config
    const resolved = this._resolveEndpoint(config, storyApiId)

    try {
      const body = await toApi(local)

      if (body.storyId === undefined && !isTopLevel && storyApiId) {
        body.storyId = storyApiId
      }

      if (local.syncStatus === 'pending-create') {
        const result = await this._withRetry(() => api(resolved, { method: 'POST', body }))

        await db[table].where('id').equals(local.id).modify({
          apiId: result.id,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          _suppressHooks: true
        })

        this._idMap.localToApi[`${table}:${local.id}`] = result.id
        this._idMap.apiToLocal[`${table}:${result.id}`] = local.id

        if (table === 'projects') {
          this.persistStoryId(result.id)
        }
      } else if (local.syncStatus === 'pending-update') {
        const apiId = this.getApiId(table, local.id)
        if (!apiId) return

        await this._withRetry(() => api(`${resolved}/${apiId}`, { method: 'PUT', body }))

        await db[table].where('id').equals(local.id).modify({
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          _suppressHooks: true
        })
      }
    } catch (err) {
      console.error(`[SyncEngine] Push failed ${table}:${local.id}`, err.message)
    }
  }

  async _pushDeletions() {
    const deletions = await db.pendingDeletions.toArray()
    for (const del of deletions) {
      const config = findSyncConfig(del.table)
      if (!config) continue
      try {
        const resolved = this._resolveEndpoint(config, this._storyApiId)
        await this._withRetry(() => api(`${resolved}/${del.apiId}`, { method: 'DELETE' }))
        await db.pendingDeletions.where('id').equals(del.id).delete()
      } catch (err) {
        console.warn(`[SyncEngine] Delete failed ${del.table}:${del.apiId}`, err.message)
      }
    }
  }

  // ── Pull ─────────────────────────────────────────────────────

  async pull() {
    if (!hasToken()) return
    const storyApiId = await this.resolveStoryApiId()
    if (!storyApiId) return

    for (const entity of SYNC_ENTITIES) {
      await this._pullTable(entity, storyApiId)
    }
  }

  async _pullTable(config, storyApiId) {
    const { table, isTopLevel, fromApi, entityType, parentField } = config
    const resolved = this._resolveEndpoint(config, storyApiId)

    let localParentId = null
    if (!isTopLevel && parentField && storyApiId) {
      localParentId = this.getLocalId('projects', storyApiId)
    }

    try {
      const fetchItems = () => {
        const url = isTopLevel
          ? resolved
          : `${resolved}?${new URLSearchParams(entityType ? { storyId: storyApiId, entityType } : { storyId: storyApiId })}`
        return api(url, { method: 'GET' })
      }
      let items = await this._withRetry(fetchItems)
      if (!Array.isArray(items)) items = [items]
      if (!items.length) return

      for (const apiItem of items) {
        const existingLocalId = this.getLocalId(table, apiItem.id)
        if (existingLocalId) {
          const localRec = await db[table].get(existingLocalId)
          if (localRec && localRec.syncStatus && localRec.syncStatus !== 'synced') {
            continue
          }
        }

        const localData = await fromApi(apiItem)
        localData._suppressHooks = true

        if (!isTopLevel && parentField === 'projectId' && localParentId && !localData[parentField]) {
          localData[parentField] = localParentId
        }

        if (existingLocalId) {
          await db[table].where('id').equals(existingLocalId).modify({
            ...localData,
            id: existingLocalId,
            _suppressHooks: true
          })
        } else {
          const newId = await db[table].add(localData)
          this._idMap.localToApi[`${table}:${newId}`] = apiItem.id
          this._idMap.apiToLocal[`${table}:${apiItem.id}`] = newId
        }
      }
    } catch (err) {
      console.warn(`[SyncEngine] Pull failed ${table}`, err.message)
    }
  }

  // ── Flush timer ──────────────────────────────────────────────

  _startFlushTimer() {
    this._stopFlushTimer()
    this._flushTimer = setInterval(async () => {
      if (this._destroyed) return
      try { await this.push() } catch { /* ignore */ }
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
