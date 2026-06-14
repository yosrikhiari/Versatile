import { getEmbeddings } from './embeddingService'
import { updateChunkEmbeddings, getUnindexedChunks, markProcessing, markFailed, resetChunksStatus } from './researchDb'
import { EMBEDDING_DEFAULTS, EMBEDDING_VERSION, EMBEDDING_PROVIDER_CAPABILITIES } from '../config/ai'

const queue = []
let isProcessing = false
let isRunning = false
let batchSizeOverride = null
const progress = {}
const subscribers = new Set()

function resolveBatchSize() {
  if (batchSizeOverride !== null) return batchSizeOverride
  const caps = EMBEDDING_PROVIDER_CAPABILITIES[EMBEDDING_DEFAULTS.provider]
  return caps ? caps.maxBatchSize : EMBEDDING_DEFAULTS.batchSize
}

function notify(documentId) {
  const p = progress[documentId]
  if (!p) return
  for (const cb of subscribers) {
    cb(documentId, p)
  }
}

async function processQueue() {
  isProcessing = true
  const size = resolveBatchSize()
  while (queue.length > 0) {
    const batch = queue.splice(0, size)
    const ids = batch.map(e => e.chunkId)
    await markProcessing(ids)

    const texts = batch.map(e => e.text)
    let embeddings, provider, model
    try {
      const result = await getEmbeddings(texts)
      embeddings = result.vectors
      provider = result.provider
      model = result.model
    } catch (err) {
      await markFailed(ids)
      for (let i = 0; i < batch.length; i++) {
        const p = progress[batch[i].documentId]
        if (p) p.failed++
        notify(batch[i].documentId)
      }
      continue
    }

    const updates = []
    const failed = []
    for (let i = 0; i < batch.length; i++) {
      const p = progress[batch[i].documentId]
      if (embeddings[i]) {
        updates.push({ id: batch[i].chunkId, embedding: embeddings[i] })
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
    for (let i = 0; i < batch.length; i++) {
      notify(batch[i].documentId)
    }
  }
  isProcessing = false
  isRunning = false
}

export function setBatchSize(n) {
  batchSizeOverride = n
}

export async function resume(projectId) {
  const chunks = await getUnindexedChunks(projectId)
  if (chunks.length === 0) return 0
  const grouped = {}
  for (const c of chunks) {
    if (!grouped[c.documentId]) grouped[c.documentId] = []
    grouped[c.documentId].push({ id: c.id, text: c.text })
  }
  for (const [docId, entries] of Object.entries(grouped)) {
    enqueue(docId, entries)
  }
  return chunks.length
}

export function enqueue(documentId, entries) {
  progress[documentId] = { indexed: 0, failed: 0, total: entries.length }
  for (const entry of entries) {
    queue.push({ chunkId: entry.id, text: entry.text, documentId })
  }
  if (!isRunning) {
    isRunning = true
    processQueue()
  }
}

export function getProgress(documentId) {
  return progress[documentId] || null
}

export function getAllProgress() {
  return progress
}

export function isQueueProcessing() {
  return isProcessing
}

export function subscribe(cb) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

export async function retryDocument(documentId) {
  const pending = progress[documentId]
  if (pending && pending.indexed + pending.failed < pending.total) return
  const entries = await resetChunksStatus(documentId, 'FAILED')
  if (entries.length === 0) return
  enqueue(documentId, entries)
}
