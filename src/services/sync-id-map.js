export class SyncIdMap {
  constructor(db, syncEntities) {
    this._db = db
    this._syncEntities = syncEntities
    this._idMap = { localToApi: {}, apiToLocal: {} }
    this._storyApiId = null
  }

  async rebuild() {
    const localToApi = {}
    const apiToLocal = {}
    for (const entity of this._syncEntities) {
      const table = this._db[entity.table]
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

  setMapping(tableName, localId, apiId) {
    this._idMap.localToApi[`${tableName}:${localId}`] = apiId
    this._idMap.apiToLocal[`${tableName}:${apiId}`] = localId
  }

  clear() {
    this._idMap = { localToApi: {}, apiToLocal: {} }
  }

  persistStoryId(apiId) {
    this._storyApiId = apiId
    localStorage.setItem('versatile_story_api_id', apiId)
  }

  clearStoryId() {
    this._storyApiId = null
    localStorage.removeItem('versatile_story_api_id')
  }

  getStoryId() {
    return this._storyApiId
  }

  async restoreStoryId() {
    const stored = localStorage.getItem('versatile_story_api_id')
    if (stored) this._storyApiId = stored
  }

  async resolveStoryApiId(localProjectId) {
    if (localProjectId) {
      const mapped = this.getApiId('projects', localProjectId)
      if (mapped) return mapped
    }
    if (this._storyApiId) return this._storyApiId
    const projects = await this._db.projects.toArray()
    for (const p of projects) {
      if (p.apiId) {
        this.persistStoryId(p.apiId)
        return p.apiId
      }
    }
    return null
  }
}
