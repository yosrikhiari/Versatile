import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/db-core'
import { getTotalBefore } from '@/services/db-goals'

// UX-AUDIT #14: the goal bar shows words written today, which is the live
// manuscript total minus the total stored on the last earlier day. This pins
// that lookup against real Dexie: rows are one per project per day and hold
// the day's TOTAL.

beforeEach(async () => {
  await db.dailyGoals.clear()
})

describe('getTotalBefore', () => {
  it('returns the latest total stored before the given day', async () => {
    await db.dailyGoals.bulkAdd([
      { projectId: 'p1', date: '2026-09-28', goalWords: 500, wordCount: 800 },
      { projectId: 'p1', date: '2026-09-30', goalWords: 500, wordCount: 1200 },
      { projectId: 'p1', date: '2026-10-02', goalWords: 500, wordCount: 1500 }
    ])
    expect(await getTotalBefore('p1', '2026-10-02')).toBe(1200)
    expect(await getTotalBefore('p1', '2026-10-01')).toBe(1200)
    expect(await getTotalBefore('p1', '2026-09-30')).toBe(800)
  })

  it('never reads today, another project, or a missing history', async () => {
    await db.dailyGoals.bulkAdd([
      { projectId: 'p1', date: '2026-10-02', goalWords: 500, wordCount: 1500 },
      { projectId: 'p2', date: '2026-09-30', goalWords: 500, wordCount: 9000 }
    ])
    expect(await getTotalBefore('p1', '2026-10-02')).toBeNull()
    expect(await getTotalBefore('p3', '2026-10-02')).toBeNull()
  })
})
