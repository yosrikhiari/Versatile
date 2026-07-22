import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = {
  characters: { where: vi.fn(), add: vi.fn(), update: vi.fn(), get: vi.fn(), delete: vi.fn() },
  locations: { where: vi.fn(), add: vi.fn(), update: vi.fn(), delete: vi.fn() },
  plotThreads: { where: vi.fn(), add: vi.fn(), update: vi.fn(), delete: vi.fn() },
  characterRelationships: {
    where: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    filter: vi.fn(),
    bulkDelete: vi.fn()
  }
}

vi.mock('@/services/db-core', () => ({
  db: mockDb
}))

let dbEntities
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  dbEntities = await import('@/services/db-entities')
})

describe('db-entities', () => {
  describe('updateCharacter', () => {
    it('deep clones data and updates character', async () => {
      mockDb.characters.update.mockResolvedValue(1)
      await dbEntities.updateCharacter('char1', { name: 'John', role: 'Hero' })
      expect(mockDb.characters.update).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({ name: 'John', role: 'Hero' })
      )
    })

    it('throws on failure', async () => {
      mockDb.characters.update.mockRejectedValue(new Error('DB error'))
      await expect(dbEntities.updateCharacter('char1', { name: 'John' })).rejects.toThrow(
        'DB error'
      )
    })
  })

  describe('updateLocation', () => {
    it('deep clones data and updates location', async () => {
      mockDb.locations.update.mockResolvedValue(1)
      await dbEntities.updateLocation('loc1', { name: 'Forest' })
      expect(mockDb.locations.update).toHaveBeenCalledWith(
        'loc1',
        expect.objectContaining({ name: 'Forest' })
      )
    })
  })

  describe('updatePlotThread', () => {
    it('deep clones data and updates plot thread', async () => {
      mockDb.plotThreads.update.mockResolvedValue(1)
      await dbEntities.updatePlotThread('pt1', { title: 'Mystery' })
      expect(mockDb.plotThreads.update).toHaveBeenCalledWith(
        'pt1',
        expect.objectContaining({ title: 'Mystery' })
      )
    })
  })

  describe('getCharacters', () => {
    it('retrieves characters by projectId', async () => {
      const toArray = vi.fn().mockResolvedValue([{ id: '1', name: 'John' }])
      const equals = vi.fn(() => ({ toArray }))
      mockDb.characters.where.mockReturnValue({ equals })
      const result = await dbEntities.getCharacters('proj1')
      expect(result).toEqual([{ id: '1', name: 'John' }])
    })
  })
})
