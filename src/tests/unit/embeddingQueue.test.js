import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/embeddingService', () => ({
  getEmbeddings: vi.fn()
}))

const mockUnindexedChunks = vi.fn()
const mockResetChunksStatus = vi.fn()
vi.mock('../../services/researchDb', () => ({
  updateChunkEmbeddings: vi.fn().mockResolvedValue(),
  getUnindexedChunks: (...args) => mockUnindexedChunks(...args),
  markProcessing: vi.fn().mockResolvedValue(),
  markFailed: vi.fn().mockResolvedValue(),
  resetChunksStatus: (...args) => mockResetChunksStatus(...args),
  getDocumentChunkEmbeddings: vi.fn().mockResolvedValue([]),
  setDocumentEmbedding: vi.fn().mockResolvedValue()
}))

import { getEmbeddings } from '../../services/embeddingService'

async function importFreshQueue() {
  vi.resetModules()
  const mod = await import('../../services/embeddingQueue')
  return mod
}

describe('embeddingQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnindexedChunks.mockResolvedValue([])
    mockResetChunksStatus.mockResolvedValue([])
  })

  describe('P0 deadlock fix: isRunning reset on failure', () => {
    it('should reset isRunning when getEmbeddings throws', async () => {
      getEmbeddings.mockRejectedValue(new Error('API down'))

      const { enqueue, isQueueProcessing, setRetryDelay } = await importFreshQueue()
      setRetryDelay(0)

      enqueue('doc-1', [{ id: 'chunk-1', text: 'hello' }])

      await vi.waitFor(() => {
        expect(isQueueProcessing()).toBe(false)
      })

      expect(getEmbeddings).toHaveBeenCalledTimes(2)
    })

    it('should allow new enqueue calls after a failed batch', async () => {
      getEmbeddings
        .mockRejectedValueOnce(new Error('API down'))
        .mockResolvedValueOnce({ vectors: [[0.1, 0.2]], provider: 'test', model: 'm1' })
        .mockResolvedValueOnce({ vectors: [[0.3, 0.4]], provider: 'test', model: 'm1' })

      const { enqueue, isQueueProcessing, setRetryDelay } = await importFreshQueue()
      setRetryDelay(0)

      enqueue('doc-1', [{ id: 'chunk-1', text: 'hello' }])

      await vi.waitFor(() => {
        expect(getEmbeddings).toHaveBeenCalledTimes(2)
        expect(isQueueProcessing()).toBe(false)
      })

      enqueue('doc-2', [{ id: 'chunk-2', text: 'world' }])

      await vi.waitFor(
        () => {
          expect(getEmbeddings).toHaveBeenCalledTimes(3)
        },
        { timeout: 5000 }
      )

      expect(isQueueProcessing()).toBe(false)
    })

    it('should not deadlock when processQueue itself throws a fatal error', async () => {
      getEmbeddings.mockImplementation(() => {
        throw new Error('synchronous throw in getEmbeddings')
      })

      const { enqueue, isQueueProcessing, setRetryDelay } = await importFreshQueue()
      setRetryDelay(0)

      enqueue('doc-1', [{ id: 'chunk-1', text: 'hello' }])

      await vi.waitFor(() => {
        expect(isQueueProcessing()).toBe(false)
      })
    })

    it('should process multiple batches sequentially when some fail', async () => {
      const BATCH_SIZE = 2
      let callCount = 0
      getEmbeddings.mockImplementation(async (texts) => {
        callCount++
        if (callCount <= 2) {
          return { vectors: texts.map(() => [0.1, 0.2]), provider: 'test', model: 'm1' }
        }
        throw new Error('rate limited')
      })

      const { enqueue, setBatchSize, isQueueProcessing, setRetryDelay } = await importFreshQueue()
      setBatchSize(BATCH_SIZE)
      setRetryDelay(0)

      const entries = []
      for (let i = 0; i < 6; i++) {
        entries.push({ id: `chunk-${i}`, text: `text ${i}` })
      }
      enqueue('doc-1', entries)

      await vi.waitFor(
        () => {
          expect(isQueueProcessing()).toBe(false)
        },
        { timeout: 10000 }
      )

      expect(getEmbeddings).toHaveBeenCalledTimes(4)
    })
  })

  describe('P2 fix: resume re-enqueues unindexed chunks', () => {
    it('should return 0 when no unindexed chunks exist', async () => {
      mockUnindexedChunks.mockResolvedValue([])

      const { resume } = await importFreshQueue()
      const count = await resume('project-1')

      expect(count).toBe(0)
      expect(mockUnindexedChunks).toHaveBeenCalledWith('project-1')
    })

    it('should enqueue chunks grouped by document', async () => {
      mockUnindexedChunks.mockResolvedValue([
        { id: 'c1', documentId: 'doc-1', text: 'hello' },
        { id: 'c2', documentId: 'doc-1', text: 'world' },
        { id: 'c3', documentId: 'doc-2', text: 'foo' }
      ])

      const mod = await importFreshQueue()

      const count = await mod.resume('project-1')
      expect(count).toBe(3)

      await vi.waitFor(() => {
        expect(getEmbeddings).toHaveBeenCalled()
      })

      const p1 = mod.getProgress('doc-1')
      expect(p1).not.toBeNull()
      expect(p1.total).toBe(2)
    })
  })

  describe('progress notification', () => {
    it('should notify subscribers via subscribe callback', async () => {
      getEmbeddings.mockResolvedValue({ vectors: [[0.1]], provider: 'test', model: 'm1' })

      const { enqueue, subscribe, isQueueProcessing } = await importFreshQueue()

      const notifications = []
      const unsub = subscribe((docId, p) => {
        notifications.push({ docId, ...p })
      })

      enqueue('doc-1', [{ id: 'chunk-1', text: 'hello' }])

      await vi.waitFor(() => {
        expect(isQueueProcessing()).toBe(false)
      })

      expect(notifications.length).toBeGreaterThanOrEqual(1)
      const last = notifications[notifications.length - 1]
      expect(last.indexed).toBe(1)
      expect(last.total).toBe(1)
      expect(last.failed).toBe(0)

      unsub()
    })

    it('should notify on failure for individual items', async () => {
      getEmbeddings.mockResolvedValue({ vectors: [null], provider: 'test', model: 'm1' })

      const { enqueue, subscribe, isQueueProcessing } = await importFreshQueue()

      const notifications = []
      const unsub = subscribe((docId, p) => {
        notifications.push({ docId, ...p })
      })

      enqueue('doc-1', [{ id: 'chunk-1', text: 'hello' }])

      await vi.waitFor(() => {
        expect(isQueueProcessing()).toBe(false)
      })

      const last = notifications[notifications.length - 1]
      expect(last.indexed).toBe(0)
      expect(last.failed).toBe(1)

      unsub()
    })
  })

  describe('retryDocument', () => {
    it('should not retry if document has pending items in progress', async () => {
      const { retryDocument, enqueue } = await importFreshQueue()
      enqueue('doc-1', [{ id: 'chunk-1', text: 'hello' }])

      mockResetChunksStatus.mockResolvedValue([])
      await retryDocument('doc-1')

      expect(mockResetChunksStatus).not.toHaveBeenCalled()
    })

    it('should retry failed chunks for a document', async () => {
      mockResetChunksStatus.mockResolvedValue([{ id: 'chunk-1', text: 'hello' }])

      const { retryDocument } = await importFreshQueue()

      await retryDocument('doc-2')

      expect(mockResetChunksStatus).toHaveBeenCalledWith('doc-2', 'FAILED')
    })
  })
})
