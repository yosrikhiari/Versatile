import { ref, onMounted, onUnmounted } from 'vue'
import {
  enqueue as serviceEnqueue,
  subscribe,
  getAllProgress,
  isQueueProcessing,
  retryDocument,
  clearProgress as serviceClearProgress
} from '../services/embeddingQueue'

export function useEmbeddingIndexer() {
  const isProcessing = ref(isQueueProcessing())
  const indexProgress = ref({ ...getAllProgress() })

  let unsub: (() => void) | null = null
  onMounted(() => {
    unsub = subscribe((documentId, p) => {
      const next = { ...indexProgress.value }
      if (p === null) {
        delete next[documentId]
      } else {
        next[documentId] = { indexed: p.indexed, total: p.total, failed: p.failed }
      }
      indexProgress.value = next
    })
  })
  onUnmounted(() => {
    if (unsub) unsub()
  })

  function enqueueChunks(documentId: string, chunks: { id: string; text: string }[]) {
    serviceEnqueue(documentId, chunks)
    const existing = indexProgress.value[documentId]
    if (existing) {
      indexProgress.value = {
        ...indexProgress.value,
        [documentId]: { ...existing, total: existing.total + chunks.length }
      }
    } else {
      indexProgress.value = {
        ...indexProgress.value,
        [documentId]: { indexed: 0, failed: 0, total: chunks.length }
      }
    }
  }

  function progressFor(docId: string) {
    return indexProgress.value[docId] || null
  }

  function hasFailed(docId: string) {
    const p = indexProgress.value[docId]
    return p ? p.failed > 0 : false
  }

  function isDocumentIndexed(docId: string) {
    const p = indexProgress.value[docId]
    return p ? p.indexed + p.failed >= p.total : false
  }

  async function retryFailedChunks(documentId: string) {
    await retryDocument(documentId)
  }

  function clearDocumentProgress(documentId: string) {
    const next = { ...indexProgress.value }
    delete next[documentId]
    indexProgress.value = next
    serviceClearProgress(documentId)
  }

  return {
    isProcessing,
    indexProgress,
    enqueueChunks,
    progressFor,
    hasFailed,
    isDocumentIndexed,
    retryFailedChunks,
    clearDocumentProgress
  }
}
