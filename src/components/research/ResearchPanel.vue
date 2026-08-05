<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useFocusTrap } from '../../composables/useFocusTrap'
import { useProjectStore } from '../../stores/projectStore'
import { useResearchDocuments } from '../../composables/useResearchDocuments'
import { useEmbeddingIndexer } from '../../composables/useEmbeddingIndexer'
import { useNotifications } from '../../composables/useNotifications'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import VirtualScrollList from '../shared/VirtualScrollList.vue'
import Skeleton from '../shared/Skeleton.vue'
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
  importFromUrl,
  checkFileSizes,
  confirmImport,
  cancelImport,
  removeDocument,
  getDocumentChunks,
  reindexDocument,
  isExtracting,
  entityExtractionError,
  entityExtractionResult,
  extractEntities,
  acceptEntityExtraction,
  clearEntityExtraction
} = useResearchDocuments(projectId)

const { indexProgress, retryFailedChunks } = useEmbeddingIndexer()
const { addToast } = useNotifications()
const modalRef = ref(null)
const { activate: activateFocusTrap, deactivate: deactivateFocusTrap } = useFocusTrap(modalRef)
const isRetrying = ref(false)
const isReindexing = ref(false)

const fileInput = ref(null)
const showUrlInput = ref(false)
const urlInput = ref(null)
const urlToImport = ref('')
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
  return documents.value.filter((d) => d.fileName.toLowerCase().includes(q))
})

const filteredChunks = computed(() => {
  if (!chunkSearchQuery.value || !selectedChunks.value.length) return selectedChunks.value
  const q = chunkSearchQuery.value.toLowerCase()
  const qTokens = q.split(/\W+/).filter((t) => t.length > 1)
  if (qTokens.length === 0) return selectedChunks.value
  const N = selectedChunks.value.length

  const df = {}
  for (const token of qTokens) {
    df[token] = selectedChunks.value.filter((c) => c.text.toLowerCase().includes(token)).length
  }

  const scored = selectedChunks.value.map((chunk) => {
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
    .filter((s) => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .map((s) => s.chunk)
})

async function refreshDbStatusCounts() {
  const counts = {}
  if (!projectId.value) {
    dbStatusCounts.value = counts
    return
  }
  const docIds = documents.value.map((d) => d.id)
  await Promise.all(
    docIds.map(async (id) => {
      try {
        const st = await getDocumentStatusCounts(id)
        if (st.total > 0) counts[id] = { total: st.total, indexed: st.READY, failed: st.FAILED }
      } catch {
        /* silent */
      }
    })
  )
  dbStatusCounts.value = counts
}

// The DB is the authority on how much of a document is indexed; the live queue
// only knows about the chunks *it* was handed this session.
//
// A plain `{...db, ...live}` let the live entry replace the DB one, and after a
// resume that entry covers only the not-yet-embedded remainder — so a document
// sitting at 900/1000 in Dexie displayed "Indexing 0/100" and then flipped to
// "Indexed" while 100 chunks were still missing. Reconciling the two keeps the
// denominator honest and still shows live movement.
const mergedProgress = computed(() => {
  const merged = { ...dbStatusCounts.value }
  for (const [docId, live] of Object.entries(indexProgress.value)) {
    const db = merged[docId]
    if (!db) {
      merged[docId] = { ...live }
      continue
    }
    // `db.total` counts every chunk on disk; `live.total` only this session's
    // batch. Already-indexed chunks are those the queue never saw.
    const alreadyIndexed = Math.max(0, db.total - live.total)
    merged[docId] = {
      total: Math.max(db.total, live.total),
      indexed: Math.min(db.total, alreadyIndexed + live.indexed),
      failed: Math.max(db.failed || 0, live.failed)
    }
  }
  return merged
})

function mergedIsIndexed(docId) {
  const p = mergedProgress.value[docId]
  return p ? p.indexed + p.failed >= p.total : false
}
function mergedHasFailed(docId) {
  const p = mergedProgress.value[docId]
  return p ? p.failed > 0 : false
}

// Re-read the DB once the queue goes quiet. Without this the badge only ever
// reflected the counts taken at mount plus whatever the live subscription
// happened to see, so a background resume that finished after the panel loaded
// left a document showing as partially indexed until the next project switch.
let settleTimer = null
watch(
  indexProgress,
  (progress) => {
    const inFlight = Object.values(progress).some((p) => p.indexed + p.failed < p.total)
    if (inFlight) return
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      if (projectId.value) refreshDbStatusCounts()
    }, 500)
  },
  { deep: true }
)

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
    resumeEmbeddingQueue(projectId.value).then((count) => {
      if (count > 0) console.info(`[ResearchPanel] Resumed indexing ${count} chunks`)
    })
  }
})

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = null
  }
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
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

function toggleUrlInput() {
  showUrlInput.value = !showUrlInput.value
  if (showUrlInput.value) {
    urlToImport.value = ''
    setTimeout(() => urlInput.value?.focus(), 100)
  }
}

async function handleUrlImport() {
  const url = urlToImport.value.trim()
  if (!url) return
  showUrlInput.value = false
  await importFromUrl(url)
  await refreshDbStatusCounts()
  if (!importError.value) addToast('URL imported.', 'success')
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

function setLexicalSearch() {
  globalSearchMode.value = 'lexical'
  if (globalSearchQuery.value) runGlobalSearch(globalSearchQuery.value)
}

function setSemanticSearch() {
  globalSearchMode.value = 'semantic'
  if (globalSearchQuery.value) runGlobalSearch(globalSearchQuery.value)
}

function clearSelectedDoc() {
  selectedDoc.value = null
  selectedChunks.value = []
}

async function handleExtractEntities() {
  if (!selectedDoc.value?.id) return
  await extractEntities(selectedDoc.value.id)
  if (!entityExtractionError.value) {
    addToast('Entity extraction complete', 'success')
  }
}

function handleAcceptExtraction() {
  if (!entityExtractionResult.value) return
  acceptEntityExtraction(entityExtractionResult.value)
  addToast('Entities added to Story Bible', 'success')
}

function handleClearExtraction() {
  clearEntityExtraction()
}
</script>

<template>
  <ErrorBoundary
    fallback-title="Research Panel Error"
    fallback-description="Failed to render the Research panel. Try refreshing the page."
  >
    <div class="h-full flex flex-col overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0"
      >
        <h2 class="text-sm font-semibold text-text-primary tracking-wide">Research Library</h2>
        <div class="flex items-center gap-1">
          <!-- prettier-ignore -->
          <button
            class="p-1.5 rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:opacity-50"
            :class="showUrlInput ? 'btn-primary' : 'bg-bg-secondary border border-border-subtle text-text-hint hover:text-text-primary hover:border-border-hover'"
            :disabled="isImporting"
            title="Import from URL"
            aria-label="Import from URL"
            @click="toggleUrlInput"
          >
            <BaseIcon name="link" size="14" />
          </button>
          <!-- prettier-ignore -->
          <button
            class="p-1.5 rounded-lg btn-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:opacity-50"
            :disabled="isImporting"
            title="Import files"
            aria-label="Import files"
            @click="triggerFileInput"
          >
            <BaseIcon name="upload" size="16" />
          </button>
        </div>
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
            <BaseIcon
              name="search"
              size="14"
              class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none"
            />
            <input
              v-model="globalSearchQuery"
              type="text"
              placeholder="Search all chunks..."
              class="w-full pl-8 pr-3 py-2 text-xs bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint/50 outline-none focus:border-accent/60 focus-visible:ring-1 focus-visible:ring-accent/40 transition-colors"
              @input="onGlobalSearchInput"
            />
          </div>
          <!-- prettier-ignore -->
          <button
            class="w-7 h-7 text-11px font-medium rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            :class="
              globalSearchMode === 'lexical'
                ? 'btn-primary'
                : 'bg-bg-secondary border border-border-subtle text-text-hint hover:text-text-primary hover:border-border-hover'
            "
            title="Lexical search (keyword matching)"
            aria-label="Lexical search mode"
            :aria-pressed="globalSearchMode === 'lexical'"
            @click="setLexicalSearch()"
          >
            T
          </button>
          <!-- prettier-ignore -->
          <button
            class="w-7 h-7 text-11px font-medium rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            :class="
              globalSearchMode === 'semantic'
                ? 'btn-primary'
                : 'bg-bg-secondary border border-border-subtle text-text-hint hover:text-text-primary hover:border-border-hover'
            "
            title="Semantic search (embedding similarity)"
            aria-label="Semantic search mode"
            :aria-pressed="globalSearchMode === 'semantic'"
            @click="setSemanticSearch()"
          >
            AI
          </button>
        </div>
        <div v-if="!globalSearchResults.length" class="relative">
          <BaseIcon
            name="search"
            size="14"
            class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter documents..."
            class="w-full pl-8 pr-3 py-2 text-xs bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint/50 outline-none focus:border-accent/60 focus-visible:ring-1 focus-visible:ring-accent/40 transition-colors"
          />
        </div>
      </div>

      <div v-if="showUrlInput" class="px-3 py-2 border-b border-border-subtle/20">
        <form class="flex items-center gap-1.5" @submit.prevent="handleUrlImport">
          <div class="relative flex-1">
            <BaseIcon
              name="link"
              size="12"
              class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none"
            />
            <input
              ref="urlInput"
              v-model="urlToImport"
              type="url"
              placeholder="Paste a URL to import..."
              class="w-full pl-7 pr-3 py-1.5 text-xs bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint/50 outline-none focus:border-accent/60 focus-visible:ring-1 focus-visible:ring-accent/40 transition-colors"
              autocomplete="url"
            />
          </div>
          <!-- prettier-ignore -->
          <button
            type="submit"
            class="px-2.5 py-1.5 text-xs rounded-lg btn-primary active:scale-[0.97] disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
            :disabled="isImporting || !urlToImport.trim()"
          >
            Import
          </button>
          <!-- prettier-ignore -->
          <button
            type="button"
            class="p-1.5 rounded-lg bg-bg-secondary border border-border-subtle text-text-hint hover:text-text-primary hover:border-border-hover transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            :disabled="isImporting"
            @click="showUrlInput = false"
          >
            <BaseIcon name="x" size="12" />
          </button>
        </form>
      </div>

      <div
        v-if="globalSearchError"
        role="alert"
        class="px-3 py-1.5 mx-3 text-xs text-danger bg-bg-secondary rounded-lg"
      >
        {{ globalSearchError }}
      </div>

      <div
        v-if="showSizeWarning"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @keydown.escape="cancelImport"
      >
        <div
          ref="modalRef"
          class="mx-4 w-full max-w-sm bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl p-5 animate-fade-in"
          tabindex="-1"
          @keydown.escape="cancelImport"
        >
          <h3 class="text-sm font-semibold text-text-primary mb-2">Large Import</h3>
          <p class="text-xs text-text-secondary mb-1">
            These files total
            <strong>{{ (pendingImportInfo.totalChars / 1000000).toFixed(1) }}MB</strong>. Processing
            large files may cause the browser to slow down temporarily.
          </p>
          <p class="text-xs text-text-hint/50 mb-4">Proceed with import?</p>
          <div class="flex items-center gap-2 justify-end">
            <button
              class="px-3 py-1.5 text-xs rounded-lg bg-bg-secondary border border-border-subtle text-text-secondary hover:bg-border-subtle hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
              @click="cancelImport"
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 text-xs rounded-lg btn-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
              :disabled="isImporting"
              @click="handleConfirmImport"
            >
              Import
            </button>
          </div>
        </div>
      </div>

      <div v-if="isImporting" class="px-4 py-3 text-xs space-y-2">
        <div class="flex items-center gap-2">
          <BaseIcon name="rotate-cw" size="14" class="animate-spin shrink-0 text-accent" />
          <span class="text-accent">{{ importProgress || 'Importing...' }}</span>
        </div>
        <div class="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden">
          <div
            class="h-full bg-accent rounded-full transition-all duration-300"
            :style="{ width: importProgressPercent + '%' }"
          ></div>
        </div>
      </div>

      <div
        v-if="importError && !isImporting"
        class="px-4 py-2 mx-3 mt-2 text-xs text-danger bg-bg-secondary rounded-lg"
      >
        {{ importError }}
      </div>

      <div
        v-if="truncationInfo && !isImporting"
        class="px-4 py-2 mx-3 mt-2 text-xs text-warning bg-bg-secondary rounded-lg"
      >
        {{ truncationInfo }}
      </div>

      <div v-if="globalSearchQuery && isSearching" class="flex-1 flex items-center justify-center">
        <p class="text-xs text-text-hint/50 animate-pulse">Searching...</p>
      </div>

      <div
        v-else-if="globalSearchQuery && globalSearchResults.length"
        class="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div
          v-for="(result, i) in globalSearchResults"
          :key="result.id || i"
          class="px-4 py-2 border-b border-border-subtle/20"
        >
          <p class="text-11px text-text-secondary leading-relaxed line-clamp-3">
            {{ result.text }}
          </p>
          <p class="text-2xs text-text-hint/50 mt-1 flex items-center gap-2">
            <span
              class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-bg-secondary text-accent rounded text-2xs"
              >{{ result.fileName || 'Unknown doc' }}</span
            >
            <span>{{ result._score?.toFixed(3) }}</span>
            <span>· {{ result.tokenEstimate || '?' }} tokens</span>
          </p>
        </div>
      </div>

      <div
        v-else-if="globalSearchQuery && !isSearching"
        class="flex-1 flex items-center justify-center px-6"
      >
        <p class="text-xs text-text-hint/40">No results for "{{ globalSearchQuery }}"</p>
      </div>

      <div
        v-else-if="!documents.length && !isImporting"
        class="flex-1 flex flex-col items-center justify-center px-6 text-center"
      >
        <BaseIcon name="file" size="32" class="text-text-hint/40 mb-3" />
        <p class="text-xs text-text-hint/60 mb-1">No research documents yet</p>
        <p class="text-2xs text-text-hint/40">Import PDF, TXT, MD, or HTML files</p>
      </div>

      <div
        v-else-if="!filteredDocuments.length && searchQuery"
        class="flex-1 flex items-center justify-center px-6"
      >
        <p class="text-xs text-text-hint/40">No documents match "{{ searchQuery }}"</p>
      </div>

      <div v-else-if="selectedDoc" class="flex-1 flex flex-col overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0"
        >
          <div class="flex items-center gap-2 min-w-0">
            <!-- prettier-ignore -->
            <button
              class="p-1 rounded-lg hover:bg-surface-hover text-text-hint hover:text-accent transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
              title="Back to library"
              aria-label="Back to library"
              @click="clearSelectedDoc()"
            >
              <BaseIcon name="arrow-left" size="14" />
            </button>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-text-primary truncate">
                {{ selectedDoc.fileName }}
              </p>
              <p class="text-2xs text-text-hint/50">
                {{ selectedChunks.length }} chunks ·
                {{ selectedDoc.charCount?.toLocaleString() }} chars
              </p>
            </div>
          </div>
          <button
            class="p-1 rounded hover:bg-surface-hover text-text-hint hover:text-accent transition-colors shrink-0 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            title="Re-index document"
            aria-label="Re-index document"
            :disabled="isReindexing"
            @click.stop="handleReindex(selectedDoc.id)"
          >
            <BaseIcon v-if="isReindexing" name="rotate-cw" size="12" class="animate-spin" />
            <BaseIcon v-else name="rotate-cw" size="12" />
          </button>
          <button
            class="p-1 rounded hover:bg-surface-hover text-text-hint hover:text-accent transition-colors shrink-0 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
            title="Extract entities from document"
            aria-label="Extract entities from document"
            :disabled="isExtracting"
            @click.stop="handleExtractEntities"
          >
            <BaseIcon v-if="isExtracting" name="rotate-cw" size="12" class="animate-spin" />
            <BaseIcon v-else name="bot" size="12" />
          </button>
        </div>

        <div
          v-if="entityExtractionError"
          class="px-4 py-2 bg-red-500/10 border-b border-red-500/20"
        >
          <p class="text-2xs text-red-400">{{ entityExtractionError }}</p>
        </div>
        <div
          v-if="entityExtractionResult"
          class="border-b border-border-subtle bg-surface-secondary/30"
        >
          <div class="px-4 py-2 flex items-center justify-between">
            <div class="flex items-center gap-3 text-2xs text-text-secondary">
              <span
                >{{
                  entityExtractionResult.proposed.characters.length +
                  entityExtractionResult.proposed.locations.length
                }}
                proposed</span
              >
              <span
                v-if="
                  entityExtractionResult.conflicts.characters.length +
                    entityExtractionResult.conflicts.locations.length >
                  0
                "
                class="text-amber-400"
              >
                {{
                  entityExtractionResult.conflicts.characters.length +
                  entityExtractionResult.conflicts.locations.length
                }}
                conflicts
              </span>
              <span>{{ entityExtractionResult.relationships.length }} relationships</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="px-2 py-1 rounded text-2xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                @click="handleAcceptExtraction"
              >
                Accept to Bible
              </button>
              <button
                class="px-2 py-1 rounded text-2xs text-text-hint hover:text-text-primary transition-colors"
                @click="handleClearExtraction"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div
            v-if="
              entityExtractionResult.proposed.characters.length > 0 ||
              entityExtractionResult.proposed.locations.length > 0 ||
              entityExtractionResult.conflicts.characters.length > 0 ||
              entityExtractionResult.conflicts.locations.length > 0
            "
            class="px-4 pb-2 flex flex-wrap gap-1.5"
          >
            <span
              v-for="char in entityExtractionResult.proposed.characters"
              :key="'p-char-' + char.name"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-blue-500/10 text-blue-400"
            >
              <BaseIcon name="users" size="10" />{{ char.name }}
            </span>
            <span
              v-for="loc in entityExtractionResult.proposed.locations"
              :key="'p-loc-' + loc.name"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-green-500/10 text-green-400"
            >
              <BaseIcon name="map-pin" size="10" />{{ loc.name }}
            </span>
            <span
              v-for="conf in entityExtractionResult.conflicts.characters"
              :key="'c-char-' + conf.name"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-amber-500/10 text-amber-400"
              :title="'Potential duplicate of: ' + conf.existing.map((e) => e.name).join(', ')"
            >
              <BaseIcon name="octagon-alert" size="10" />{{ conf.name }}
            </span>
            <span
              v-for="conf in entityExtractionResult.conflicts.locations"
              :key="'c-loc-' + conf.name"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-amber-500/10 text-amber-400"
              :title="'Potential duplicate of: ' + conf.existing.map((e) => e.name).join(', ')"
            >
              <BaseIcon name="octagon-alert" size="10" />{{ conf.name }}
            </span>
          </div>
        </div>

        <div v-if="loadingChunks" class="flex-1 px-3 py-3 overflow-hidden">
          <Skeleton variant="list" :count="5" size="1.75rem" label="Loading chunks…" />
        </div>
        <div v-else-if="!selectedChunks.length" class="flex-1 flex items-center justify-center">
          <p class="text-xs text-text-hint/40">No chunks available</p>
        </div>
        <template v-else>
          <div class="px-3 py-1.5 border-b border-border-subtle/20 shrink-0">
            <div class="relative">
              <BaseIcon
                name="search"
                size="12"
                class="absolute left-2 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none"
              />
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
                  <p
                    v-if="chunk.heading"
                    class="text-2xs uppercase tracking-wider text-accent/70 mb-1"
                  >
                    {{ chunk.heading }}
                  </p>
                  <p class="text-11px text-text-secondary leading-relaxed line-clamp-3">
                    {{ chunk.text }}
                  </p>
                  <p class="text-2xs text-text-hint/40 mt-1 flex items-center gap-2">
                    <span
                      >{{ chunk.tokenEstimate }} tokens · {{ chunk.sentenceCount }} sentences</span
                    >
                    <span v-if="chunk.tags?.length" class="truncate max-w-44"
                      >· {{ chunk.tags.slice(0, 3).join(', ') }}</span
                    >
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
              'flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
              selectedDoc?.id === doc.id
                ? 'bg-surface-hover border-l-2 border-accent'
                : 'border-l-2 border-transparent'
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
                  <span
                    v-if="mergedHasFailed(doc.id)"
                    class="inline-flex items-center gap-1 text-danger/80"
                  >
                    <span>· {{ mergedProgress[doc.id].failed }} failed</span>
                    <button
                      class="p-0.5 rounded hover:bg-surface-hover transition-colors disabled:opacity-40"
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
                  <span class="text-accent"
                    >· Indexing {{ mergedProgress[doc.id].indexed }}/{{
                      mergedProgress[doc.id].total
                    }}</span
                  >
                </template>
                <template v-else-if="doc.chunkCount > 0">
                  <span class="text-text-hint/30">· {{ doc.chunkCount }} chunks</span>
                </template>
                <span v-if="doc.tags?.length" class="text-text-hint/30 ml-1 truncate max-w-30"
                  >· {{ doc.tags.slice(0, 4).join(', ') }}</span
                >
              </p>
            </div>
            <button
              class="p-1 rounded hover:bg-surface-hover text-text-hint hover:text-danger transition-colors shrink-0 disabled:opacity-40"
              title="Re-index (re-chunk and re-embed)"
              aria-label="Re-index document"
              :disabled="isReindexing"
              @click.stop="handleReindex(doc.id)"
            >
              <BaseIcon v-if="isReindexing" name="rotate-cw" size="12" class="animate-spin" />
              <BaseIcon v-else name="rotate-cw" size="12" />
            </button>
            <button
              class="p-1 rounded hover:bg-surface-hover text-text-hint hover:text-danger transition-colors shrink-0"
              title="Remove"
              aria-label="Remove document"
              @click.stop="handleRemoveDocument(doc.id)"
            >
              <BaseIcon name="trash-2" size="12" />
            </button>
          </div>
        </div>
      </div>

      <div
        aria-live="polite"
        class="px-4 py-2 border-t border-border-subtle text-2xs text-text-hint/40 shrink-0"
      >
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
            <span v-if="aggregateStats.failed" class="text-danger/60"
              >· {{ aggregateStats.failed }} failed</span
            >
          </template>
          <span v-if="documents.length && !aggregateStats">
            ·
            {{ documents.reduce((s, d) => s + (d.charCount || 0), 0).toLocaleString() }} chars</span
          >
        </template>
      </div>
    </div>
  </ErrorBoundary>
</template>
