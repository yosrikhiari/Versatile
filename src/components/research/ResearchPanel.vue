<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useFocusTrap } from '../../composables/useFocusTrap'
import { useProjectStore } from '../../stores/projectStore'
import { useResearchDocuments } from '../../composables/useResearchDocuments'
import { useEmbeddingIndexer } from '../../composables/useEmbeddingIndexer'
import { useNotifications } from '../../composables/useNotifications'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import VirtualScrollList from '../shared/VirtualScrollList.vue'
import { getDocumentStatusCounts, searchLexical, semanticSearch } from '../../services/researchDb'
import { getEmbeddings } from '../../services/embeddingService'
import { resume as resumeEmbeddingQueue } from '../../services/embeddingQueue'
import { useAsyncError } from '../../composables/useAsyncError'
const { onAsyncError } = useAsyncError()
const projectStore = useProjectStore()
const projectId = computed(() => projectStore.currentProjectId)

const {
  documents,
  isImporting,
  importProgress,
  importPercent,
  importError,
  showSizeWarning,
  pendingImportInfo,
  truncationInfo,
  loadDocuments,
  importFiles,
  checkFileSizes,
  confirmImport,
  cancelImport,
  removeDocument,
  getDocumentChunks,
  reindexDocument
} = useResearchDocuments(projectId)

const { indexProgress, retryFailedChunks } = useEmbeddingIndexer()
const { addToast } = useNotifications()
const modalRef = ref(null)
const { activate: activateFocusTrap, deactivate: deactivateFocusTrap } = useFocusTrap(modalRef)
const isRetrying = ref(false)
const isReindexing = ref(false)

const fileInput = ref(null)
const selectedDoc = ref(null)
const selectedChunks = ref([])
const loadingChunks = ref(false)
const dbStatusCounts = ref({})
const searchQuery = ref('')
const chunkSearchQuery = ref('')
const chunkSearchMode = ref(false)

const globalSearchQuery = ref('')
const globalSearchMode = ref('lexical')
const globalSearchResults = ref([])
const globalSearchError = ref('')
const isSearching = ref(false)
let searchDebounceTimer = null

async function runGlobalSearch(query) {
  if (!query || !projectId.value) {
    globalSearchResults.value = []
    globalSearchError.value = ''
    return
  }
  isSearching.value = true
  globalSearchError.value = ''
  try {
    if (globalSearchMode.value === 'semantic') {
      const { vectors } = await getEmbeddings([query])
      if (vectors[0]) {
        globalSearchResults.value = await semanticSearch(projectId.value, vectors[0], 30)
      } else {
        globalSearchResults.value = []
      }
    } else {
      globalSearchResults.value = await searchLexical(projectId.value, query, 30)
    }
  } catch (err) {
      console.error('[ResearchPanel] Global search failed:', err)
      onAsyncError(err)
      globalSearchResults.value = []
      globalSearchError.value = 'Search failed. Please try again.'
  } finally {
    isSearching.value = false
  }
}

function onGlobalSearchInput() {
  clearTimeout(searchDebounceTimer)
  if (!globalSearchQuery.value) {
    globalSearchResults.value = []
    return
  }
  searchDebounceTimer = setTimeout(() => runGlobalSearch(globalSearchQuery.value), 300)
}

const filteredDocuments = computed(() => {
  if (!searchQuery.value) return documents.value
  const q = searchQuery.value.toLowerCase()
  return documents.value.filter(d => d.fileName.toLowerCase().includes(q))
})

const filteredChunks = computed(() => {
  if (!chunkSearchQuery.value || !selectedChunks.value.length) return selectedChunks.value
  const q = chunkSearchQuery.value.toLowerCase()
  const qTokens = q.split(/\W+/).filter(t => t.length > 1)
  if (qTokens.length === 0) return selectedChunks.value
  const N = selectedChunks.value.length

  const df = {}
  for (const token of qTokens) {
    df[token] = selectedChunks.value.filter(c => c.text.toLowerCase().includes(token)).length
  }

  const scored = selectedChunks.value.map(chunk => {
    const lowerText = chunk.text.toLowerCase()
    let score = 0
    for (const token of qTokens) {
      const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      const tf = (lowerText.match(re) || []).length
      if (tf === 0) continue
      const idf = Math.log((N - df[token] + 0.5) / (df[token] + 0.5) + 1)
      score += (1 + Math.log(tf)) * idf
    }
    return { chunk, _score: score }
  })

  return scored
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .map(s => s.chunk)
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

watch(showSizeWarning, (val) => {
  if (val) {
    activateFocusTrap()
  } else {
    deactivateFocusTrap()
  }
})

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
  if (!checkFileSizes(files)) {
    event.target.value = ''
    return
  }
  await importFiles(Array.from(files))
  await refreshDbStatusCounts()
  if (!importError.value) addToast('Import complete.', 'success')
  event.target.value = ''
}

async function handleConfirmImport() {
  const files = pendingImportInfo.value.files
  confirmImport()
  await importFiles(Array.from(files))
  await refreshDbStatusCounts()
  if (!importError.value) addToast('Import complete.', 'success')
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
    if (selectedDoc.value?.id === docId) {
      selectedChunks.value = await getDocumentChunks(docId)
    }
  } catch (err) {
      console.error('[ResearchPanel] Re-index failed:', err)
      onAsyncError(err)
    } finally {
    isReindexing.value = false
  }
}

const importProgressPercent = computed(() => importPercent.value)

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
  <ErrorBoundary
    fallback-title="Research Panel Error"
    fallback-description="Failed to render the Research panel. Try refreshing the page."
  >
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
      <h2 class="text-sm font-semibold text-text-primary tracking-wide">Research Library</h2>
      <button
        class="p-1.5 rounded-lg bg-accent text-bg-primary hover:bg-accent/90 active:scale-[0.97] transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:opacity-50"
        :disabled="isImporting"
        title="Import documents"
        aria-label="Import documents"
        @click="triggerFileInput"
      >
        <BaseIcon name="upload" size="16" />
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

    <div class="px-3 py-2 space-y-1.5">
      <div class="flex items-center gap-1.5">
        <div class="relative flex-1">
          <BaseIcon name="search" size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none" />
          <input
            v-model="globalSearchQuery"
            type="text"
            placeholder="Search all chunks..."
            class="w-full pl-8 pr-3 py-2 text-xs bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint/50 outline-none focus:border-accent/60 focus-visible:ring-1 focus-visible:ring-accent/40 transition-colors"
            @input="onGlobalSearchInput"
          />
        </div>
        <button
          class="w-7 h-7 text-11px font-medium rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
          :class="globalSearchMode === 'lexical' ? 'bg-accent text-bg-primary shadow-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'bg-bg-secondary border border-border-subtle text-text-hint hover:text-text-primary hover:border-border-hover'"
          title="Lexical search (keyword matching)"
          aria-label="Lexical search mode"
          :aria-pressed="globalSearchMode === 'lexical'"
          @click="globalSearchMode = 'lexical'; if (globalSearchQuery) runGlobalSearch(globalSearchQuery)"
        >T</button>
        <button
          class="w-7 h-7 text-11px font-medium rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
          :class="globalSearchMode === 'semantic' ? 'bg-accent text-bg-primary shadow-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'bg-bg-secondary border border-border-subtle text-text-hint hover:text-text-primary hover:border-border-hover'"
          title="Semantic search (embedding similarity)"
          aria-label="Semantic search mode"
          :aria-pressed="globalSearchMode === 'semantic'"
          @click="globalSearchMode = 'semantic'; if (globalSearchQuery) runGlobalSearch(globalSearchQuery)"
        >AI</button>
      </div>
      <div v-if="!globalSearchResults.length" class="relative">
        <BaseIcon name="search" size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter documents..."
          class="w-full pl-8 pr-3 py-2 text-xs bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint/50 outline-none focus:border-accent/60 focus-visible:ring-1 focus-visible:ring-accent/40 transition-colors"
        />
      </div>
    </div>

    <div v-if="globalSearchError" role="alert" class="px-3 py-1.5 mx-3 text-xs text-danger bg-danger/10 rounded-lg">
      {{ globalSearchError }}
    </div>

    <div v-if="showSizeWarning" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @keydown.escape="cancelImport">
      <div
        ref="modalRef"
        class="mx-4 w-full max-w-sm bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl p-5 animate-fade-in"
        tabindex="-1"
        @keydown.escape="cancelImport"
      >
        <h3 class="text-sm font-semibold text-text-primary mb-2">Large Import</h3>
        <p class="text-xs text-text-secondary mb-1">
          These files total <strong>{{ (pendingImportInfo.totalChars / 1000000).toFixed(1) }}MB</strong>.
          Processing large files may cause the browser to slow down temporarily.
        </p>
        <p class="text-xs text-text-hint/50 mb-4">Proceed with import?</p>
        <div class="flex items-center gap-2 justify-end">
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-bg-secondary border border-border-subtle text-text-secondary hover:bg-border-subtle hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            @click="cancelImport"
          >Cancel</button>
          <button
            class="px-3 py-1.5 text-xs rounded-lg bg-accent text-bg-primary hover:bg-accent/90 active:scale-[0.97] transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
            :disabled="isImporting"
            @click="handleConfirmImport"
          >Import</button>
        </div>
      </div>
    </div>

    <div v-if="isImporting" class="px-4 py-3 text-xs space-y-2">
      <div class="flex items-center gap-2">
        <BaseIcon name="rotate-cw" size="14" class="animate-spin shrink-0 text-accent" />
        <span class="text-accent">{{ importProgress || 'Importing...' }}</span>
      </div>
      <div class="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
        <div class="h-full bg-accent rounded-full transition-all duration-300" :style="{ width: importProgressPercent + '%' }"></div>
      </div>
    </div>

    <div v-if="importError && !isImporting" class="px-4 py-2 mx-3 mt-2 text-xs text-danger bg-danger/10 rounded-lg">
      {{ importError }}
    </div>

    <div v-if="truncationInfo && !isImporting" class="px-4 py-2 mx-3 mt-2 text-xs text-warning bg-warning/10 rounded-lg">
      {{ truncationInfo }}
    </div>

    <div v-if="globalSearchQuery && isSearching" class="flex-1 flex items-center justify-center">
      <p class="text-xs text-text-hint/50 animate-pulse">Searching...</p>
    </div>

    <div v-else-if="globalSearchQuery && globalSearchResults.length" class="flex-1 overflow-y-auto scrollbar-thin">
      <div v-for="(result, i) in globalSearchResults" :key="result.id || i" class="px-4 py-2 border-b border-border-subtle/20">
        <p class="text-11px text-text-secondary leading-relaxed line-clamp-3">{{ result.text }}</p>
        <p class="text-3xs text-text-hint/50 mt-1 flex items-center gap-2">
          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 text-accent rounded text-3xs">{{ result.fileName || 'Unknown doc' }}</span>
          <span>{{ result._score?.toFixed(3) }}</span>
          <span>· {{ result.tokenEstimate || '?' }} tokens</span>
        </p>
      </div>
    </div>

    <div v-else-if="globalSearchQuery && !isSearching" class="flex-1 flex items-center justify-center px-6">
      <p class="text-xs text-text-hint/40">No results for "{{ globalSearchQuery }}"</p>
    </div>

    <div v-else-if="!documents.length && !isImporting" class="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <BaseIcon name="file" size="32" class="text-text-hint/40 mb-3" />
      <p class="text-xs text-text-hint/60 mb-1">No research documents yet</p>
      <p class="text-2xs text-text-hint/40">Import PDF, TXT, MD, or HTML files</p>
    </div>

    <div v-else-if="!filteredDocuments.length && searchQuery" class="flex-1 flex items-center justify-center px-6">
      <p class="text-xs text-text-hint/40">No documents match "{{ searchQuery }}"</p>
    </div>

    <div v-else-if="selectedDoc" class="flex-1 flex flex-col overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <button
            class="p-1 rounded-lg hover:bg-accent/20 text-text-hint hover:text-accent transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            title="Back to library"
            aria-label="Back to library"
            @click="selectedDoc = null; selectedChunks = []"
          >
            <BaseIcon name="arrow-left" size="14" />
          </button>
          <div class="min-w-0">
            <p class="text-xs font-semibold text-text-primary truncate">{{ selectedDoc.fileName }}</p>
            <p class="text-2xs text-text-hint/50">{{ selectedChunks.length }} chunks · {{ selectedDoc.charCount?.toLocaleString() }} chars</p>
          </div>
        </div>
        <button
          class="p-1 rounded hover:bg-accent/20 text-text-hint hover:text-accent transition-colors shrink-0 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
          title="Re-index document"
          aria-label="Re-index document"
          :disabled="isReindexing"
          @click.stop="handleReindex(selectedDoc.id)"
        >
          <BaseIcon v-if="isReindexing" name="rotate-cw" size="12" class="animate-spin" />
          <BaseIcon v-else name="rotate-cw" size="12" />
        </button>
      </div>

      <div v-if="loadingChunks" class="flex-1 flex items-center justify-center">
        <p class="text-xs text-text-hint/50 animate-pulse">Loading chunks...</p>
      </div>
      <div v-else-if="!selectedChunks.length" class="flex-1 flex items-center justify-center">
        <p class="text-xs text-text-hint/40">No chunks available</p>
      </div>
      <template v-else>
        <div class="px-3 py-1.5 border-b border-border-subtle/20 shrink-0">
          <div class="relative">
            <BaseIcon name="search" size="12" class="absolute left-2 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none" />
            <input
              v-model="chunkSearchQuery"
              type="text"
              placeholder="Search within chunks..."
              class="w-full pl-7 pr-2 py-1 text-2xs bg-bg-secondary border border-border-subtle rounded text-text-primary placeholder-text-hint/50 outline-none focus:border-accent/60 focus-visible:ring-1 focus-visible:ring-accent/40 transition-colors"
            />
          </div>
        </div>
        <div class="flex-1 border-t border-border-subtle/20 overflow-y-auto scrollbar-thin">
          <VirtualScrollList
            :items="filteredChunks"
            :item-height="88"
            :key-prop="filteredChunks[0]?.id ? 'id' : 'chunkIndex'"
          >
            <template #item="{ item: chunk }">
              <div class="px-6 py-2 border-b border-border-subtle/20">
                <p v-if="chunk.heading" class="text-2xs uppercase tracking-wider text-accent/70 mb-1">{{ chunk.heading }}</p>
                <p class="text-11px text-text-secondary leading-relaxed line-clamp-3">{{ chunk.text }}</p>
                <p class="text-3xs text-text-hint/40 mt-1 flex items-center gap-2">
                  <span>{{ chunk.tokenEstimate }} tokens · {{ chunk.sentenceCount }} sentences</span>
                  <span v-if="chunk.tags?.length" class="truncate max-w-44">· {{ chunk.tags.slice(0, 3).join(', ') }}</span>
                </p>
              </div>
            </template>
          </VirtualScrollList>
        </div>
      </template>
    </div>

    <div v-else role="list" class="flex-1 overflow-y-auto scrollbar-thin">
      <div v-for="doc in filteredDocuments" :key="doc.id" role="listitem">
        <div
          role="button"
          tabindex="0"
          :class="[
            'flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors duration-150 hover:bg-accent-glass focus-visible:bg-accent-glass focus-visible:outline-none',
            selectedDoc?.id === doc.id ? 'bg-accent-glass border-l-2 border-accent' : 'border-l-2 border-transparent'
          ]"
          @click="selectDocument(doc)"
          @keydown.enter.stop.prevent="selectDocument(doc)"
          @keydown.space.stop.prevent="selectDocument(doc)"
        >
            <BaseIcon name="file" size="14" class="text-text-hint shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-xs text-text-primary truncate">{{ doc.fileName }}</p>
            <p class="text-2xs text-text-hint/50 flex items-center gap-1.5">
              {{ doc.charCount?.toLocaleString() || 0 }} chars
              <template v-if="mergedIsIndexed(doc.id)">
                 <span v-if="mergedHasFailed(doc.id)" class="inline-flex items-center gap-1 text-danger/80">
                  <span>· {{ mergedProgress[doc.id].failed }} failed</span>
                    <button
            class="p-0.5 rounded hover:bg-danger/20 transition-colors disabled:opacity-40"
            title="Retry failed chunks"
            aria-label="Retry failed chunks"
            :disabled="isRetrying"
            @click.stop="handleRetry(doc.id)"
          >
            <BaseIcon v-if="isRetrying" name="rotate-cw" size="10" class="animate-spin" />
            <BaseIcon v-else name="rotate-cw" size="10" />
          </button>
                </span>
                <span v-else class="text-success/60">· Indexed</span>
              </template>
              <template v-else-if="mergedProgress[doc.id]">
                <span class="text-accent">· Indexing {{ mergedProgress[doc.id].indexed }}/{{ mergedProgress[doc.id].total }}</span>
              </template>
              <template v-else-if="doc.chunkCount > 0">
                <span class="text-text-hint/30">· {{ doc.chunkCount }} chunks</span>
              </template>
              <span v-if="doc.tags?.length" class="text-text-hint/30 ml-1 truncate max-w-30">· {{ doc.tags.slice(0, 4).join(', ') }}</span>
            </p>
          </div>
          <button
            class="p-1 rounded hover:bg-danger/20 text-text-hint hover:text-danger transition-colors shrink-0 disabled:opacity-40"
            title="Re-index (re-chunk and re-embed)"
            aria-label="Re-index document"
            :disabled="isReindexing"
            @click.stop="handleReindex(doc.id)"
          >
            <BaseIcon v-if="isReindexing" name="rotate-cw" size="12" class="animate-spin" />
            <BaseIcon v-else name="rotate-cw" size="12" />
          </button>
          <button
            class="p-1 rounded hover:bg-danger/20 text-text-hint hover:text-danger transition-colors shrink-0"
            title="Remove"
            aria-label="Remove document"
            @click.stop="handleRemoveDocument(doc.id)"
          >
            <BaseIcon name="trash-2" size="12" />
          </button>
        </div>
      </div>
    </div>

    <div aria-live="polite" class="px-4 py-2 border-t border-border-subtle text-2xs text-text-hint/40 shrink-0">
      <template v-if="globalSearchQuery">
        {{ globalSearchResults.length }} result{{ globalSearchResults.length !== 1 ? 's' : '' }}
        <template v-if="isSearching">· searching...</template>
      </template>
      <template v-else-if="selectedDoc">
        Viewing · {{ selectedChunks.length }} chunk{{ selectedChunks.length !== 1 ? 's' : '' }}
      </template>
      <template v-else>
        {{ documents.length }} doc{{ documents.length !== 1 ? 's' : '' }}
        <template v-if="searchQuery">· filtered to {{ filteredDocuments.length }}</template>
        <template v-if="aggregateStats">
          · {{ aggregateStats.indexed }}/{{ aggregateStats.total }} indexed
          <span v-if="aggregateStats.failed" class="text-danger/60">· {{ aggregateStats.failed }} failed</span>
        </template>
        <span v-if="documents.length && !aggregateStats"> · {{ documents.reduce((s, d) => s + (d.charCount || 0), 0).toLocaleString() }} chars</span>
      </template>
    </div>
  </div>
  </ErrorBoundary>
</template>
