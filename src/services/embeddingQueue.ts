import { getEmbeddings } from './embeddingService'
import {
  updateChunkEmbeddings,
  getUnindexedChunks,
  markProcessing,
  markFailed,
  resetChunksStatus,
  getDocumentChunkEmbeddings,
  setDocumentEmbedding
} from './researchDb'
import {
  EMBEDDING_DEFAULTS,
  EMBEDDING_VERSION,
  EMBEDDING_PROVIDER_CAPABILITIES
} from '../config/ai'

interface QueueEntry {
  chunkId: string
  text: string
  documentId: string
}

interface ProgressInfo {
  indexed: number
  failed: number
  total: number
}

type Subscriber = (documentId: string, progress: ProgressInfo | null) => void

const queue: QueueEntry[] = []
let isProcessing = false
let isRunning = false
let batchSizeOverride: number | null = null
let retryDelayMs = 1000
const progress: Record<string, ProgressInfo> = {}
const subscribers = new Set<Subscriber>()

function resolveBatchSize(): number {
  if (batchSizeOverride !== null) return batchSizeOverride
  const caps = EMBEDDING_PROVIDER_CAPABILITIES[EMBEDDING_DEFAULTS.provider as keyof typeof EMBEDDING_PROVIDER_CAPABILITIES]
  return caps ? caps.maxBatchSize : EMBEDDING_DEFAULTS.batchSize
}

function notify(documentId: string): void {
  const p = progress[documentId]
  if (!p) return
  for (const cb of subscribers) {
    cb(documentId, p)
  }
}

async function markBatchFailed(ids: string[], batch: QueueEntry[]): Promise<void> {
  await markFailed(ids)
  for (let i = 0; i < batch.length; i++) {
    const p = progress[batch[i].documentId]
    if (p) p.failed++
    notify(batch[i].documentId)
  }
}

async function processSingleBatch(batch: QueueEntry[], retryCount = 0): Promise<void> {
  const ids = batch.map((e) => e.chunkId)
  await markProcessing(ids)

  const texts = batch.map((e) => e.text)
  let embeddings: (Float32Array | null)[], provider: string | null, model: string | null
  try {
    const result = await getEmbeddings(texts)
    embeddings = result.vectors
    provider = result.provider
    model = result.model
  } catch (err: any) {
    if (retryCount < 1) {
      console.warn(`[embeddingQueue] Batch failed (will retry):`, err.message)
      await new Promise((r) => setTimeout(r, retryDelayMs))
      return processSingleBatch(batch, 1)
    }
    console.error(`[embeddingQueue] Batch failed:`, err.message)
    await markBatchFailed(ids, batch)
    return
  }

  const updates: { id: string; embedding: Float32Array }[] = []
  const failed: string[] = []
  for (let i = 0; i < batch.length; i++) {
    const p = progress[batch[i].documentId]
    if (embeddings[i]) {
      updates.push({ id: batch[i].chunkId, embedding: embeddings[i]! })
      if (p) p.indexed++
    } else {
      failed.push(batch[i].chunkId)
      if (p) p.failed++
    }
  }
  if (updates.length > 0) {
    await updateChunkEmbeddings(updates, { provider, model, version: EMBEDDING_VERSION })
  }
  if (failed.length > 0) {
    await markFailed(failed)
  }
  const docIdsToCheck = new Set(batch.map((e) => e.documentId))
  for (const docId of docIdsToCheck) {
    notify(docId)
    computeDocumentEmbedding(docId)
  }
}

function computeDocumentEmbedding(docId: string): void {
  const p = progress[docId]
  if (!p || p.indexed !== p.total) return
  getDocumentChunkEmbeddings(docId)
    .then((chunkEmbeddings: Float32Array[]) => {
      if (chunkEmbeddings.length > 0) {
        const avg = averageEmbeddings(chunkEmbeddings)
        setDocumentEmbedding(docId, avg)
      }
    })
    .catch(() => {})
}

async function processQueue(): Promise<void> {
  try {
    isProcessing = true
    const size = resolveBatchSize()
    const caps = EMBEDDING_PROVIDER_CAPABILITIES[EMBEDDING_DEFAULTS.provider as keyof typeof EMBEDDING_PROVIDER_CAPABILITIES]
    const maxConcurrent = caps ? caps.maxConcurrentRequests : 1

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const items = queue.splice(0, size)
        if (items.length === 0) break
        await processSingleBatch(items)
      }
    }

    const workers: Promise<void>[] = []
    for (let i = 0; i < maxConcurrent && queue.length > 0; i++) {
      workers.push(worker())
    }

    if (workers.length > 0) {
      await Promise.all(workers)
    }
  } catch (err: any) {
    console.error('[embeddingQueue] Fatal error in processQueue:', err)
  } finally {
    isProcessing = false
    isRunning = false
    if (queue.length > 0) {
      isRunning = true
      processQueue().catch((err: any) => {
        console.error('[embeddingQueue] processQueue rejected:', err)
      })
    }
  }
}

export function setBatchSize(n: number): void {
  batchSizeOverride = n
}

export function setRetryDelay(ms: number): void {
  retryDelayMs = ms
}

function cleanupOrphanedProgress(activeDocIds: string[]): void {
  const active = new Set(activeDocIds)
  for (const docId of Object.keys(progress)) {
    if (!active.has(docId)) {
      for (const cb of subscribers) {
        cb(docId, null)
      }
      delete progress[docId]
    }
  }
}

export async function resume(projectId: string): Promise<number> {
  const chunks = await getUnindexedChunks(projectId)
  if (chunks.length === 0) {
    cleanupOrphanedProgress([])
    return 0
  }
  const grouped: Record<string, { id: string; text: string }[]> = {}
  for (const c of chunks) {
    if (!grouped[c.documentId]) grouped[c.documentId] = []
    grouped[c.documentId].push({ id: c.id, text: c.text })
  }
  cleanupOrphanedProgress(Object.keys(grouped))
  for (const [docId, entries] of Object.entries(grouped)) {
    enqueue(docId, entries)
  }
  return chunks.length
}

export function enqueue(documentId: string, entries: { id: string; text: string }[]): void {
  const existing = progress[documentId]
  if (existing) {
    existing.total += entries.length
  } else {
    progress[documentId] = { indexed: 0, failed: 0, total: entries.length }
  }
  for (const entry of entries) {
    queue.push({ chunkId: entry.id, text: entry.text, documentId })
  }
  if (!isRunning) {
    isRunning = true
    processQueue().catch((err: any) => {
      console.error('[embeddingQueue] processQueue rejected:', err)
    })
  }
}

export function getProgress(documentId: string): ProgressInfo | null {
  return progress[documentId] || null
}

export function getAllProgress(): Record<string, ProgressInfo> {
  return progress
}

export function isQueueProcessing(): boolean {
  return isProcessing
}

export function subscribe(cb: Subscriber): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

export function clearProgress(documentId: string): void {
  delete progress[documentId]
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].documentId === documentId) {
      queue.splice(i, 1)
    }
  }
  for (const cb of subscribers) {
    cb(documentId, null)
  }
}

export async function retryDocument(documentId: string): Promise<void> {
  const pending = progress[documentId]
  if (pending && pending.indexed + pending.failed < pending.total) return
  const entries = await resetChunksStatus(documentId, 'FAILED')
  if (entries.length === 0) return
  enqueue(documentId, entries)
}

function averageEmbeddings(embeddings: Float32Array[]): Float32Array | null {
  if (!embeddings || embeddings.length === 0) return null
  const dim = embeddings[0].length
  const sum = new Float32Array(dim)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      sum[i] += emb[i]
    }
  }
  const avg = new Float32Array(dim)
  for (let i = 0; i < dim; i++) {
    avg[i] = sum[i] / embeddings.length
  }
  return avg
}
