import { guardSyncPush } from '../guardrails/integration/storageGuardrails'

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
  /** Rows reference other rows of the same table; push them one at a time. */
  selfReferencing?: boolean
}

interface IdMap {
  getApiId: (table: string, localId: string) => string | null
  setMapping: (table: string, localId: string, apiId: string) => void
  getLocalId: (table: string, apiId: string) => string | null
  resolveStoryApiId: (localProjectId?: string) => Promise<string | null>
  persistStoryId: (apiId: string) => void
}

/** A local Dexie row, or a server row as it arrives. */
type Row = Record<string, unknown>
type ApiRow = Row & { id?: string; type?: string }
/** A paged list answer (stories, volumes); other lists are plain arrays. */
interface Page {
  items?: ApiRow[]
  hasNextPage?: boolean
}

/** Concurrent requests per table during a push. */
const PUSH_CONCURRENCY = 4

/** Rate-limit waits per request before giving up (each up to a minute). */
const MAX_THROTTLE_WAITS = 5

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving nothing
 * about order except that item i starts no later than item i + limit.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export class SyncTransport {
  private _api: ApiFn

  constructor(api: ApiFn) {
    this._api = api
  }

  /**
   * Retry transient failures. A 429 waits out the server's `Retry-After`
   * (sync sends a request per row, so a first push of a book meets the
   * per-IP window) without spending an attempt; any other 4xx is final,
   * since it fails the same way again and each retry spends that window.
   */
  async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0
    let throttled = 0
    for (;;) {
      try {
        return await fn()
      } catch (err) {
        const { status, retryAfter } = err as { status?: number; retryAfter?: number }
        if (status === 429 && throttled < MAX_THROTTLE_WAITS) {
          throttled++
          await new Promise((r) => setTimeout(r, (retryAfter ?? 10) * 1000))
          continue
        }
        if (status && status >= 400 && status < 500 && status !== 408) throw err
        if (attempt >= maxRetries) throw err
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 800))
        attempt++
      }
    }
  }

  resolveEndpoint(config: SyncEntityConfig, storyApiId?: string): string {
    return typeof config.endpoint === 'function' ? config.endpoint(storyApiId!) : config.endpoint
  }

  /**
   * The server story a row belongs to: its project's server id. Volume
   * memberships carry no `projectId`, so theirs comes through the volume.
   * Every row used to go to one global story id, so a second project's
   * characters were filed under the first project's story.
   */
  async storyApiIdFor(table: string, local: Row, idMap: IdMap, db: any): Promise<string | null> {
    let projectId = local.projectId
    if (projectId == null && table === 'volumeEntities' && local.volumeId != null) {
      projectId = (await db.volumes.get(local.volumeId))?.projectId
    }
    if (projectId == null) return null
    const mapped = idMap.getApiId('projects', String(projectId))
    if (mapped) return mapped
    return (await db.projects.get(projectId))?.apiId || null
  }

  async pushTable(
    tableName: string,
    idMap: IdMap,
    findSyncConfig: FindSyncConfig,
    db: any
  ): Promise<{ pushed: number; failed: number; deferred: number }> {
    const config = findSyncConfig(tableName)
    if (!config) return { pushed: 0, failed: 0, deferred: 0 }

    const pendings = await db[tableName]
      .where('syncStatus')
      .anyOf('pending-create', 'pending-update')
      .toArray()

    // Single choke point for every outbound row. Reports orphaned or malformed
    // rows to the guardrail feed; never blocks — sync runs on a background
    // timer, so aborting here would strand local changes with no visible cause.
    guardSyncPush(tableName, pendings, { entryPoint: `sync-transport.pushTable.${tableName}` })

    // Per-row outcomes surface instead of vanishing: the engine feeds
    // failures into its retry queue and status, so a failed row no longer
    // reads as synced while rotting in pending-* forever.
    // Rows within one table are independent of each other — parents live in
    // tables pushed earlier — so they go out a few at a time instead of one
    // request after another. Branches reference branches, so they stay serial.
    // A row whose project has no server story yet is deferred, not failed: it
    // stays pending and goes out on the cycle after its project does.
    const limit = config.selfReferencing ? 1 : PUSH_CONCURRENCY
    const outcomes = await mapWithConcurrency(pendings, limit, async (local: Row) => {
      if (tableName === 'projects') return this.pushOne(config, local, null, idMap, db)
      const storyApiId = await this.storyApiIdFor(tableName, local, idMap, db)
      if (!storyApiId) return 'deferred' as const
      return this.pushOne(config, local, storyApiId, idMap, db)
    })
    let pushed = 0
    let failed = 0
    let deferred = 0
    for (const outcome of outcomes) {
      if (outcome === 'deferred') deferred++
      else if (outcome) pushed++
      else failed++
    }
    return { pushed, failed, deferred }
  }

  async pushOne(
    config: SyncEntityConfig,
    local: any,
    storyApiId: string | null,
    idMap: IdMap,
    db: any
  ): Promise<boolean> {
    const { table, isTopLevel, toApi } = config
    const resolved = this.resolveEndpoint(config, storyApiId!)

    try {
      const body: any = await toApi(local)

      if (body.storyId === undefined && !isTopLevel && storyApiId) {
        body.storyId = storyApiId
      }

      if (local.syncStatus === 'pending-create') {
        const knownApiId = idMap.getApiId(table, local.id)
        if (knownApiId) {
          // A previous POST already created this server-side, but the local
          // write recording it was lost (crash between POST and modify), so
          // the row still reads pending-create. PUT-update the known record
          // instead of POSTing a duplicate, then mark it synced.
          await this.withRetry(() =>
            this._api(`${resolved}/${knownApiId}`, { method: 'PUT', body })
          )

          await db[table].where('id').equals(local.id).modify({
            apiId: knownApiId,
            syncStatus: 'synced',
            lastSyncedAt: new Date().toISOString(),
            _suppressHooks: true
          })
          return true
        }

        const result: any = await this.withRetry(() =>
          this._api(resolved, { method: 'POST', body })
        )
        // Without an id the row would be marked synced with no server twin,
        // and every later edit would PUT nowhere. Leave it pending instead.
        if (!result?.id) throw new Error('server returned no id')

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
        // No server record to update: nothing to do, not a failure. (A
        // pending-update without an apiId is itself suspicious, but inventing
        // a POST here would risk the duplicates the PUT path exists to avoid.)
        if (!apiId) return true

        await this.withRetry(() => this._api(`${resolved}/${apiId}`, { method: 'PUT', body }))

        await db[table].where('id').equals(local.id).modify({
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          _suppressHooks: true
        })
        return true
      }
      // Unknown syncStatus: no-op, counted as pushed (nothing pending).
      return true
    } catch (err) {
      console.error(`[SyncTransport] Push failed ${table}:${local.id}`, (err as Error).message)
      return false
    }
  }

  /**
   * Deletes go to the story recorded when the row was deleted (the delete
   * hook stores it); `fallbackStoryApiId` covers rows queued before that.
   */
  async pushDeletions(
    fallbackStoryApiId: string | null,
    db: any,
    findSyncConfig: FindSyncConfig
  ): Promise<void> {
    const deletions = await db.pendingDeletions.toArray()
    for (const del of deletions) {
      const config = findSyncConfig(del.table)
      if (!config) continue
      const storyApiId = del.storyApiId || fallbackStoryApiId
      if (!config.isTopLevel && !storyApiId) continue
      try {
        const resolved = this.resolveEndpoint(config, storyApiId!)
        await this.withRetry(() => this._api(`${resolved}/${del.apiId}`, { method: 'DELETE' }))
        await db.pendingDeletions.where('id').equals(del.id).delete()
      } catch (err) {
        console.warn(
          `[SyncTransport] Delete failed ${del.table}:${del.apiId}`,
          (err as Error).message
        )
      }
    }
  }

  /**
   * Every row of one list endpoint. The server answers either a plain array or
   * a page (`{ items, hasNextPage }`, stories and volumes); pages are followed
   * to the end at the largest size the server allows.
   */
  async fetchAll(url: string): Promise<ApiRow[]> {
    const all: ApiRow[] = []
    for (let page = 1; page <= 1000; page++) {
      const sep = url.includes('?') ? '&' : '?'
      const res = (await this.withRetry(() =>
        this._api(`${url}${sep}page=${page}&pageSize=100`, { method: 'GET' })
      )) as ApiRow[] | Page | null
      if (Array.isArray(res)) return res
      if (!res || !Array.isArray(res.items)) return all
      all.push(...res.items)
      if (!res.hasNextPage || res.items.length === 0) return all
    }
    return all
  }

  /**
   * Pull one table of one story into the local project `localProjectId`
   * (null for the top-level projects table). Rows with unpushed local edits
   * are left alone; the next push carries them up.
   */
  async pullTable(
    config: SyncEntityConfig,
    storyApiId: string | null,
    localProjectId: string | number | null,
    idMap: IdMap,
    db: any
  ): Promise<void> {
    const { table, isTopLevel, fromApi, entityType, parentField } = config
    const resolved = this.resolveEndpoint(config, storyApiId!)

    try {
      let items = await this.fetchAll(resolved)
      // Characters and locations share the server's entity endpoint, which
      // lists every type; without this each pulled into the other's table.
      if (entityType) items = items.filter((it) => it?.type === entityType)

      for (const apiItem of items) {
        if (!apiItem?.id) continue
        const existingLocalId = idMap.getLocalId(table, apiItem.id)
        if (existingLocalId) {
          const localRec = await db[table].get(existingLocalId)
          if (localRec && localRec.syncStatus && localRec.syncStatus !== 'synced') {
            continue
          }
        }

        const localData: any = await fromApi(apiItem)
        localData._suppressHooks = true

        if (!isTopLevel && parentField === 'projectId' && localProjectId != null) {
          localData.projectId = localProjectId
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
      throw err
    }
  }
}
