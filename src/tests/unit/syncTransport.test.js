import { describe, it, expect } from 'vitest'
import { SyncTransport } from '../../services/sync-transport'
import { findSyncConfig } from '../../services/sync-mapper'

// Chained mock that mimics the Dexie surface pushOne touches:
//   db[table].where('id').equals(id).modify(patch)
function makeMockDb() {
  const rows = new Map()
  const table = {
    where: (field) => ({
      equals: (id) => ({
        modify: async (patch) => {
          const row = rows.get(id)
          if (row) Object.assign(row, patch)
        }
      }),
      anyOf: (...statuses) => ({
        toArray: async () => [...rows.values()].filter((r) => statuses.includes(r[field]))
      })
    }),
    add: async (row) => {
      rows.set(row.id, row)
      return row.id
    }
  }
  return { rows, db: new Proxy({}, { get: () => table }) }
}

function makeIdMap() {
  // Projects p1 / p2 are already on the server as story-1 / story-2.
  const store = new Map([
    ['projects:p1', 'story-1'],
    ['projects:p2', 'story-2']
  ])
  return {
    getApiId: (t, id) => store.get(`${t}:${id}`) ?? null,
    setMapping: (t, id, apiId) => store.set(`${t}:${id}`, apiId),
    getLocalId: () => null,
    resolveStoryApiId: async () => 'story-1',
    persistStoryId: () => {}
  }
}

const CONFIG = {
  table: 'characters',
  endpoint: '/api/characters',
  isTopLevel: false,
  parentField: 'projectId',
  toApi: async (local) => ({ ...local })
}

describe('SyncTransport.pushOne idempotency', () => {
  it('does not POST a duplicate when a pending-create row is re-pushed', async () => {
    const { db } = makeMockDb()
    const idMap = makeIdMap()
    let postCount = 0
    const api = async (url, opts) => {
      if (opts.method === 'POST') postCount++
      return { id: `api-${postCount}` }
    }
    const transport = new SyncTransport(api)

    const row = { id: 'local-1', syncStatus: 'pending-create' }

    // First cycle: POST succeeds, then the local write fails (simulated outside
    // pushOne by leaving syncStatus unchanged) so the row stays pending-create.
    await transport.pushOne(CONFIG, row, 'story-1', idMap, db)
    // Second sync cycle re-encounters the still-pending row.
    await transport.pushOne(CONFIG, row, 'story-1', idMap, db)

    expect(postCount).toBe(1)
  })

  it('reuses the server id from a prior POST instead of creating a new row', async () => {
    const { db, rows } = makeMockDb()
    const idMap = makeIdMap()
    const api = async (url, opts) => {
      if (opts.method === 'POST') return { id: 'api-first' }
      if (opts.method === 'PUT') return { id: 'api-first' }
      return {}
    }
    const transport = new SyncTransport(api)
    const row = { id: 'local-2', syncStatus: 'pending-create' }
    rows.set('local-2', { ...row })

    await transport.pushOne(CONFIG, row, 'story-1', idMap, db)
    await transport.pushOne(CONFIG, row, 'story-1', idMap, db)

    // The second call must be a PUT against the existing id, not a second POST.
    expect(rows.get('local-2').apiId).toBe('api-first')
    expect(rows.get('local-2').syncStatus).toBe('synced')
  })

  it('pushOne reports false when the row cannot be pushed', async () => {
    const { db } = makeMockDb()
    const idMap = makeIdMap()
    const api = async () => {
      throw new Error('server down')
    }
    const transport = new SyncTransport(api)
    const row = { id: 'local-3', syncStatus: 'pending-create' }

    const ok = await transport.pushOne(CONFIG, row, 'story-1', idMap, db)

    expect(ok).toBe(false)
  })

  it('pushTable counts pushed vs failed rows instead of swallowing', async () => {
    const { db, rows } = makeMockDb()
    rows.set('good-1', { id: 'good-1', syncStatus: 'pending-create', projectId: 'p1' })
    rows.set('bad-1', { id: 'bad-1', syncStatus: 'pending-create', projectId: 'p1' })
    const idMap = makeIdMap()
    const api = async () => {
      throw new Error('server down')
    }
    const transport = new SyncTransport(api)
    const result = await transport.pushTable('characters', idMap, () => CONFIG, db)

    expect(result).toEqual({ pushed: 0, failed: 2, deferred: 0 })
  })
})

describe('SyncTransport.pushTable batching', () => {
  function harness(rowCount) {
    const { rows, db } = makeMockDb()
    for (let i = 0; i < rowCount; i++) {
      rows.set(`local-${i}`, { id: `local-${i}`, syncStatus: 'pending-create', projectId: 'p1' })
    }
    const calls = []
    const api = async (url, opts) => {
      calls.push({ url, body: opts?.body })
      const items = opts?.body?.items ?? []
      return {
        items: items.map((it, i) => ({ ref: it.ref, ok: true, apiId: `api-${it.ref}-${i}` }))
      }
    }
    return { db, api, calls, rows }
  }

  it('pushes a table in one batch request instead of one request per row', async () => {
    const h = harness(10)
    const transport = new SyncTransport(h.api)
    const result = await transport.pushTable('characters', makeIdMap(), () => CONFIG, h.db)
    expect(result).toEqual({ pushed: 10, failed: 0, deferred: 0 })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].url).toBe('/story/story-1/sync/batch')
    expect(h.calls[0].body.items).toHaveLength(10)
    expect([...h.rows.values()].every((r) => r.syncStatus === 'synced')).toBe(true)
    expect([...h.rows.values()].every((r) => r.apiId?.startsWith('api-local-'))).toBe(true)
  })

  it('falls back to per-row pushes when the server has no batch endpoint', async () => {
    const h = harness(3)
    let posts = 0
    const api = async (url, opts) => {
      if (url.endsWith('/sync/batch')) throw Object.assign(new Error('not found'), { status: 404 })
      if (opts.method === 'POST') posts++
      return { id: `api-${posts}` }
    }
    const transport = new SyncTransport(api)
    const result = await transport.pushTable('characters', makeIdMap(), () => CONFIG, h.db)
    expect(result).toEqual({ pushed: 3, failed: 0, deferred: 0 })
    expect(posts).toBe(3)
  })

  it('keeps a self-referencing table in request order inside the batch', async () => {
    const h = harness(6)
    const transport = new SyncTransport(h.api)
    const config = { ...CONFIG, table: 'branches', selfReferencing: true }
    await transport.pushTable('branches', makeIdMap(), () => config, h.db)
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].body.items.map((i) => i.ref)).toEqual([
      'local-0',
      'local-1',
      'local-2',
      'local-3',
      'local-4',
      'local-5'
    ])
  })

  it('marks rows failed when their batch item fails, without failing the chunk', async () => {
    const { db, rows } = makeMockDb()
    rows.set('good-1', { id: 'good-1', syncStatus: 'pending-create', projectId: 'p1' })
    rows.set('bad-1', { id: 'bad-1', syncStatus: 'pending-create', projectId: 'p1' })
    const api = async () => ({
      items: [
        { ref: 'good-1', ok: true, apiId: 'api-good' },
        { ref: 'bad-1', ok: false, error: 'boom' }
      ]
    })
    const result = await new SyncTransport(api).pushTable(
      'characters',
      makeIdMap(),
      () => CONFIG,
      db
    )
    expect(result).toEqual({ pushed: 1, failed: 1, deferred: 0 })
    expect(rows.get('good-1').syncStatus).toBe('synced')
    expect(rows.get('bad-1').syncStatus).toBe('pending-create')
  })
})

describe('SyncTransport.pushTable story routing', () => {
  const ROUTED = {
    ...CONFIG,
    endpoint: (storyApiId) => `/story/${storyApiId}/entity`
  }

  it("sends each story's rows to its own batch endpoint, not one global story", async () => {
    const { db, rows } = makeMockDb()
    rows.set('a', { id: 'a', syncStatus: 'pending-create', projectId: 'p1' })
    rows.set('b', { id: 'b', syncStatus: 'pending-create', projectId: 'p2' })
    const urls = []
    const api = async (url, opts) => {
      urls.push(url)
      const items = opts?.body?.items ?? []
      return { items: items.map((it) => ({ ref: it.ref, ok: true, apiId: `srv-${it.ref}` })) }
    }
    await new SyncTransport(api).pushTable('characters', makeIdMap(), () => ROUTED, db)

    expect(urls.sort()).toEqual(['/story/story-1/sync/batch', '/story/story-2/sync/batch'])
  })

  it('defers a row whose project has no server story yet instead of failing it', async () => {
    const { db, rows } = makeMockDb()
    // The mock answers every table with the same object; `get` finds no project.
    db.projects.get = async () => undefined
    rows.set('c', { id: 'c', syncStatus: 'pending-create', projectId: 'p-new' })
    let calls = 0
    const api = async () => {
      calls++
      return { id: 'x' }
    }
    const result = await new SyncTransport(api).pushTable(
      'characters',
      makeIdMap(),
      () => ROUTED,
      db
    )

    expect(result).toEqual({ pushed: 0, failed: 0, deferred: 1 })
    expect(calls).toBe(0)
    expect(rows.get('c').syncStatus).toBe('pending-create')
  })

  it('leaves a row pending when the server answers without an id', async () => {
    const { db, rows } = makeMockDb()
    rows.set('d', { id: 'd', syncStatus: 'pending-create', projectId: 'p1' })
    // A still-wrapped envelope: the shape every POST had before api() unwrapped it.
    const api = async () => ({ data: { id: 'wrapped' } })
    const result = await new SyncTransport(api).pushTable(
      'characters',
      makeIdMap(),
      () => ROUTED,
      db
    )

    expect(result.failed).toBe(1)
    expect(rows.get('d').syncStatus).toBe('pending-create')
  })
})

describe('SyncTransport.pullTable', () => {
  function pullDb() {
    const rows = []
    let next = 1
    const table = {
      get: async (id) => rows.find((r) => r.id === id),
      add: async (row) => {
        const id = `local-${next++}`
        rows.push({ ...row, id })
        return id
      },
      where: () => ({ equals: () => ({ modify: async () => {} }) })
    }
    return { rows, db: new Proxy({}, { get: () => table }) }
  }

  it('follows server pages to the end', async () => {
    const { db, rows } = pullDb()
    const urls = []
    const api = async (url) => {
      urls.push(url)
      const page = Number(new URL(url, 'http://x').searchParams.get('page'))
      return page === 1
        ? { items: [{ id: 's1', title: 'A' }], hasNextPage: true }
        : { items: [{ id: 's2', title: 'B' }], hasNextPage: false }
    }
    const config = {
      table: 'projects',
      endpoint: '/story',
      isTopLevel: true,
      parentField: null,
      fromApi: (a) => ({ name: a.title })
    }
    await new SyncTransport(api).pullTable(config, null, null, makeIdMap(), db)

    expect(rows.map((r) => r.name)).toEqual(['A', 'B'])
    expect(urls).toEqual(['/story?page=1&pageSize=100', '/story?page=2&pageSize=100'])
  })

  it('keeps characters and locations apart on the shared entity endpoint', async () => {
    const { db, rows } = pullDb()
    const api = async () => [
      { id: 'e1', type: 'Character', name: 'Ines' },
      { id: 'e2', type: 'Location', name: 'Docks' }
    ]
    const config = {
      table: 'characters',
      endpoint: (s) => `/story/${s}/entity`,
      isTopLevel: false,
      parentField: 'projectId',
      entityType: 'Character',
      fromApi: (a) => ({ name: a.name })
    }
    await new SyncTransport(api).pullTable(config, 'story-2', 'p2', makeIdMap(), db)

    expect(rows).toEqual([{ name: 'Ines', projectId: 'p2', _suppressHooks: true, id: 'local-1' }])
  })
})

describe('SyncTransport.pullTombstones', () => {
  function tombDb(initial = []) {
    const rows = new Map(initial.map((r) => [r.id, { ...r }]))
    const table = {
      get: async (id) => rows.get(id),
      delete: async (id) => {
        rows.delete(id)
      },
      update: async (id, patch) => {
        const row = rows.get(id)
        if (row) Object.assign(row, patch)
      },
      where: (field) => ({
        equals: (value) => ({
          first: async () => [...rows.values()].find((r) => r[field] === value)
        })
      })
    }
    return { rows, db: new Proxy({}, { get: () => table }) }
  }

  function tombIdMap() {
    const mappings = new Map([['characters:api-c1', 'c1']])
    const suppressed = []
    const removed = []
    return {
      mappings,
      suppressed,
      removed,
      getApiId: () => null,
      setMapping: () => {},
      getLocalId: (t, apiId) => mappings.get(`${t}:${apiId}`) ?? null,
      removeMapping: (t, localId, apiId) => {
        removed.push([t, localId, apiId])
        mappings.delete(`${t}:${apiId}`)
      },
      suppressNextDelete: (t, localId) => suppressed.push([t, localId]),
      resolveStoryApiId: async () => 'story-1',
      persistStoryId: () => {}
    }
  }

  it('deletes the clean local row and drops its id mapping', async () => {
    const { db, rows } = tombDb([{ id: 'c1', apiId: 'api-c1', syncStatus: 'synced', name: 'Gone' }])
    const idMap = tombIdMap()
    const api = async () => [{ table: 'characters', rowId: 'api-c1', storyId: 'story-1' }]

    const result = await new SyncTransport(api).pullTombstones('story-1', idMap, findSyncConfig, db)

    expect(result).toEqual({ applied: 1, skipped: 0 })
    expect(rows.has('c1')).toBe(false)
    expect(idMap.suppressed).toEqual([['characters', 'c1']])
    expect(idMap.removed).toEqual([['characters', 'c1', 'api-c1']])
  })

  it('keeps a locally dirty row (local wins) and unknown tables', async () => {
    const { db, rows } = tombDb([
      { id: 'c1', apiId: 'api-c1', syncStatus: 'pending-update', name: 'Mine' }
    ])
    const idMap = tombIdMap()
    const api = async () => [
      { table: 'characters', rowId: 'api-c1', storyId: 'story-1' },
      { table: 'nope', rowId: 'api-x', storyId: 'story-1' },
      { table: 'characters', rowId: 'api-ghost', storyId: 'story-1' }
    ]

    const result = await new SyncTransport(api).pullTombstones('story-1', idMap, findSyncConfig, db)

    expect(result).toEqual({ applied: 0, skipped: 3 })
    expect(rows.has('c1')).toBe(true)
    expect(idMap.suppressed).toEqual([])
  })
})
