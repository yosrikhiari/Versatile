import { ref, onMounted, onUnmounted } from 'vue'
import { enqueue as serviceEnqueue, subscribe, getAllProgress, isQueueProcessing } from '../services/embeddingQueue'

export function useEmbeddingIndexer() {
  const isProcessing = ref(isQueueProcessing())
  const indexProgress = ref({ ...getAllProgress() })

  let unsub = null
  onMounted(() => {
    unsub = subscribe((documentId, indexed, total) => {
      const next = { ...indexProgress.value }
      next[documentId] = { indexed, total }
      indexProgress.value = next
    })
  })
  onUnmounted(() => {
    if (unsub) unsub()
  })

  function enqueueChunks(documentId, chunks) {
    serviceEnqueue(documentId, chunks)
    indexProgress.value = { ...indexProgress.value, [documentId]: { indexed: 0, total: chunks.length } }
  }

  return { isProcessing, indexProgress, enqueueChunks }
}
