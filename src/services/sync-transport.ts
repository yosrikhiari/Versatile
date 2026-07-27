type ApiFn = (url: string, options?: { method?: string; body?: unknown }) => Promise<unknown>
type FindSyncConfig = (tableName: string) => SyncEntityConfig | undefined

interface SyncEntityConfig {
  table: string
  endpoint: string | ((storyApiId: string) => string)
  isTopLevel: boolean
  parentField: string | null
  entityType?: string
  toApi: (local: Record<string, unknown>) => unknown | Promise<unknown>
  fromApi: (api: Record<string, unknown>) => unknown | Promise<unknown>
  idBridge?: {
    localParentField: string | null
    apiParentField: string | null
    needsTranslation: string[]
  }
}

interface IdMap {
  getApiId: (table: string, localId: string) => string | null
  setMapping: (table: string, localId: string, apiId: string) => void
  getLocalId: (table: string, apiId: string) => string | null
  resolveStoryApiId: (localProjectId?: string) => Promise<string | null>
  persistStoryId: (apiId: string) => void
}

export class SyncTransport {
  private _api: ApiFn

  constructor(api: ApiFn) {
    this._api = api
  }

  async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        if (attempt === maxRetries) throw err
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 800))
      }
    }
    throw new Error('Unreachable')
  }

  resolveEndpoint(config: SyncEntityConfig, storyApiId?: string): string {
    return typeof config.endpoint === 'function' ? config.endpoint(storyApiId!) : config.endpoint
  }

  async pushTable(tableName: string, storyApiId: string | null, idMap: IdMap, findSyncConfig: FindSyncConfig, db: any): Promise<void> {
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

  async pushOne(config: SyncEntityConfig, local: any, storyApiId: string | null, idMap: IdMap, db: any): Promise<void> {
    const { table, isTopLevel, toApi } = config
    const resolved = this.resolveEndpoint(config, storyApiId!)

    try {
      const body: any = await toApi(local)

      if (body.storyId === undefined && !isTopLevel && storyApiId) {
        body.storyId = storyApiId
      }

      if (local.syncStatus === 'pending-create') {
        const result: any = await this.withRetry(() => this._api(resolved, { method: 'POST', body }))

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
      console.error(`[SyncTransport] Push failed ${table}:${local.id}`, (err as Error).message)
    }
  }

  async pushDeletions(storyApiId: string | null, idMap: IdMap, db: any, findSyncConfig: FindSyncConfig): Promise<void> {
    const deletions = await db.pendingDeletions.toArray()
    for (const del of deletions) {
      const config = findSyncConfig(del.table)
      if (!config) continue
      try {
        const resolved = this.resolveEndpoint(config, storyApiId!)
        await this.withRetry(() => this._api(`${resolved}/${del.apiId}`, { method: 'DELETE' }))
        await db.pendingDeletions.where('id').equals(del.id).delete()
      } catch (err) {
        console.warn(`[SyncTransport] Delete failed ${del.table}:${del.apiId}`, (err as Error).message)
      }
    }
  }

  async pullTable(config: SyncEntityConfig, storyApiId: string | null, idMap: IdMap, db: any): Promise<void> {
    const { table, isTopLevel, fromApi, entityType, parentField } = config
    const resolved = this.resolveEndpoint(config, storyApiId!)

    let localParentId: string | null = null
    if (!isTopLevel && parentField && storyApiId) {
      localParentId = idMap.getLocalId('projects', storyApiId)
    }

    try {
      const fetchItems = () => {
        const url = isTopLevel
          ? resolved
          : `${resolved}?${new URLSearchParams((entityType ? { storyId: storyApiId!, entityType } : { storyId: storyApiId! }) as Record<string, string>)}`
        return this._api(url, { method: 'GET' })
      }
      let items: any = await this.withRetry(fetchItems)
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

        const localData: any = await fromApi(apiItem)
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
          idMap.setMapping(table, newId as string, apiItem.id)
        }
      }
    } catch (err) {
      console.warn(`[SyncTransport] Pull failed ${table}`, (err as Error).message)
    }
  }
}
