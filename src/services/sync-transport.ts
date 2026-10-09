import { guardSyncPush } from '../guardrails/integration/storageGuardrails'
import type { VersatileDB } from './db-core'

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
  removeMapping: (table: string, localId: string, apiId: string) => void
  suppressNextDelete: (table: string, localId: string) => void
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

/** Minimal Dexie surface the batched push and tombstone pull touch. */
interface SyncTable {
  where(field: string): {
    equals(value: unknown): {
      modify(patch: Row): Promise<unknown>
      first(): Promise<Row | undefined>
    }
    anyOf(...values: string[]): { toArray(): Promise<Row[]> }
  }
  get(id: unknown): Promise<Row | undefined>
  delete(id: unknown): Promise<void>
}

interface BatchResultItem {
  ref?: string
  ok?: boolean
  apiId?: string
  error?: string
}

/** Concurrent requests per table during a push. */
const PUSH_CONCURRENCY = 4

/** Rows per sync-batch request. Matches the server's page size convention. */
const BATCH_CHUNK = 100

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

    // Projects are one or two rows with no story yet; batching buys nothing.
    // Every other table goes out in chunks of BATCH_CHUNK per story instead
    // of one request per row (a book's first push met the 100/min window).
    if (tableName !== 'projects') {
      const batched = await this.pushTableBatched(tableName, config, pendings, idMap, db)
      if (batched) return batched
      // Batch endpoint unknown (old server): fall through to per-row.
    }

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

  /**
   * Push one table in batch chunks, grouped by story. Returns null when the
   * server has no batch endpoint so the caller falls back to per-row pushes.
   * Bodies are built with the same `toApi` (same link translation, same
   * throws for unpushed targets) so a row that cannot be built fails exactly
   * as it would have per row.
   */
  private async pushTableBatched(
    tableName: string,
    config: SyncEntityConfig,
    pendings: Row[],
    idMap: IdMap,
    db: VersatileDB
  ): Promise<{ pushed: number; failed: number; deferred: number } | null> {
    type Built = {
      local: Row
      storyApiId: string
      action: string
      apiId: string | null
      body: unknown
    }
    const built: Built[] = []
    let deferred = 0
    let buildFailed = 0
    for (const local of pendings) {
      const storyApiId = await this.storyApiIdFor(tableName, local, idMap, db)
      if (!storyApiId) {
        deferred++
        continue
      }
      try {
        let action = local.syncStatus === 'pending-update' ? 'update' : 'create'
        let apiId: string | null = null
        if (action === 'create') {
          // Same crash-recovery rule as pushOne: a previous POST already
          // created this server-side, so PUT-update instead of duplicating.
          apiId = idMap.getApiId(tableName, String(local.id))
          if (apiId) action = 'update'
        } else {
          // Same no-op rule as pushOne: no server record, nothing to update.
          apiId = idMap.getApiId(tableName, String(local.id))
          if (!apiId) {
            built.push({ local, storyApiId, action: 'noop', apiId: null, body: null })
            continue
          }
        }
        const body = await config.toApi(local)
        if ((body as Row).storyId === undefined && storyApiId) {
          ;(body as Row).storyId = storyApiId
        }
        built.push({ local, storyApiId, action, apiId, body })
      } catch {
        buildFailed++
      }
    }

    // Group by story, preserving row order inside each group (branches carry
    // source-before-fork order; the server applies items sequentially).
    const groups = new Map<string, Built[]>()
    for (const item of built) {
      const group = groups.get(item.storyApiId) ?? []
      group.push(item)
      groups.set(item.storyApiId, group)
    }

    let pushed = 0
    let failed = buildFailed
    for (const [storyApiId, items] of groups) {
      for (let i = 0; i < items.length; i += BATCH_CHUNK) {
        const chunk = items.slice(i, i + BATCH_CHUNK)
        const chunkResult = await this.pushBatchChunk(tableName, storyApiId, chunk, idMap, db)
        if (chunkResult === null) return null
        pushed += chunkResult.pushed
        failed += chunkResult.failed
      }
    }
    // No-op rows (pending-update with no server twin) count as pushed, as in pushOne.
    for (const item of built) {
      if (item.action === 'noop') pushed++
    }
    return { pushed, failed, deferred }
  }

  /**
   * One batch chunk. Returns null only when the endpoint itself is unknown
   * (old server) so the caller can fall back to per-row pushes; every other
   * outcome (including per-item errors) is final for this cycle.
   */
  private async pushBatchChunk(
    tableName: string,
    storyApiId: string,
    chunk: Array<{ local: Row; action: string; apiId: string | null; body: unknown }>,
    idMap: IdMap,
    db: VersatileDB
  ): Promise<{ pushed: number; failed: number } | null> {
    const tables = db as unknown as Record<string, SyncTable>
    let res: unknown
    try {
      res = await this.withRetry(() =>
        this._api(`/story/${storyApiId}/sync/batch`, {
          method: 'POST',
          body: {
            items: chunk.map((c) => ({
              table: tableName,
              action: c.action,
              ref: String(c.local.id),
              apiId: c.apiId,
              body: c.body
            }))
          }
        })
      )
    } catch (err) {
      const { status } = err as { status?: number }
      // Old server without the batch endpoint: caller falls back to per-row.
      if (status === 404 || status === 405) return null
      console.error(`[SyncTransport] Batch push failed ${tableName}`, (err as Error).message)
      return { pushed: 0, failed: chunk.length }
    }

    const raw: unknown =
      res && typeof res === 'object' ? ((res as { items?: unknown }).items ?? res) : null
    if (!Array.isArray(raw)) {
      // A malformed batch answer (e.g. a wrapped envelope with no items, the
      // shape that once made pushes silently lose server ids): fail the chunk,
      // keep every row pending. Never throw out of the push path.
      console.error(`[SyncTransport] Batch push answered without items ${tableName}`)
      return { pushed: 0, failed: chunk.length }
    }
    const results: BatchResultItem[] = raw as BatchResultItem[]
    const byRef = new Map(results.map((r) => [r.ref, r]))
    let pushed = 0
    let failed = 0
    for (const item of chunk) {
      const result = byRef.get(String(item.local.id))
      if (result?.ok) {
        const apiId = item.action === 'create' ? result.apiId : item.apiId
        // Without an id the row would be marked synced with no server twin.
        if (!apiId) {
          failed++
          continue
        }
        await tables[tableName].where('id').equals(item.local.id).modify({
          apiId,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          _suppressHooks: true
        })
        idMap.setMapping(tableName, String(item.local.id), apiId)
        pushed++
      } else {
        if (result && result.error) {
          console.error(
            `[SyncTransport] Batch item failed ${tableName}:${item.local.id}`,
            result.error
          )
        }
        failed++
      }
    }
    return { pushed, failed }
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
   * Apply the server's deletion records for one story to the local project.
   * A tombstone deletes the local row only when it is clean (synced): a row
   * with unpushed local edits keeps local-wins, like everywhere else. The
   * delete is hook-suppressed so it is not queued back to a server that
   * already deleted it (that DELETE would 404 and retry forever).
   */
  async pullTombstones(
    storyApiId: string,
    idMap: IdMap,
    findSyncConfig: FindSyncConfig,
    db: VersatileDB
  ): Promise<{ applied: number; skipped: number }> {
    const tables = db as unknown as Record<string, SyncTable>
    let applied = 0
    let skipped = 0
    let tombstones: ApiRow[] = []
    try {
      tombstones = await this.fetchAll(`/story/${storyApiId}/sync/tombstones`)
    } catch (err) {
      console.warn('[SyncTransport] Tombstone pull failed', (err as Error).message)
      throw err
    }

    for (const tomb of tombstones) {
      const table = typeof tomb?.table === 'string' ? tomb.table : null
      const rowId = tomb?.rowId == null ? null : String(tomb.rowId)
      if (!table || !rowId || !findSyncConfig(table)) {
        skipped++
        continue
      }
      const localId =
        idMap.getLocalId(table, rowId) ??
        (await tables[table].where('apiId').equals(rowId).first())?.id ??
        null
      if (localId == null) {
        skipped++
        continue
      }
      const localRec = await tables[table].get(localId)
      if (!localRec) {
        idMap.removeMapping(table, String(localId), rowId)
        skipped++
        continue
      }
      if (localRec.syncStatus && localRec.syncStatus !== 'synced') {
        skipped++
        continue
      }
      idMap.suppressNextDelete(table, String(localId))
      await tables[table].delete(localId)
      idMap.removeMapping(table, String(localId), rowId)
      applied++
    }
    return { applied, skipped }
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
