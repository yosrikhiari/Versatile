export class SyncTransport {
  constructor(api) {
    this._api = api
  }

  async withRetry(fn, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        if (attempt === maxRetries) throw err
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 800))
      }
    }
  }

  resolveEndpoint(config, storyApiId) {
    return typeof config.endpoint === 'function' ? config.endpoint(storyApiId) : config.endpoint
  }

  async pushTable(tableName, storyApiId, idMap, findSyncConfig, db) {
    const config = findSyncConfig(tableName)
    if (!config) return

    if (tableName !== 'projects' && !storyApiId) {
      storyApiId = await idMap.resolveStoryApiId()
      if (!storyApiId) return
    }

    const pendings = await db[tableName]
      .where('syncStatus')
      .anyOf('pending-create', 'pending-update')
      .toArray()

    for (const local of pendings) {
      await this.pushOne(config, local, storyApiId, idMap, db)
    }
  }

  async pushOne(config, local, storyApiId, idMap, db) {
    const { table, isTopLevel, toApi } = config
    const resolved = this.resolveEndpoint(config, storyApiId)

    try {
      const body = await toApi(local)

      if (body.storyId === undefined && !isTopLevel && storyApiId) {
        body.storyId = storyApiId
      }

      if (local.syncStatus === 'pending-create') {
        const result = await this.withRetry(() => this._api(resolved, { method: 'POST', body }))

        await db[table].where('id').equals(local.id).modify({
          apiId: result.id,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          _suppressHooks: true
        })

        idMap.setMapping(table, local.id, result.id)

        if (table === 'projects') {
          idMap.persistStoryId(result.id)
        }
      } else if (local.syncStatus === 'pending-update') {
        const apiId = idMap.getApiId(table, local.id)
        if (!apiId) return

        await this.withRetry(() => this._api(`${resolved}/${apiId}`, { method: 'PUT', body }))

        await db[table].where('id').equals(local.id).modify({
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          _suppressHooks: true
        })
      }
    } catch (err) {
      console.error(`[SyncTransport] Push failed ${table}:${local.id}`, err.message)
    }
  }

  async pushDeletions(storyApiId, idMap, db, findSyncConfig) {
    const deletions = await db.pendingDeletions.toArray()
    for (const del of deletions) {
      const config = findSyncConfig(del.table)
      if (!config) continue
      try {
        const resolved = this.resolveEndpoint(config, storyApiId)
        await this.withRetry(() => this._api(`${resolved}/${del.apiId}`, { method: 'DELETE' }))
        await db.pendingDeletions.where('id').equals(del.id).delete()
      } catch (err) {
        console.warn(`[SyncTransport] Delete failed ${del.table}:${del.apiId}`, err.message)
      }
    }
  }

  async pullTable(config, storyApiId, idMap, db) {
    const { table, isTopLevel, fromApi, entityType, parentField } = config
    const resolved = this.resolveEndpoint(config, storyApiId)

    let localParentId = null
    if (!isTopLevel && parentField && storyApiId) {
      localParentId = idMap.getLocalId('projects', storyApiId)
    }

    try {
      const fetchItems = () => {
        const url = isTopLevel
          ? resolved
          : `${resolved}?${new URLSearchParams(entityType ? { storyId: storyApiId, entityType } : { storyId: storyApiId })}`
        return this._api(url, { method: 'GET' })
      }
      let items = await this.withRetry(fetchItems)
      if (!Array.isArray(items)) items = [items]
      if (!items.length) return

      for (const apiItem of items) {
        const existingLocalId = idMap.getLocalId(table, apiItem.id)
        if (existingLocalId) {
          const localRec = await db[table].get(existingLocalId)
          if (localRec && localRec.syncStatus && localRec.syncStatus !== 'synced') {
            continue
          }
        }

        const localData = await fromApi(apiItem)
        localData._suppressHooks = true

        if (
          !isTopLevel &&
          parentField === 'projectId' &&
          localParentId &&
          !localData[parentField]
        ) {
          localData[parentField] = localParentId
        }

        if (existingLocalId) {
          await db[table]
            .where('id')
            .equals(existingLocalId)
            .modify({
              ...localData,
              id: existingLocalId,
              _suppressHooks: true
            })
        } else {
          const newId = await db[table].add(localData)
          idMap.setMapping(table, newId, apiItem.id)
        }
      }
    } catch (err) {
      console.warn(`[SyncTransport] Pull failed ${table}`, err.message)
    }
  }
}
