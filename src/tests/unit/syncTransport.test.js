import { describe, it, expect } from 'vitest'
import { SyncTransport } from '../../services/sync-transport'

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
    const api = async (url, opts) => {
      if (JSON.stringify(opts?.body || {}).includes('bad-1')) throw new Error('server down')
      return { id: 'api-x' }
    }
    const transport = new SyncTransport(api)
    const result = await transport.pushTable('characters', idMap, () => CONFIG, db)

    expect(result).toEqual({ pushed: 1, failed: 1, deferred: 0 })
  })
})

describe('SyncTransport.pushTable concurrency', () => {
  function harness(rowCount) {
    const { rows, db } = makeMockDb()
    for (let i = 0; i < rowCount; i++) {
      rows.set(`local-${i}`, { id: `local-${i}`, syncStatus: 'pending-create', projectId: 'p1' })
    }
    let inFlight = 0
    let peak = 0
    const api = async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { id: `api-${Math.random()}` }
    }
    return { db, api, peak: () => peak, rows }
  }

  it('pushes a table a few rows at a time instead of strictly one after another', async () => {
    const h = harness(10)
    const transport = new SyncTransport(h.api)
    const result = await transport.pushTable('characters', makeIdMap(), () => CONFIG, h.db)
    expect(result).toEqual({ pushed: 10, failed: 0, deferred: 0 })
    expect(h.peak()).toBeGreaterThan(1)
    expect(h.peak()).toBeLessThanOrEqual(4)
    expect([...h.rows.values()].every((r) => r.syncStatus === 'synced')).toBe(true)
  })

  it('keeps a self-referencing table strictly sequential', async () => {
    const h = harness(6)
    const transport = new SyncTransport(h.api)
    const config = { ...CONFIG, table: 'branches', selfReferencing: true }
    await transport.pushTable('branches', makeIdMap(), () => config, h.db)
    expect(h.peak()).toBe(1)
  })
})

describe('SyncTransport.pushTable story routing', () => {
  const ROUTED = {
    ...CONFIG,
    endpoint: (storyApiId) => `/story/${storyApiId}/entity`
  }

  it("sends each row to its own project's story, not one global story", async () => {
    const { db, rows } = makeMockDb()
    rows.set('a', { id: 'a', syncStatus: 'pending-create', projectId: 'p1' })
    rows.set('b', { id: 'b', syncStatus: 'pending-create', projectId: 'p2' })
    const urls = []
    const api = async (url) => {
      urls.push(url)
      return { id: `srv-${urls.length}` }
    }
    await new SyncTransport(api).pushTable('characters', makeIdMap(), () => ROUTED, db)

    expect(urls.sort()).toEqual(['/story/story-1/entity', '/story/story-2/entity'])
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
