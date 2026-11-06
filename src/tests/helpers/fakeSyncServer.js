/**
 * A two-client test harness for the sync contract.
 *
 * Sync has no CRDT and no version/ETag. The committed contract is:
 *   - a clean local row is overwritten by the server on pull;
 *   - a row with unpushed local edits is skipped on pull (local wins);
 *   - push is last-writer-wins, and a row edited while its push is in flight
 *     stays pending;
 *   - a remote root tombstone deletes a clean subtree, including rows that hang
 *     off a child (`volumeEntities` under `volumes`), and preserves the whole
 *     subtree when anything in it is dirty.
 *
 * This harness holds the real `SyncTransport`; only the HTTP server, Dexie
 * tables and table hooks are in memory. It is deliberately small and explicit:
 * the point is to make the conflict rules executable, not to reimplement Dexie.
 */
import { SyncTransport } from '../../services/sync-transport'

export const SYNC_TABLES = [
  'projects',
  'sections',
  'subsections',
  'characters',
  'locations',
  'plotThreads',
  'characterRelationships',
  'volumes',
  'volumeEntities',
  'manuscripts',
  'researchDocuments',
  'researchChunks',
  'researchTags',
  'branches'
]

export const TABLE_ROUTE = {
  sections: 'section',
  subsections: 'subsection',
  characters: 'entity',
  locations: 'entity',
  plotThreads: 'plot-thread',
  characterRelationships: 'character-relationship',
  volumes: 'volume',
  volumeEntities: 'volume-entity',
  manuscripts: 'manuscript',
  researchDocuments: 'research-document',
  researchChunks: 'research-chunk',
  researchTags: 'research-tag',
  branches: 'branch'
}

function createMemoryTable() {
  const rows = new Map()
  let seq = 1

  const matching = (field, value) => [...rows.values()].filter((row) => row[field] === value)
  const equals = (field, value) => ({
    toArray: async () => matching(field, value),
    first: async () => matching(field, value)[0],
    modify: async (patch) => {
      for (const row of matching(field, value)) Object.assign(row, patch)
    },
    delete: async () => {
      for (const row of matching(field, value)) rows.delete(row.id)
    }
  })

  return {
    rows,
    async get(id) {
      return rows.get(id)
    },
    async add(row) {
      const id = row.id ?? `local-${seq++}`
      rows.set(id, { ...row, id })
      return id
    },
    async delete(id) {
      rows.delete(id)
    },
    async toArray() {
      return [...rows.values()]
    },
    where(field) {
      return {
        equals: (value) => equals(field, value),
        anyOf: (...values) => ({
          toArray: async () => [...rows.values()].filter((row) => values.includes(row[field]))
        })
      }
    }
  }
}

/**
 * One client: in-memory tables, an id map, and the real transport. `create`
 * and `edit` apply the same hook semantics SyncEngine installs (pending flags
 * and `_syncRevision`).
 */
export function createClient(server) {
  const db = {}
  for (const table of SYNC_TABLES) db[table] = createMemoryTable()

  const forward = new Map()
  const reverse = new Map()
  const suppressed = new Set()
  const idMap = {
    getApiId: (table, localId) => forward.get(`${table}:${localId}`) ?? null,
    setMapping: (table, localId, apiId) => {
      forward.set(`${table}:${localId}`, apiId)
      reverse.set(`${table}:${apiId}`, localId)
    },
    removeMapping: (table, localId, apiId) => {
      forward.delete(`${table}:${localId}`)
      reverse.delete(`${table}:${apiId}`)
    },
    getLocalId: (table, apiId) => reverse.get(`${table}:${apiId}`) ?? null,
    suppressNextDelete: (table, localId) => suppressed.add(`${table}:${localId}`),
    consumeSuppressedDelete: (table, localId) => suppressed.delete(`${table}:${localId}`),
    resolveStoryApiId: async () => {
      for (const row of db.projects.rows.values()) if (row.apiId) return row.apiId
      return null
    },
    persistStoryId: () => {}
  }

  const client = {
    db,
    idMap,
    transport: new SyncTransport(server.api),

    async create(table, row, { synced = false } = {}) {
      const id = await db[table].add({
        ...row,
        syncStatus: synced ? 'synced' : 'pending-create',
        lastSyncedAt: synced ? new Date().toISOString() : null,
        apiId: row.apiId ?? null,
        _syncRevision: 1
      })
      if (row.id) db[table].rows.set(row.id, { ...db[table].rows.get(id), id: row.id })
      return row.id ?? id
    },

    edit(table, id, patch) {
      const row = db[table].rows.get(id)
      if (!row) throw new Error(`no ${table} row ${id}`)
      Object.assign(row, patch)
      if (row.syncStatus !== 'pending-create') {
        row.syncStatus = 'pending-update'
        row.lastSyncedAt = null
      }
      row._syncRevision = (Number(row._syncRevision) || 0) + 1
      return row
    },

    async push(table) {
      return client.transport.pushTable(table, idMap, server.findConfig, db)
    },

    async pull(table, storyApiId, projectId) {
      const config = server.findConfig(table)
      await client.transport.pullTable(config, storyApiId, projectId, idMap, db)
    },

    async tombstones(storyApiId) {
      return client.transport.pullTombstones(storyApiId, idMap, server.findConfig, db)
    }
  }
  return client
}

/** In-memory API implementing the endpoints SyncTransport calls. */
export function createFakeSyncServer() {
  const stories = new Map()
  const rows = new Map()
  const tombstones = []
  let seq = 1

  const key = (table, storyId) => `${table}:${storyId}`
  const tableRows = (table, storyId) => {
    if (!rows.has(key(table, storyId))) rows.set(key(table, storyId), new Map())
    return rows.get(key(table, storyId))
  }

  const server = {
    stories,
    rows,
    tombstones,
    /** Optional `async ({url, options}) => {}` gate for in-flight tests. */
    hook: null,
    findConfig: (table) => server.configs[table],

    seedStory(id, body = {}) {
      stories.set(id, { id, title: id, ...body })
    },
    seedRow(table, storyId, id, body = {}) {
      tableRows(table, storyId).set(id, { id, ...body })
    },
    rowsFor(table, storyId) {
      return [...tableRows(table, storyId).values()]
    },
    story(id) {
      return stories.get(id)
    }
  }

  async function handleBatch(storyId, body) {
    const items = []
    for (const item of body?.items ?? []) {
      const config = server.configs[item.table]
      if (!config) {
        items.push({ ref: item.ref, ok: false, error: `unknown table ${item.table}` })
        continue
      }
      const table = tableRows(item.table, storyId)
      if (item.action === 'update') {
        if (!item.apiId || !table.has(item.apiId)) {
          items.push({ ref: item.ref, ok: false, error: 'no server row' })
          continue
        }
        table.set(item.apiId, { ...table.get(item.apiId), ...item.body, id: item.apiId })
        items.push({ ref: item.ref, ok: true, apiId: item.apiId })
      } else {
        const id = `${TABLE_ROUTE[item.table] ?? item.table}-${seq++}`
        table.set(id, { ...item.body, id })
        items.push({ ref: item.ref, ok: true, apiId: id })
      }
    }
    return { items }
  }

  async function api(url, options = {}) {
    if (server.hook) await server.hook({ url, options })
    const path = String(url).split('?')[0]
    const parts = path.split('/').filter(Boolean)

    if (parts[0] !== 'story') throw Object.assign(new Error(`not found ${url}`), { status: 404 })

    if (parts.length === 1) {
      if (options.method === 'GET' || !options.method) return [...stories.values()]
      if (options.method === 'POST') {
        const id = `story-${seq++}`
        const story = {
          id,
          title: options.body?.title ?? '',
          premise: options.body?.premise ?? '',
          genre: options.body?.genre ?? '',
          tone: options.body?.tone ?? '',
          writingStyle: options.body?.writingStyle ?? '',
          targetAudience: options.body?.targetAudience ?? ''
        }
        stories.set(id, story)
        return story
      }
    }

    const storyId = parts[1]
    if (!stories.has(storyId)) {
      throw Object.assign(new Error('story not found'), { status: 404 })
    }

    if (parts[2] === 'sync' && parts[3] === 'batch') {
      return handleBatch(storyId, options.body)
    }
    if (parts[2] === 'sync' && parts[3] === 'tombstones') {
      return tombstones.filter((t) => t.storyId === storyId)
    }

    // Item routes: /story/:story/<route>/<apiId>
    if (parts.length >= 4) {
      const table = Object.keys(TABLE_ROUTE).find((name) => TABLE_ROUTE[name] === parts[2])
      if (!table) throw Object.assign(new Error(`not found ${url}`), { status: 404 })
      const tableMap = tableRows(table, storyId)
      const id = parts.slice(3).join('/')
      if (options.method === 'PUT') {
        if (!tableMap.has(id)) throw Object.assign(new Error('not found'), { status: 404 })
        tableMap.set(id, { ...tableMap.get(id), ...options.body, id })
        return tableMap.get(id)
      }
      if (options.method === 'DELETE') {
        tableMap.delete(id)
        tombstones.push({ table, rowId: id, storyId })
        return {}
      }
    }

    // Collection routes: /story/:story/<route>
    if (parts.length === 3) {
      const table = Object.keys(TABLE_ROUTE).find((name) => TABLE_ROUTE[name] === parts[2])
      if (!table) throw Object.assign(new Error(`not found ${url}`), { status: 404 })
      if (options.method === 'GET' || !options.method)
        return [...tableRows(table, storyId).values()]
      if (options.method === 'POST') {
        const id = `${parts[2]}-${seq++}`
        const row = { ...options.body, id, storyId }
        tableRows(table, storyId).set(id, row)
        return row
      }
    }

    // Top-level story update/delete: /story/:id
    if (parts.length === 2) {
      if (options.method === 'PUT') {
        const story = { ...stories.get(storyId), ...options.body, id: storyId }
        stories.set(storyId, story)
        return story
      }
      if (options.method === 'DELETE') {
        stories.delete(storyId)
        tombstones.push({ table: 'projects', rowId: storyId, storyId })
        return {}
      }
    }

    throw Object.assign(new Error(`not found ${url}`), { status: 404 })
  }

  server.api = api
  server.configs = {}
  return server
}

/** Minimal configs that mirror sync-mapper's parent/endpoint/link rules. */
export function wireConfigs(server) {
  const base = (table) => ({
    table,
    endpoint: (storyId) => `/story/${storyId}/${TABLE_ROUTE[table]}`,
    isTopLevel: false,
    parentField: 'projectId',
    toApi: (local) => {
      const body = { ...local }
      for (const key of ['id', 'syncStatus', 'lastSyncedAt', '_syncRevision', 'projectId']) {
        delete body[key]
      }
      return body
    },
    fromApi: (api) => {
      const body = { ...api }
      delete body.id
      delete body.storyId
      return {
        apiId: api.id,
        ...body,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      }
    }
  })

  server.configs.projects = {
    table: 'projects',
    endpoint: '/story',
    isTopLevel: true,
    parentField: null,
    toApi: (local) => ({
      title: local.name ?? '',
      premise: local.premise ?? '',
      genre: local.genre ?? ''
    }),
    fromApi: (api) => ({
      apiId: api.id,
      name: api.title,
      premise: api.premise ?? '',
      syncStatus: 'synced',
      lastSyncedAt: new Date().toISOString()
    })
  }
  for (const table of SYNC_TABLES) {
    if (table !== 'projects') server.configs[table] = base(table)
  }
  return server
}
