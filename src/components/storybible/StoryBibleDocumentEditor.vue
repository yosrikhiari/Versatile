<script setup>
import { ref, computed, watch } from 'vue'
import { upsertStoryDocument } from '../../services/db-story-documents'
import { useStoryDocuments } from '../../composables/useStoryDocuments'
import { useNotifications } from '../../composables/useNotifications'
import Skeleton from '../shared/Skeleton.vue'

const props = defineProps({
  projectId: {
    type: [String, Number],
    default: null
  }
})

const { showConfirm } = useNotifications()

const LARGE_CONTENT_THRESHOLD = 200000

const selectedDocType = ref('synopsis')
const documentContent = ref('')
const savedContents = ref({})
const fileInput = ref(null)
const contentReadonly = ref(false)

const isLargeContent = computed(() => documentContent.value.length > LARGE_CONTENT_THRESHOLD)
const isLoading = ref(false)

const hasUnsavedChanges = computed(
  () => documentContent.value !== (savedContents.value[selectedDocType.value] ?? '')
)

const documentTypes = [
  { key: 'synopsis', label: 'Synopsis' },
  { key: 'characters', label: 'Characters' },
  { key: 'world', label: 'World' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'rejected_patterns', label: 'Rejected' },
  { key: 'style_guide', label: 'Style' }
]

async function loadDocument() {
  if (!props.projectId) return
  isLoading.value = true
  try {
    const { getDocument } = useStoryDocuments()
    const doc = await getDocument(props.projectId, selectedDocType.value)
    documentContent.value = doc?.content || ''
    if (!(selectedDocType.value in savedContents.value)) {
      savedContents.value[selectedDocType.value] = documentContent.value
    }
  } finally {
    isLoading.value = false
  }
}

async function saveDocument() {
  if (!props.projectId) return
  await upsertStoryDocument(props.projectId, selectedDocType.value, documentContent.value)
  savedContents.value[selectedDocType.value] = documentContent.value
}

function downloadDocument() {
  const blob = new Blob([documentContent.value || ''], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedDocType.value}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function uploadDocument(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    documentContent.value = e.target?.result || ''
    contentReadonly.value = documentContent.value.length > LARGE_CONTENT_THRESHOLD
    await saveDocument()
  }
  reader.readAsText(file)
  event.target.value = ''
}

async function regenerateDocumentWithConfirm() {
  if (hasUnsavedChanges.value) {
    if (
      !(await showConfirm(
        'Overwrite Edits',
        'This will overwrite your edits. Continue?',
        'Overwrite',
        'danger'
      ))
    )
      return
  }
  if (!props.projectId) return
  const { regenerateDocument } = useStoryDocuments()
  await regenerateDocument(props.projectId, selectedDocType.value)
  const { getDocument } = useStoryDocuments()
  const doc = await getDocument(props.projectId, selectedDocType.value)
  documentContent.value = doc?.content || ''
  savedContents.value[selectedDocType.value] = documentContent.value
}

watch(selectedDocType, loadDocument, { immediate: true })
</script>

<template>
  <div>
    <div class="flex gap-1.5 flex-wrap mb-4">
      <button
        v-for="dt in documentTypes"
        :key="dt.key"
        :class="[
          'px-2.5 py-1 text-xs font-medium rounded-lg font-ui transition-colors',
          selectedDocType === dt.key
            ? 'bg-surface-hover text-accent'
            : 'bg-bg-secondary text-text-secondary hover:bg-surface-hover'
        ]"
        @click="selectedDocType = dt.key"
      >
        {{ dt.label }}
      </button>
    </div>

    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <button
        class="btn-primary px-3 py-1.5 text-xs rounded-lg disabled:opacity-40"
        :disabled="!hasUnsavedChanges"
        @click="saveDocument"
      >
        Save
      </button>
      <button
        class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-bg-secondary text-text-secondary hover:bg-surface-hover"
        @click="downloadDocument"
      >
        Download .md
      </button>
      <button
        class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-bg-secondary text-text-secondary hover:bg-surface-hover"
        @click="regenerateDocumentWithConfirm"
      >
        Regenerate
      </button>
      <button
        class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-bg-secondary text-text-secondary hover:bg-surface-hover"
        @click="fileInput.click()"
      >
        Upload .md
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".md,.markdown,.txt"
        class="hidden"
        @change="uploadDocument"
      />
      <span v-if="hasUnsavedChanges" class="text-xs text-warning ml-auto">Unsaved changes</span>
    </div>

    <div v-if="isLoading">
      <Skeleton variant="card" :count="3" label="Loading document…" />
    </div>
    <template v-else>
      <div
        v-if="isLargeContent"
        class="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-xs bg-bg-elevated text-warning border border-border-subtle"
      >
        <span>Large file — {{ documentContent.length.toLocaleString() }} characters.</span>
        <span v-if="contentReadonly" class="ml-1 text-warning/70"
          >Displayed as read-only to prevent slowdowns.</span
        >
        <button
          v-if="contentReadonly"
          class="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-bg-secondary hover:bg-surface-hover text-warning transition-colors"
          @click="contentReadonly = false"
        >
          Enable Editing
        </button>
      </div>

      <textarea
        v-model="documentContent"
        :readonly="contentReadonly"
        spellcheck="false"
        class="w-full p-3 bg-bg-tertiary rounded-lg text-xs text-text-primary font-mono leading-relaxed min-h-[300px] resize-y focus:outline-none focus:ring-1 focus:ring-accent/50"
        :class="{ 'opacity-70 cursor-default': contentReadonly }"
        placeholder="No content yet. Add some story elements first."
      ></textarea>
    </template>
  </div>
</template>
