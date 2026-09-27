import { describe, it, expect } from 'vitest'
import { MIGRATIONS } from '@/services/db-migrations'

const table = (rows) => ({
  rows,
  toArray: async () => rows,
  update: async (id, changes) =>
    Object.assign(
      rows.find((r) => r.id === id),
      changes
    )
})

describe('v55 migration', () => {
  it('puts existing chapter and volume rollups on their project’s main branch', async () => {
    const trans = {
      branches: table([
        { id: 10, projectId: 1, name: 'main' },
        { id: 11, projectId: 1, name: 'what-if' },
        { id: 20, projectId: 2, name: 'main' }
      ]),
      chapterDigests: table([
        { id: 1, projectId: 1, chapterNumber: 1 },
        { id: 2, projectId: 2, chapterNumber: 1 },
        { id: 3, projectId: 3, chapterNumber: 1 },
        { id: 4, projectId: 1, chapterNumber: 2, branchId: 11 }
      ]),
      volumeDigests: table([{ id: 1, projectId: 2, volumeId: 'v' }])
    }
    await MIGRATIONS[55](trans)
    expect(trans.chapterDigests.rows.map((r) => r.branchId)).toEqual([10, 20, undefined, 11])
    expect(trans.volumeDigests.rows[0].branchId).toBe(20)
  })
})
