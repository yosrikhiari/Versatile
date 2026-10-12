import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/services/db-core'

vi.mock('@/services/api', () => ({
  api: async () => {
    throw Object.assign(new Error('gone'), { status: 404 })
  },
  hasToken: () => true
}))

import { getSyncEngine, destroySyncEngine, syncStatus } from '@/services/sync-engine'

/**
 * F11 delete-failure tracking: a delete the server rejects must surface in
 * `failedTables` (badge error state), block the `lastSync` stamp, and stay
 * queued — instead of vanishing into `console.warn` and retrying invisibly.
 */
describe('sync engine delete failures', () => {
  beforeAll(async () => {
    await db.open()
  })

  beforeEach(async () => {
    await db.pendingDeletions.clear()
    syncStatus.lastSync = null
    syncStatus.lastError = null
  })

  afterEach(() => {
    destroySyncEngine()
  })

  it('surfaces a rejected delete and blocks the stamp while keeping it queued', async () => {
    await db.pendingDeletions.put({
      id: 'del-f11',
      table: 'characters',
      apiId: 'srv-gone',
      storyApiId: 'story-1',
      deletedAt: new Date().toISOString()
    })
    const engine = getSyncEngine()
    await engine.init()
    await engine.push()

    expect(syncStatus.failedTables).toContain('deletions')
    expect(syncStatus.lastError).toMatch(/deletions/i)
    expect(syncStatus.lastSync).toBeNull()
    expect(await db.pendingDeletions.count()).toBe(1)
  })
})
