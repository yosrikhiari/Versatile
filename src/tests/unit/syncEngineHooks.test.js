import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/services/db-core'
import { getSyncEngine, destroySyncEngine, syncStatus } from '@/services/sync-engine'
import { SyncTransport } from '@/services/sync-transport'

/**
 * The sync engine's Dexie hooks (2026-10-04 fixes):
 * - the delete hook wrote to `pendingDeletions` inside the delete's own
 *   transaction, which threw NotFoundError, so no delete was ever sent;
 * - `destroy()` called a bare `unsubscribe()`, which removed nothing;
 * - the `_suppressHooks` marker was stored on rows, so a copy of a pulled
 *   row skipped `pending-create` and never synced.
 */
const tick = () => new Promise((r) => setTimeout(r, 20))

describe('sync engine hooks', () => {
  beforeAll(async () => {
    await db.open()
  })

  beforeEach(async () => {
    await db.characters.clear()
    await db.pendingDeletions.clear()
  })

  afterEach(() => {
    destroySyncEngine()
  })

  it('queues the delete of a synced row, with its story, once the delete commits', async () => {
    await db.projects.put({ id: 'p-hooks', name: 'P', apiId: 'story-9', _suppressHooks: true })
    await getSyncEngine().init()
    await db.characters.add({
      id: 'c1',
      projectId: 'p-hooks',
      name: 'A',
      apiId: 'srv-c1',
      _suppressHooks: true
    })

    await db.characters.delete('c1')
    await tick()

    const queued = await db.pendingDeletions.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ table: 'characters', apiId: 'srv-c1', storyApiId: 'story-9' })
  })

  it('does not queue a delete for a row the server never had', async () => {
    await getSyncEngine().init()
    await db.characters.add({ id: 'c2', projectId: 'p-hooks', name: 'B' })
    await db.characters.delete('c2')
    await tick()
    expect(await db.pendingDeletions.count()).toBe(0)
  })

  it('consumes the sync marker instead of storing it, so copies still sync', async () => {
    await getSyncEngine().init()
    await db.characters.add({
      id: 'c3',
      projectId: 'p-hooks',
      name: 'C',
      apiId: 'srv-c3',
      _suppressHooks: true
    })
    const pulled = await db.characters.get('c3')
    expect(pulled._suppressHooks).toBeUndefined()

    // A copy the way a branch fork makes one: every field but the identity.
    const copy = { ...pulled, id: 'c3-copy' }
    delete copy.apiId
    delete copy.syncStatus
    await db.characters.add(copy)
    expect((await db.characters.get('c3-copy')).syncStatus).toBe('pending-create')

    await db.characters.update('c3', { name: 'C2', _suppressHooks: true })
    expect((await db.characters.get('c3'))._suppressHooks).toBeUndefined()
  })

  it('removes its hooks on destroy, so a second engine does not double them', async () => {
    await getSyncEngine().init()
    destroySyncEngine()
    await getSyncEngine().init()
    await db.characters.add({
      id: 'c4',
      projectId: 'p-hooks',
      name: 'D',
      apiId: 'srv-c4',
      _suppressHooks: true
    })
    await db.characters.delete('c4')
    await tick()
    expect(await db.pendingDeletions.count()).toBe(1)

    destroySyncEngine()
    await db.characters.add({ id: 'c5', projectId: 'p-hooks', name: 'E' })
    expect((await db.characters.get('c5')).syncStatus).toBeUndefined()
  })

  it('does not queue a delete the sync engine performs itself (tombstone apply)', async () => {
    await db.projects.put({ id: 'p-tomb', name: 'P', apiId: 'story-9', _suppressHooks: true })
    const engine = getSyncEngine()
    await engine.init()
    await db.characters.add({
      id: 'c9',
      projectId: 'p-tomb',
      name: 'Z',
      apiId: 'srv-c9',
      syncStatus: 'synced',
      _suppressHooks: true
    })

    // What pullTombstones does for a clean remotely-deleted row.
    engine.suppressNextDelete('characters', 'c9')
    await db.characters.delete('c9')
    await tick()

    expect(await db.pendingDeletions.count()).toBe(0)
  })
})

describe('sync engine pull watermark', () => {
  beforeAll(async () => {
    await db.open()
  })

  beforeEach(async () => {
    await db.projects.clear()
    syncStatus.lastSync = null
    syncStatus.lastError = null
    localStorage.setItem('versatile_api_token', 'test-token')
  })

  afterEach(() => {
    localStorage.removeItem('versatile_api_token')
    destroySyncEngine()
  })

  it('does not stamp lastSync when the pull fails', async () => {
    // No server behind the relative /api URL: every pull table fails, so a
    // stamp would mark failed rows as synced.
    const engine = getSyncEngine()
    await engine.init()
    await engine.pull()

    expect(syncStatus.lastSync).toBeNull()
    expect(syncStatus.lastError).not.toBeNull()
  }, 30000)
})

describe('SyncTransport.withRetry', () => {
  afterEach(() => vi.useRealTimers())

  it("waits out a 429 for the server's Retry-After without spending an attempt", async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = async () => {
      calls++
      if (calls === 1) throw Object.assign(new Error('slow down'), { status: 429, retryAfter: 30 })
      return 'ok'
    }
    const p = new SyncTransport(async () => null).withRetry(fn, 0)
    await vi.advanceTimersByTimeAsync(29_000)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(p).resolves.toBe('ok')
  })

  it('does not retry a 4xx that will fail the same way again', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      throw Object.assign(new Error('not found'), { status: 404 })
    }
    await expect(new SyncTransport(async () => null).withRetry(fn)).rejects.toThrow('not found')
    expect(calls).toBe(1)
  })
})
