/**
 * The only field this class reads off a sync entity. Kept deliberately narrow (no
 * `[key: string]: unknown` index signature) so the richer `SyncEntityConfig` from
 * `sync-mapper` is structurally assignable to it.
 */
interface SyncEntityInfo {
  table: string
}

export class SyncIdMap {
  private _db: any
  private _syncEntities: SyncEntityInfo[]
  private _idMap: { localToApi: Record<string, string>; apiToLocal: Record<string, string> }
  private _storyApiId: string | null

  constructor(db: any, syncEntities: SyncEntityInfo[]) {
    this._db = db
    this._syncEntities = syncEntities
    this._idMap = { localToApi: {}, apiToLocal: {} }
    this._storyApiId = null
  }

  async rebuild(): Promise<void> {
    const localToApi: Record<string, string> = {}
    const apiToLocal: Record<string, string> = {}
    for (const entity of this._syncEntities) {
      const table = this._db[entity.table]
      if (!table) continue
      const rows: any[] = await table.toArray()
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

  getApiId(tableName: string, localId: string): string | null {
    return this._idMap?.localToApi?.[`${tableName}:${localId}`] || null
  }

  getLocalId(tableName: string, apiId: string): string | null {
    return this._idMap?.apiToLocal?.[`${tableName}:${apiId}`] || null
  }

  setMapping(tableName: string, localId: string, apiId: string): void {
    this._idMap.localToApi[`${tableName}:${localId}`] = apiId
    this._idMap.apiToLocal[`${tableName}:${apiId}`] = localId
  }

  clear(): void {
    this._idMap = { localToApi: {}, apiToLocal: {} }
  }

  persistStoryId(apiId: string): void {
    this._storyApiId = apiId
    localStorage.setItem('versatile_story_api_id', apiId)
  }

  clearStoryId(): void {
    this._storyApiId = null
    localStorage.removeItem('versatile_story_api_id')
  }

  getStoryId(): string | null {
    return this._storyApiId
  }

  async restoreStoryId(): Promise<void> {
    const stored = localStorage.getItem('versatile_story_api_id')
    if (stored) this._storyApiId = stored
  }

  async resolveStoryApiId(localProjectId?: string): Promise<string | null> {
    if (localProjectId) {
      const mapped = this.getApiId('projects', localProjectId)
      if (mapped) return mapped
    }
    if (this._storyApiId) return this._storyApiId
    const projects: any[] = await this._db.projects.toArray()
    for (const p of projects) {
      if (p.apiId) {
        this.persistStoryId(p.apiId)
        return p.apiId
      }
    }
    return null
  }
}
