import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/db-core', () => {
  const makeTable = () => ({
    bulkAdd: vi.fn(async (rows) => rows.map((_, i) => i + 1))
  })
  return {
    db: {
      characters: makeTable(),
      locations: makeTable(),
      plotThreads: makeTable(),
      // Run the transaction body immediately, like Dexie would for a committed tx.
      transaction: vi.fn(async (_mode, _table, cb) => cb())
    },
    deepPlain: (x) => x
  }
})

let db, addCharactersBatch, addLocationsBatch, addPlotThreadsBatch
beforeEach(async () => {
  vi.resetModules()
  const core = await import('@/services/db-core')
  db = core.db
  // The mocked module persists across resetModules, so clear call history so
  // each test sees only its own bulkAdd/transaction calls.
  db.characters.bulkAdd.mockClear()
  db.locations.bulkAdd.mockClear()
  db.plotThreads.bulkAdd.mockClear()
  db.transaction.mockClear()
  const mod = await import('@/services/db-entities')
  addCharactersBatch = mod.addCharactersBatch
  addLocationsBatch = mod.addLocationsBatch
  addPlotThreadsBatch = mod.addPlotThreadsBatch
})

describe('addCharactersBatch', () => {
  it('returns [] and does not touch the db for empty input', async () => {
    expect(await addCharactersBatch(7, [])).toEqual([])
    expect(await addCharactersBatch(7, null)).toEqual([])
    expect(db.characters.bulkAdd).not.toHaveBeenCalled()
  })

  it('inserts all rows in one transaction and returns their ids in order', async () => {
    const ids = await addCharactersBatch(7, [{ name: 'A' }, { name: 'B' }])
    expect(ids).toEqual([1, 2])
    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(db.characters.bulkAdd).toHaveBeenCalledTimes(1)
  })

  it('stamps projectId + timestamps and lets data override the status default', async () => {
    await addCharactersBatch(7, [{ name: 'A', generationStatus: 'generated' }, { name: 'B' }])
    const rows = db.characters.bulkAdd.mock.calls[0][0]
    expect(rows[0]).toMatchObject({ projectId: 7, name: 'A', generationStatus: 'generated' })
    expect(rows[1].generationStatus).toBe('approved') // default when data omits it
    expect(rows[0].createdAt).toBeTruthy()
    expect(rows[0].lastEditedAt).toBeTruthy()
  })
})

describe('addLocationsBatch', () => {
  it('returns [] for empty input', async () => {
    expect(await addLocationsBatch(1, [])).toEqual([])
  })

  it('inserts rows with projectId + timestamps', async () => {
    const ids = await addLocationsBatch(3, [{ name: 'Keep' }])
    expect(ids).toEqual([1])
    const rows = db.locations.bulkAdd.mock.calls[0][0]
    expect(rows[0]).toMatchObject({ projectId: 3, name: 'Keep' })
    expect(rows[0].createdAt).toBeTruthy()
  })
})

describe('addPlotThreadsBatch', () => {
  it('returns [] for empty input', async () => {
    expect(await addPlotThreadsBatch(1, undefined)).toEqual([])
  })

  it('inserts rows with projectId + timestamps', async () => {
    const ids = await addPlotThreadsBatch(9, [{ title: 'Revenge' }, { title: 'Romance' }])
    expect(ids).toEqual([1, 2])
    const rows = db.plotThreads.bulkAdd.mock.calls[0][0]
    expect(rows.map((r) => r.title)).toEqual(['Revenge', 'Romance'])
    expect(rows.every((r) => r.projectId === 9)).toBe(true)
  })
})
