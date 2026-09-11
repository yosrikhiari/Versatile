import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/documentChunker', () => ({
  chunkDocument: vi.fn()
}))
vi.mock('@/services/pdfExtractorService', () => ({ extractFileText: vi.fn() }))
vi.mock('@/services/webScraperService', () => ({ fetchUrlText: vi.fn() }))
vi.mock('@/composables/useEmbeddingIndexer', () => ({
  useEmbeddingIndexer: () => ({ enqueueChunks: vi.fn(), clearDocumentProgress: vi.fn() })
}))

import { db } from '@/services/db-core'
import { chunkDocument } from '@/services/documentChunker'
import { useResearchDocuments } from '@/composables/useResearchDocuments'

// Reindex must never strand a document with zero chunks: a chunking or
// write failure between delete and re-add used to leave exactly that
// (same rewrite-without-rollback shape as the old scene incident).

const PROSE =
  'The harbor smelled of brine and diesel. Kael coiled the rope with practiced hands. ' +
  'Gulls argued over the morning catch while the supply boat wallowed at anchor. '.repeat(10)

beforeEach(async () => {
  vi.clearAllMocks()
  await db.researchChunks.clear()
  await db.researchDocuments.clear()
})

async function seedDoc() {
  const documentId = await db.researchDocuments.add({
    projectId: 'p1',
    fileName: 'harbor.txt',
    text: PROSE,
    tags: [],
    chunkCount: 2
  })
  await db.researchChunks.bulkAdd([
    {
      documentId,
      projectId: 'p1',
      text: 'old chunk one',
      chunkIndex: 0,
      embeddingStatus: 'READY',
      embedding: [0.1, 0.2]
    },
    {
      documentId,
      projectId: 'p1',
      text: 'old chunk two',
      chunkIndex: 1,
      embeddingStatus: 'READY',
      embedding: [0.3, 0.4]
    }
  ])
  return documentId
}

describe('reindexDocument atomicity', () => {
  it('keeps the old chunks when chunking fails midway', async () => {
    const documentId = await seedDoc()
    chunkDocument.mockRejectedValueOnce(new Error('worker died'))

    const { reindexDocument } = useResearchDocuments('p1')
    await expect(reindexDocument(documentId)).rejects.toThrow()
    const remaining = await db.researchChunks.where({ documentId }).toArray()
    expect(remaining).toHaveLength(2)
    expect(remaining.map((c) => c.text).sort()).toEqual(['old chunk one', 'old chunk two'])
  })

  it('replaces chunks atomically on success, reusing identical embeddings', async () => {
    const documentId = await seedDoc()
    chunkDocument.mockResolvedValue([
      {
        text: 'old chunk one',
        heading: '',
        sentenceCount: 1,
        charCount: 10,
        tokenEstimate: 3,
        tags: []
      },
      {
        text: 'brand new chunk',
        heading: '',
        sentenceCount: 1,
        charCount: 10,
        tokenEstimate: 3,
        tags: []
      }
    ])
    const { reindexDocument } = useResearchDocuments('p1')
    await reindexDocument(documentId)
    const rows = await db.researchChunks.where({ documentId }).sortBy('chunkIndex')
    expect(rows).toHaveLength(2)
    expect(rows[0].embedding).toEqual([0.1, 0.2])
    expect(rows[0].embeddingStatus).toBe('READY')
    expect(rows[1].text).toBe('brand new chunk')
  })
})
