import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = {
  dialogueIndex: {
    where: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    bulkAdd: vi.fn(),
    delete: vi.fn()
  }
}

vi.mock('@/services/db-core', () => ({
  db: mockDb,
  deepPlain: vi.fn((obj) => JSON.parse(JSON.stringify(obj)))
}))

let dbDialogue
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  dbDialogue = await import('@/services/db-dialogue')
})

function makeEquals(toArrayFn) {
  const equals = vi.fn(() => ({ toArray: vi.fn(toArrayFn) }))
  return { equals }
}

function makeCompositeEquals(toArrayFn) {
  const equals = vi.fn(() => ({ toArray: vi.fn(toArrayFn) }))
  return { equals }
}

describe('db-dialogue', () => {
  describe('getDialogueByProject', () => {
    it('returns dialogue entries for a project', async () => {
      const entries = [{ id: 1, projectId: 'p1', speakerId: 's1' }]
      mockDb.dialogueIndex.where.mockReturnValue(makeEquals(() => entries))
      const result = await dbDialogue.getDialogueByProject('p1')
      expect(result).toEqual(entries)
      expect(mockDb.dialogueIndex.where).toHaveBeenCalledWith('projectId')
    })

    it('returns empty array on error', async () => {
      mockDb.dialogueIndex.where.mockReturnValue(makeEquals(() => { throw new Error('fail') }))
      const result = await dbDialogue.getDialogueByProject('p1')
      expect(result).toEqual([])
    })
  })

  describe('getDialogueBySpeaker', () => {
    it('returns dialogue entries for a project+specific speaker', async () => {
      const entries = [{ id: 1, projectId: 'p1', speakerId: 's1' }]
      const where = vi.fn(() => makeEquals(() => entries))
      mockDb.dialogueIndex.where = where
      const result = await dbDialogue.getDialogueBySpeaker('p1', 's1')
      expect(result).toEqual(entries)
      expect(where).toHaveBeenCalledWith('[projectId+speakerId]')
    })

    it('returns empty array on error', async () => {
      mockDb.dialogueIndex.where = vi.fn(() => makeEquals(() => { throw new Error('fail') }))
      const result = await dbDialogue.getDialogueBySpeaker('p1', 's1')
      expect(result).toEqual([])
    })
  })

  describe('saveDialogueEntry', () => {
    it('adds a dialogue entry and returns its id', async () => {
      const entry = { projectId: 'p1', paragraphIndex: 0, speakerId: 's1' }
      mockDb.dialogueIndex.add.mockResolvedValue(42)
      const result = await dbDialogue.saveDialogueEntry(entry)
      expect(result).toBe(42)
      expect(mockDb.dialogueIndex.add).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'p1', paragraphIndex: 0, speakerId: 's1' })
      )
    })

    it('returns null on error', async () => {
      mockDb.dialogueIndex.add.mockRejectedValue(new Error('fail'))
      const result = await dbDialogue.saveDialogueEntry({ projectId: 'p1' })
      expect(result).toBeNull()
    })
  })

  describe('saveDialogueBatch', () => {
    it('bulk adds entries and returns ids', async () => {
      const entries = [
        { projectId: 'p1', paragraphIndex: 0 },
        { projectId: 'p1', paragraphIndex: 1 }
      ]
      mockDb.dialogueIndex.bulkAdd.mockResolvedValue([1, 2])
      const result = await dbDialogue.saveDialogueBatch(entries)
      expect(result).toEqual([1, 2])
      expect(mockDb.dialogueIndex.bulkAdd).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ projectId: 'p1' })]),
        { allKeys: true }
      )
    })

    it('returns empty array for empty input', async () => {
      const result = await dbDialogue.saveDialogueBatch([])
      expect(result).toEqual([])
      expect(mockDb.dialogueIndex.bulkAdd).not.toHaveBeenCalled()
    })

    it('returns empty array for non-array input', async () => {
      const result = await dbDialogue.saveDialogueBatch(null)
      expect(result).toEqual([])
      expect(mockDb.dialogueIndex.bulkAdd).not.toHaveBeenCalled()
    })

    it('returns empty array on error', async () => {
      const entries = [{ projectId: 'p1' }]
      mockDb.dialogueIndex.bulkAdd.mockRejectedValue(new Error('fail'))
      const result = await dbDialogue.saveDialogueBatch(entries)
      expect(result).toEqual([])
    })
  })

  describe('deleteDialogueByProject', () => {
    it('deletes all dialogue entries for a project', async () => {
      const del = vi.fn().mockResolvedValue(undefined)
      mockDb.dialogueIndex.where.mockReturnValue({ equals: vi.fn(() => ({ delete: del })) })
      await dbDialogue.deleteDialogueByProject('p1')
      expect(mockDb.dialogueIndex.where).toHaveBeenCalledWith('projectId')
    })

    it('handles delete errors gracefully', async () => {
      const del = vi.fn().mockRejectedValue(new Error('fail'))
      mockDb.dialogueIndex.where.mockReturnValue({ equals: vi.fn(() => ({ delete: del })) })
      await expect(dbDialogue.deleteDialogueByProject('p1')).resolves.toBeUndefined()
    })
  })

  describe('updateSpeakerMapping', () => {
    it('updates speaker mapping with high confidence', async () => {
      mockDb.dialogueIndex.update.mockResolvedValue(1)
      await dbDialogue.updateSpeakerMapping(5, 's2', 0.95)
      expect(mockDb.dialogueIndex.update).toHaveBeenCalledWith(5, {
        speakerId: 's2',
        confidence: 0.95,
        needsReview: false
      })
    })

    it('sets needsReview when confidence is below 0.8', async () => {
      mockDb.dialogueIndex.update.mockResolvedValue(1)
      await dbDialogue.updateSpeakerMapping(5, 's2', 0.75)
      expect(mockDb.dialogueIndex.update).toHaveBeenCalledWith(5, {
        speakerId: 's2',
        confidence: 0.75,
        needsReview: true
      })
    })

    it('handles update errors gracefully', async () => {
      mockDb.dialogueIndex.update.mockRejectedValue(new Error('fail'))
      await expect(dbDialogue.updateSpeakerMapping(5, 's2', 0.9)).resolves.toBeUndefined()
    })
  })

  describe('reindexSection', () => {
    it('replaces dialogue entries for a section', async () => {
      const del = vi.fn().mockResolvedValue(undefined)
      mockDb.dialogueIndex.where.mockReturnValue({ delete: del })
      mockDb.dialogueIndex.bulkAdd.mockResolvedValue([1, 2])

      const entries = [
        { projectId: 'p1', sectionId: 'sec1', speakerId: 's1' },
        { projectId: 'p1', sectionId: 'sec1', speakerId: 's2' }
      ]
      await dbDialogue.reindexSection('sec1', 'p1', entries)

      expect(mockDb.dialogueIndex.where).toHaveBeenCalledWith({ sectionId: 'sec1' })
      expect(del).toHaveBeenCalled()
      expect(mockDb.dialogueIndex.bulkAdd).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sectionId: 'sec1', speakerId: 's1' }),
          expect.objectContaining({ sectionId: 'sec1', speakerId: 's2' })
        ])
      )
    })

    it('skips bulkAdd when entries array is empty', async () => {
      const del = vi.fn().mockResolvedValue(undefined)
      mockDb.dialogueIndex.where.mockReturnValue({ delete: del })

      await dbDialogue.reindexSection('sec1', 'p1', [])

      expect(del).toHaveBeenCalled()
      expect(mockDb.dialogueIndex.bulkAdd).not.toHaveBeenCalled()
    })

    it('handles reindex errors gracefully', async () => {
      mockDb.dialogueIndex.where.mockReturnValue({ delete: vi.fn().mockRejectedValue(new Error('fail')) })
      await expect(dbDialogue.reindexSection('sec1', 'p1', [{ projectId: 'p1' }])).resolves.toBeUndefined()
    })
  })
})
