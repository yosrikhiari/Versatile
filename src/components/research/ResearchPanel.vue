<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useResearchDocuments } from '../../composables/useResearchDocuments'
import { useEmbeddingIndexer } from '../../composables/useEmbeddingIndexer'
import { getDocumentStatusCounts } from '../../services/researchDb'
import { resume as resumeEmbeddingQueue } from '../../services/embeddingQueue'
const projectStore = useProjectStore()
const projectId = computed(() => projectStore.currentProjectId)

const {
  documents,
  isImporting,
  importProgress,
  importError,
  loadDocuments,
  importFiles,
  removeDocument,
  getDocumentChunks,
  reindexDocument
} = useResearchDocuments(projectId)

const { indexProgress, retryFailedChunks } = useEmbeddingIndexer()
const isRetrying = ref(false)
const isReindexing = ref(false)

const fileInput = ref(null)
const selectedDoc = ref(null)
const selectedChunks = ref([])
const loadingChunks = ref(false)
const dbStatusCounts = ref({})
const searchQuery = ref('')

const filteredDocuments = computed(() => {
  if (!searchQuery.value) return documents.value
  const q = searchQuery.value.toLowerCase()
  return documents.value.filter(d => d.fileName.toLowerCase().includes(q))
})

async function refreshDbStatusCounts() {
  const counts = {}
  if (!projectId.value) { dbStatusCounts.value = counts; return }
  const docIds = documents.value.map(d => d.id)
  await Promise.all(docIds.map(async (id) => {
    try {
      const st = await getDocumentStatusCounts(id)
      if (st.total > 0) counts[id] = { total: st.total, indexed: st.READY, failed: st.FAILED }
    } catch { /* silent */ }
  }))
  dbStatusCounts.value = counts
}

const mergedProgress = computed(() => ({ ...dbStatusCounts.value, ...indexProgress.value }))

function mergedIsIndexed(docId) {
  const p = mergedProgress.value[docId]
  return p ? p.indexed + p.failed >= p.total : false
}
function mergedHasFailed(docId) {
  const p = mergedProgress.value[docId]
  return p ? p.failed > 0 : false
}

watch(projectId, async () => {
  selectedDoc.value = null
  selectedChunks.value = []
  if (projectId.value) {
    await loadDocuments()
    await refreshDbStatusCounts()
  }
})

onMounted(async () => {
  if (projectId.value) {
    await loadDocuments()
    await refreshDbStatusCounts()
    resumeEmbeddingQueue(projectId.value).then(count => {
      if (count > 0) console.info(`[ResearchPanel] Resumed indexing ${count} chunks`)
    })
  }
})

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(event) {
  const files = event.target.files
  if (!files?.length) return
  await importFiles(files)
  await refreshDbStatusCounts()
  event.target.value = ''
}

async function selectDocument(doc) {
  if (selectedDoc.value?.id === doc.id) {
    selectedDoc.value = null
    selectedChunks.value = []
    return
  }
  loadingChunks.value = true
  selectedDoc.value = doc
  selectedChunks.value = await getDocumentChunks(doc.id)
  loadingChunks.value = false
}

async function handleRemoveDocument(id) {
  if (selectedDoc.value?.id === id) {
    selectedDoc.value = null
    selectedChunks.value = []
  }
  await removeDocument(id)
  await refreshDbStatusCounts()
}

async function handleRetry(docId) {
  isRetrying.value = true
  try {
    await retryFailedChunks(docId)
  } finally {
    isRetrying.value = false
  }
}

async function handleReindex(docId) {
  isReindexing.value = true
  try {
    await reindexDocument(docId)
    await refreshDbStatusCounts()
  } catch (err) {
    console.error('[ResearchPanel] Re-index failed:', err)
  } finally {
    isReindexing.value = false
  }
}

const aggregateStats = computed(() => {
  const values = Object.values(mergedProgress.value)
  if (!values.length) return null
  const total = values.reduce((s, v) => s + v.total, 0)
  const indexed = values.reduce((s, v) => s + v.indexed, 0)
  const failed = values.reduce((s, v) => s + v.failed, 0)
  return { total, indexed, failed }
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
      <h2 class="text-sm font-semibold text-text-primary tracking-wide">Research Library</h2>
      <button
        class="p-1.5 rounded-lg bg-accent text-bg-primary hover:bg-accent/90 transition-all duration-150 disabled:opacity-50"
        :disabled="isImporting"
        title="Import documents"
        @click="triggerFileInput"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.txt,.md,.html,.htm"
        multiple
        class="hidden"
        @change="handleFileChange"
      />
    </div>

    <div class="px-3 py-2">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search documents..."
        class="w-full px-2.5 py-1.5 text-xs bg-surface border border-border-subtle rounded-lg text-text-primary placeholder-text-hint/40 outline-none focus:border-accent/50 transition-colors"
      />
    </div>

    <div v-if="isImporting" class="px-4 py-3 text-xs text-accent animate-pulse">
      {{ importProgress || 'Importing...' }}
    </div>

    <div v-if="importError" class="px-4 py-2 mx-3 mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg">
      {{ importError }}
    </div>

    <div v-if="!documents.length && !isImporting" class="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-hint/40 mb-3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p class="text-xs text-text-hint/60 mb-1">No research documents yet</p>
      <p class="text-[10px] text-text-hint/40">Import PDF, TXT, MD, or HTML files</p>
    </div>

    <div v-else-if="!filteredDocuments.length && searchQuery" class="flex-1 flex items-center justify-center px-6">
      <p class="text-xs text-text-hint/40">No documents match "{{ searchQuery }}"</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto scrollbar-thin">
      <div v-for="doc in filteredDocuments" :key="doc.id">
        <div
          :class="[
            'flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors duration-150 hover:bg-accent-glass',
            selectedDoc?.id === doc.id ? 'bg-accent-glass border-l-2 border-accent' : 'border-l-2 border-transparent'
          ]"
          @click="selectDocument(doc)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-hint shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-text-primary truncate">{{ doc.fileName }}</p>
            <p class="text-[10px] text-text-hint/50 flex items-center gap-1.5">
              {{ doc.charCount?.toLocaleString() || 0 }} chars
              <template v-if="mergedIsIndexed(doc.id)">
                <span v-if="mergedHasFailed(doc.id)" class="inline-flex items-center gap-1 text-red-400/80">
                  <span>· {{ mergedProgress[doc.id].failed }} failed</span>
                  <button
                    class="p-0.5 rounded hover:bg-red-500/20 transition-colors"
                    title="Retry failed chunks"
                    :disabled="isRetrying"
                    @click.stop="handleRetry(doc.id)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  </button>
                </span>
                <span v-else class="text-green-400/60">· Indexed</span>
              </template>
              <template v-else-if="mergedProgress[doc.id]">
                <span class="text-accent">· Indexing {{ mergedProgress[doc.id].indexed }}/{{ mergedProgress[doc.id].total }}</span>
              </template>
              <template v-else-if="doc.chunkCount > 0">
                <span class="text-text-hint/30">· {{ doc.chunkCount }} chunks</span>
              </template>
              <span v-if="doc.tags?.length" class="text-text-hint/30 ml-1 truncate max-w-[120px]">· {{ doc.tags.slice(0, 4).join(', ') }}</span>
            </p>
          </div>
          <button
            class="p-1 rounded hover:bg-red-500/20 text-text-hint hover:text-red-400 transition-colors shrink-0"
            title="Re-index (re-chunk and re-embed)"
            :disabled="isReindexing"
            @click.stop="handleReindex(doc.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
          <button
            class="p-1 rounded hover:bg-red-500/20 text-text-hint hover:text-red-400 transition-colors shrink-0"
            title="Remove"
            @click.stop="handleRemoveDocument(doc.id)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>

        <div v-if="selectedDoc?.id === doc.id" class="border-b border-border-subtle/30">
          <div v-if="loadingChunks" class="px-6 py-3 text-xs text-text-hint/50 animate-pulse">Loading chunks...</div>
          <div v-else-if="!selectedChunks.length" class="px-6 py-3 text-xs text-text-hint/40">No chunks available</div>
          <div v-for="chunk in selectedChunks" :key="chunk.id || chunk.chunkIndex" class="px-6 py-2 border-b border-border-subtle/20 last:border-b-0">
            <p v-if="chunk.heading" class="text-[10px] uppercase tracking-wider text-accent/70 mb-1">{{ chunk.heading }}</p>
            <p class="text-[11px] text-text-secondary leading-relaxed line-clamp-3">{{ chunk.text }}</p>
            <p class="text-[9px] text-text-hint/40 mt-1 flex items-center gap-2">
              <span>{{ chunk.tokenEstimate }} tokens · {{ chunk.sentenceCount }} sentences</span>
              <span v-if="chunk.tags?.length" class="truncate max-w-[180px]">· {{ chunk.tags.slice(0, 3).join(', ') }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="px-4 py-2 border-t border-border-subtle text-[10px] text-text-hint/40 shrink-0">
      {{ documents.length }} doc{{ documents.length !== 1 ? 's' : '' }}
      <template v-if="searchQuery">· filtered to {{ filteredDocuments.length }}</template>
      <template v-if="aggregateStats">
        · {{ aggregateStats.indexed }}/{{ aggregateStats.total }} indexed
        <span v-if="aggregateStats.failed" class="text-red-400/60">· {{ aggregateStats.failed }} failed</span>
      </template>
      <span v-if="documents.length && !aggregateStats"> · {{ documents.reduce((s, d) => s + (d.charCount || 0), 0).toLocaleString() }} chars</span>
    </div>
  </div>
</template>
