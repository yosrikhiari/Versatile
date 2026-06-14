<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useResearchDocuments } from '../../composables/useResearchDocuments'
import { useEmbeddingIndexer } from '../../composables/useEmbeddingIndexer'
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
  getDocumentChunks
} = useResearchDocuments(projectId)

const { indexProgress } = useEmbeddingIndexer()

const fileInput = ref(null)
const selectedDoc = ref(null)
const selectedChunks = ref([])
const loadingChunks = ref(false)

watch(projectId, () => {
  selectedDoc.value = null
  selectedChunks.value = []
  if (projectId.value) loadDocuments()
})

onMounted(() => {
  if (projectId.value) loadDocuments()
})

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(event) {
  const files = event.target.files
  if (!files?.length) return
  await importFiles(files)
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
}
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

    <div v-else class="flex-1 overflow-y-auto scrollbar-thin">
      <div v-for="doc in documents" :key="doc.id">
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
            <p class="text-[10px] text-text-hint/50">
              {{ doc.charCount?.toLocaleString() || 0 }} chars
              <template v-if="indexProgress[doc.id]">
                <span v-if="indexProgress[doc.id].indexed < indexProgress[doc.id].total" class="text-accent"> · Indexing {{ indexProgress[doc.id].indexed }}/{{ indexProgress[doc.id].total }}</span>
                <span v-else class="text-green-400/60"> · Indexed</span>
              </template>
            </p>
          </div>
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
            <p class="text-[9px] text-text-hint/40 mt-1">{{ chunk.tokenEstimate }} tokens · {{ chunk.sentenceCount }} sentences</p>
          </div>
        </div>
      </div>
    </div>

    <div class="px-4 py-2 border-t border-border-subtle text-[10px] text-text-hint/40 shrink-0">
      {{ documents.length }} document{{ documents.length !== 1 ? 's' : '' }}
      <span v-if="documents.length"> · {{ documents.reduce((s, d) => s + (d.charCount || 0), 0).toLocaleString() }} total chars</span>
    </div>
  </div>
</template>
