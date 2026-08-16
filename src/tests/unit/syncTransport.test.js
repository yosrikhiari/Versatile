import { describe, it, expect } from 'vitest'
import { SyncTransport } from '../../services/sync-transport'

// Chained mock that mimics the Dexie surface pushOne touches:
//   db[table].where('id').equals(id).modify(patch)
function makeMockDb() {
  const rows = new Map()
  const table = {
    where: () => ({
      equals: (id) => ({
        modify: async (patch) => {
          const row = rows.get(id)
          if (row) Object.assign(row, patch)
        }
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
  const store = new Map()
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
})
