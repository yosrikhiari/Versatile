<script setup>
import { ref, computed, watch } from 'vue'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVolumeStore } from '../../stores/volumeStore'
import {
  generateRandomCharacter,
  generateRandomPlotThread,
  generateRandomLocation,
  enhanceExistingCharacter,
  generateTraitSuggestions
} from '../../composables/useOllama'
import { useAsyncError } from '../../composables/useAsyncError'

import { useManuscriptContext } from '../../composables/useManuscriptContext'
import { useClickOutside } from '../../composables/useClickOutside'
import { upsertStoryDocument } from '../../services/db-story-documents'
import { useStoryDocuments } from '../../composables/useStoryDocuments'
import { useNotifications } from '../../composables/useNotifications'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import TagInput from '../shared/TagInput.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import GenerateCharacterModal from './GenerateCharacterModal.vue'
import CharacterChatSession from '../characterchat/CharacterChatSession.vue'
import Modal from '../shared/Modal.vue'
import { useArchiveStore } from '../../stores/archiveStore'
import { SIGNAL, ARCHIVE_TYPES } from '../../config/archive'

const { onAsyncError } = useAsyncError()
const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const volumeStore = useVolumeStore()
const { showConfirm, addToast } = useNotifications()
const { getSectionContext } = useManuscriptContext()

const activeTab = ref('characters')
const searchQuery = ref('')
const editingId = ref(null)
const editData = ref({
  name: '',
  role: '',
  goal: '',
  voice: '',
  notes: '',
  sampleDialogue: '',
  traits: []
})
const isEnhancing = ref(false)
const isGenerating = ref(false)
const isGeneratingPlotThread = ref(false)
const isGeneratingLocation = ref(false)

const showGenerateModal = ref(false)
const generateMode = ref('generate')
const characterToEnhance = ref(null)

const showChatModal = ref(false)
const chattingCharacterIds = ref([])

function handleDragStart(event, character) {
  const dragData = {
    type: 'character',
    id: character.id,
    name: character.name,
    portrait: character.portrait
  }
  event.dataTransfer.setData('application/json', JSON.stringify(dragData))
  event.dataTransfer.effectAllowed = 'copy'

  const dragImage = event.currentTarget.cloneNode(true)
  dragImage.style.position = 'absolute'
  dragImage.style.top = '-9999px'
  dragImage.style.opacity = '0.8'
  dragImage.style.borderRadius = '8px'
  document.body.appendChild(dragImage)
  event.dataTransfer.setDragImage(dragImage, 50, 20)
  setTimeout(() => document.body.removeChild(dragImage), 0)
}

function openChat(character) {
  chattingCharacterIds.value = [character.id]
  showChatModal.value = true
}

const roleEditingId = ref(null)
const roleEditValue = ref('')

const suggestingId = ref(null)
const traitSuggestions = ref([])
const isSuggestingTraits = ref(false)
const suggestPopoverRef = ref(null)

useClickOutside(suggestPopoverRef, () => {
  suggestingId.value = null
  traitSuggestions.value = []
})

async function handleSuggestTraits(type) {
  if (isSuggestingTraits.value) return
  isSuggestingTraits.value = true
  suggestingId.value = editingId.value
  traitSuggestions.value = []
  try {
    const context = await getSectionContext('current', type)
    const entityData = { ...editData.value }
    const existing = entityData.traits || []
    const suggestions = await generateTraitSuggestions(type, entityData, existing, context)
    traitSuggestions.value = suggestions
    if (!suggestions.length) {
      addToast('No trait suggestions available. Ensure Ollama is running.', 'warning')
    }
  } catch {
    addToast('Failed to generate trait suggestions.', 'error')
  } finally {
    isSuggestingTraits.value = false
  }
}

function addSuggestionTrait(trait) {
  if (!editData.value.traits) editData.value.traits = []
  if (!editData.value.traits.includes(trait)) {
    editData.value.traits.push(trait)
  }
}

function startRoleEdit(character) {
  roleEditingId.value = character.id
  roleEditValue.value = character.role || ''
}

async function saveRoleEdit(id) {
  if (roleEditValue.value.trim()) {
    await updateCharacter(id, { role: roleEditValue.value.trim() })
  }
  cancelRoleEdit()
}

function cancelRoleEdit() {
  roleEditingId.value = null
  roleEditValue.value = ''
}

const generateModalRef = ref(null)

const LARGE_CONTENT_THRESHOLD = 200000

const selectedDocType = ref('synopsis')
const documentContent = ref('')
const savedContents = ref({})
const fileInput = ref(null)
const contentReadonly = ref(false)

const isLargeContent = computed(() => documentContent.value.length > LARGE_CONTENT_THRESHOLD)

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
  if (!projectStore.currentProjectId) return
  const { getDocument } = useStoryDocuments()
  const doc = await getDocument(projectStore.currentProjectId, selectedDocType.value)
  documentContent.value = doc?.content || ''
  if (!(selectedDocType.value in savedContents.value)) {
    savedContents.value[selectedDocType.value] = documentContent.value
  }
}

async function saveDocument() {
  if (!projectStore.currentProjectId) return
  await upsertStoryDocument(
    projectStore.currentProjectId,
    selectedDocType.value,
    documentContent.value
  )
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
  if (!projectStore.currentProjectId) return
  const { regenerateDocument } = useStoryDocuments()
  await regenerateDocument(projectStore.currentProjectId, selectedDocType.value)
  const { getDocument } = useStoryDocuments()
  const doc = await getDocument(projectStore.currentProjectId, selectedDocType.value)
  documentContent.value = doc?.content || ''
  savedContents.value[selectedDocType.value] = documentContent.value
}

watch(selectedDocType, loadDocument, { immediate: true })

async function handleGenerateCharacter() {
  if (!projectStore.currentProjectId) {
    addToast('No project selected. Open a project first.', 'warning')
    return
  }
  if (isGenerating.value) return
  isGenerating.value = true

  try {
    const context = await getSectionContext('current', 'character')

    const result = await generateRandomCharacter(context, null)
    if (result) {
      await storyBibleStore.addCharacterData(projectStore.currentProjectId, result)
      addToast('Character generated successfully.', 'success')

      const archiveStore = useArchiveStore()
      archiveStore
        .saveInteraction(
          projectStore.currentProjectId,
          ARCHIVE_TYPES.ENTITY_GENERATION,
          result,
          ['character', 'ai_generated'],
          SIGNAL.ACCEPTED
        )
        .catch(() => {})
    } else {
    }
  } catch (e) {
    console.error('Generate failed:', e)
    onAsyncError(e)
    addToast(e.message || 'Failed to generate character', 'error')
  } finally {
    isGenerating.value = false
  }
}

async function handleGeneratePlotThread() {
  if (!projectStore.currentProjectId) {
    addToast('No project selected. Open a project first.', 'warning')
    return
  }
  if (isGeneratingPlotThread.value) return
  isGeneratingPlotThread.value = true

  try {
    const context = await getSectionContext('current', 'plotThread')
    const result = await generateRandomPlotThread(context)
    if (result) {
      await storyBibleStore.addPlotThreadData(projectStore.currentProjectId, result)
      addToast('Plot thread generated successfully.', 'success')
      const archiveStore = useArchiveStore()
      archiveStore
        .saveInteraction(
          projectStore.currentProjectId,
          ARCHIVE_TYPES.ENTITY_GENERATION,
          result,
          ['plotThread', 'ai_generated'],
          SIGNAL.ACCEPTED
        )
        .catch(() => {})
    } else {
    }
  } catch (e) {
    console.error('Generate failed:', e)
    onAsyncError(e)
    addToast(e.message || 'Failed to generate plot thread', 'error')
  } finally {
    isGeneratingPlotThread.value = false
  }
}

async function handleGenerateLocation() {
  if (!projectStore.currentProjectId) {
    addToast('No project selected. Open a project first.', 'warning')
    return
  }
  if (isGeneratingLocation.value) return
  isGeneratingLocation.value = true

  try {
    const context = await getSectionContext('current', 'location')
    const result = await generateRandomLocation(context)
    if (result) {
      await storyBibleStore.addLocationData(projectStore.currentProjectId, result)
      addToast('Location generated successfully.', 'success')
      const archiveStore = useArchiveStore()
      archiveStore
        .saveInteraction(
          projectStore.currentProjectId,
          ARCHIVE_TYPES.ENTITY_GENERATION,
          result,
          ['location', 'ai_generated'],
          SIGNAL.ACCEPTED
        )
        .catch(() => {})
    } else {
    }
  } catch (e) {
    console.error('Generate failed:', e)
    onAsyncError(e)
    addToast(e.message || 'Failed to generate location', 'error')
  } finally {
    isGeneratingLocation.value = false
  }
}

function handleEnhanceCharacter(character) {
  generateMode.value = 'enhance'
  characterToEnhance.value = { ...character }
  showGenerateModal.value = true
}

async function onModalGenerate() {
  if (!generateModalRef.value) return
  const partialData = generateModalRef.value.getCharacterData()
  generateModalRef.value.setLoading()

  try {
    const context = await getSectionContext('current', 'character')
    let result
    if (generateMode.value === 'enhance' && characterToEnhance.value) {
      result = await enhanceExistingCharacter(characterToEnhance.value, context)
    } else {
      result = await generateRandomCharacter(context, partialData)
    }
    if (result) {
      generateModalRef.value.setGenerated(result)
      const archiveStore = useArchiveStore()
      archiveStore
        .saveInteraction(
          projectStore.currentProjectId,
          ARCHIVE_TYPES.ENTITY_GENERATION,
          result,
          [generateMode.value === 'enhance' ? 'enhanced' : 'ai_generated'],
          SIGNAL.ACCEPTED
        )
        .catch(() => {})
    } else {
      generateModalRef.value.setError('AI returned empty response. Please try again.')
    }
  } catch (e) {
    console.error('Generate failed:', e)
    onAsyncError(e)
    generateModalRef.value.setError(`Failed to generate: ${e.message || e}`)
  }
}

async function onCreateCharacter(charData) {
  if (!projectStore.currentProjectId) return
  await storyBibleStore.addCharacterData(projectStore.currentProjectId, charData)
  showGenerateModal.value = false
}

async function onUpdateCharacter(charData) {
  if (!projectStore.currentProjectId || !characterToEnhance.value) return
  await storyBibleStore.updateCharacterData(
    characterToEnhance.value.id,
    charData,
    projectStore.currentProjectId
  )
  showGenerateModal.value = false
  characterToEnhance.value = null
}

async function onRejectGeneration(rejectedData) {
  if (!projectStore.currentProjectId) return
  const { logRejectedPattern } = useStoryDocuments()
  await logRejectedPattern(projectStore.currentProjectId, rejectedData)
}

async function loadProjectData(projectId) {
  if (!projectId) return
  try {
    await storyBibleStore.loadAll(projectId)
    await volumeStore.loadVolumes(projectId)
    const { regenerateAllDocuments } = useStoryDocuments()
    await regenerateAllDocuments(projectId)
  } catch (e) {
    console.error('Failed to load project data:', e)
    onAsyncError(e)
  }
}

watch(
  () => projectStore.currentProjectId,
  async (newId) => {
    if (newId) {
      await loadProjectData(newId)
    }
  },
  { immediate: true }
)

const filteredCharacters = computed(() => {
  if (!searchQuery.value) return storyBibleStore.characters
  const query = searchQuery.value.toLowerCase()
  return storyBibleStore.characters.filter(
    (c) =>
      c.name?.toLowerCase().includes(query) ||
      c.role?.toLowerCase().includes(query) ||
      c.traits?.some((t) => t.toLowerCase().includes(query))
  )
})

const filteredLocations = computed(() => {
  if (!searchQuery.value) return storyBibleStore.locations
  const query = searchQuery.value.toLowerCase()
  return storyBibleStore.locations.filter(
    (l) =>
      l.name?.toLowerCase().includes(query) ||
      l.description?.toLowerCase().includes(query) ||
      l.traits?.some((t) => t.toLowerCase().includes(query))
  )
})

const filteredPlotThreads = computed(() => {
  if (!searchQuery.value) return storyBibleStore.plotThreads
  const query = searchQuery.value.toLowerCase()
  return storyBibleStore.plotThreads.filter(
    (t) =>
      t.title?.toLowerCase().includes(query) ||
      t.status?.toLowerCase().includes(query) ||
      t.traits?.some((tr) => tr.toLowerCase().includes(query))
  )
})

async function addCharacter() {
  if (!projectStore.currentProjectId) {
    addToast('No project selected. Open a project first.', 'warning')
    return
  }
  try {
    await storyBibleStore.addCharacterData(projectStore.currentProjectId, {
      name: 'New Character',
      role: '',
      goal: '',
      voice: '',
      notes: '',
      sampleDialogue: '',
      traits: []
    })
  } catch (e) {
    console.error('Failed to add character:', e)
    onAsyncError(e)
    addToast('Failed to add character', 'error')
  }
}

async function updateCharacter(id, data) {
  await storyBibleStore.updateCharacterData(id, data, projectStore.currentProjectId)
}

async function deleteCharacter(id) {
  if (await showConfirm('Delete Character', 'Delete this character?', 'Delete', 'danger')) {
    await storyBibleStore.deleteCharacterData(id, projectStore.currentProjectId)
  }
}

async function addLocation() {
  if (!projectStore.currentProjectId) return
  await storyBibleStore.addLocationData(projectStore.currentProjectId, {
    name: 'New Location',
    description: '',
    notes: '',
    traits: []
  })
}

async function updateLocation(id, data) {
  await storyBibleStore.updateLocationData(id, data, projectStore.currentProjectId)
}

async function deleteLocation(id) {
  if (await showConfirm('Delete Location', 'Delete this location?', 'Delete', 'danger')) {
    await storyBibleStore.deleteLocationData(id, projectStore.currentProjectId)
  }
}

async function addPlotThread() {
  if (!projectStore.currentProjectId) return
  await storyBibleStore.addPlotThreadData(projectStore.currentProjectId, {
    title: 'New Plot Thread',
    status: 'open',
    notes: '',
    traits: []
  })
}

async function updatePlotThread(id, data) {
  await storyBibleStore.updatePlotThreadData(id, data, projectStore.currentProjectId)
}

async function deletePlotThread(id) {
  if (await showConfirm('Delete Plot Thread', 'Delete this thread?', 'Delete', 'danger')) {
    await storyBibleStore.deletePlotThreadData(id, projectStore.currentProjectId)
  }
}

function startEdit(entity, _type) {
  editingId.value = entity.id
  editData.value = { ...entity }
}

function cancelEdit() {
  editingId.value = null
  suggestingId.value = null
  traitSuggestions.value = []
  editData.value = {
    name: '',
    role: '',
    goal: '',
    voice: '',
    notes: '',
    sampleDialogue: '',
    traits: []
  }
}

async function saveEdit(id, type) {
  if (type === 'character') {
    await updateCharacter(id, editData.value)
  } else if (type === 'location') {
    await updateLocation(id, editData.value)
  } else if (type === 'plotThread') {
    await updatePlotThread(id, editData.value)
  }
  cancelEdit()
}

async function refresh() {
  if (projectStore.currentProjectId) {
    await storyBibleStore.loadAll(projectStore.currentProjectId)
  }
}

function handleGenerateModalClose() {
  showGenerateModal.value = false
  characterToEnhance.value = null
}

defineExpose({ refresh })
</script>

<template>
  <ErrorBoundary
    fallback-title="Story Bible Error"
    fallback-description="Failed to render the Story Bible panel. Try refreshing the page."
  >
    <div class="h-full flex flex-col overflow-hidden">
      <div class="px-4 pt-4 pb-3 border-b border-border-subtle">
        <div class="flex items-center justify-between mb-3">
          <span class="font-ui text-accent tracking-wide">{{
            projectStore.terminology.bible
          }}</span>
        </div>
      </div>

      <!-- Loading state: shown while story bible data is being fetched -->
      <div v-if="storyBibleStore.isLoading" class="flex-1 flex items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <BaseIcon name="loader-2" :size="24" class="animate-spin text-accent" />
          <span class="text-xs text-text-hint font-ui">Loading story bible…</span>
        </div>
      </div>

      <template v-else>
        <div class="flex border-b border-border-subtle px-4">
          <button
            :class="[
              'flex-1 py-2 text-xs font-medium transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded',
              activeTab === 'characters'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            role="tab"
            @click="activeTab = 'characters'"
          >
            {{ projectStore.terminology.characters }}
            <span class="text-2xs opacity-60">{{ filteredCharacters.length }}</span>
          </button>
          <button
            :class="[
              'flex-1 py-2 text-xs font-medium transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded',
              activeTab === 'plotThreads'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            role="tab"
            @click="activeTab = 'plotThreads'"
          >
            {{ projectStore.terminology.plotThreads }}
            <span class="text-2xs opacity-60">{{ filteredPlotThreads.length }}</span>
          </button>
          <button
            :class="[
              'flex-1 py-2 text-xs font-medium transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded',
              activeTab === 'locations'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            role="tab"
            @click="activeTab = 'locations'"
          >
            {{ projectStore.terminology.locations }}
            <span class="text-2xs opacity-60">{{ filteredLocations.length }}</span>
          </button>
          <button
            :class="[
              'flex-1 py-2 text-xs font-medium transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded',
              activeTab === 'documents'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            role="tab"
            @click="activeTab = 'documents'"
          >
            Documents
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-4 scrollbar-thin">
          <div v-if="activeTab === 'characters'" class="space-y-3">
            <div class="flex items-center gap-2 mb-2">
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors font-ui disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isGenerating"
                @click="handleGenerateCharacter"
              >
                <svg
                  v-if="isGenerating"
                  class="animate-spin h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                    class="opacity-20"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linecap="round"
                  />
                </svg>
                <BaseIcon v-else name="sparkles" :size="12" />
                {{ isGenerating ? 'Generating...' : 'Generate' }}
              </button>
            </div>
            <div
              v-for="character in filteredCharacters"
              :key="character.id"
              class="bg-bg-tertiary border border-border-subtle rounded-lg p-3"
              draggable="true"
              @dragstart="handleDragStart($event, character)"
            >
              <CharacterPortrait
                v-if="editingId === character.id"
                :character="editData"
                :project-id="projectStore.currentProjectId"
                class="mb-3"
                @updated="refresh"
              />
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <img
                    v-if="character.portrait && editingId !== character.id"
                    :src="character.portrait"
                    :alt="character.name"
                    class="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                  <BaseIcon v-else name="user" :size="18" class="text-text-hint" />
                  <input
                    v-if="editingId === character.id"
                    v-model="editData.name"
                    class="bg-bg-secondary px-1 py-0.5 text-text-primary rounded"
                    @keydown.enter="saveEdit(character.id, 'character')"
                    @keydown.escape="cancelEdit"
                  />
                  <span v-else class="font-medium text-text-primary">{{ character.name }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span v-if="roleEditingId === character.id" class="inline-flex items-center">
                    <input
                      v-model="roleEditValue"
                      class="w-28 text-xs px-2 py-0.5 bg-bg-primary text-text-primary border border-border-subtle rounded outline-none focus:ring-1 focus:ring-accent/50"
                      placeholder="Role"
                      autofocus
                      @keydown.enter="saveRoleEdit(character.id)"
                      @keydown.escape="cancelRoleEdit"
                      @blur="saveRoleEdit(character.id)"
                      @click.stop
                    />
                  </span>
                  <span
                    v-else-if="character.role"
                    class="text-xs px-2 py-0.5 bg-bg-secondary text-text-secondary rounded cursor-pointer hover:bg-accent/10 hover:text-accent transition-colors"
                    :title="'Click to edit role'"
                    @click="startRoleEdit(character)"
                  >
                    {{ character.role }}
                  </span>
                  <button
                    v-if="editingId !== character.id && !isEnhancing"
                    class="p-1 hover:bg-accent/10 rounded"
                    title="Enhance with AI"
                    @click="handleEnhanceCharacter(character)"
                  >
                    <BaseIcon name="sparkles" :size="14" class="text-text-hint hover:text-accent" />
                  </button>
                  <button
                    v-if="editingId !== character.id"
                    class="p-1 hover:bg-accent/10 rounded"
                    title="Chat with character"
                    @click="openChat(character)"
                  >
                    <BaseIcon
                      name="message-square"
                      :size="14"
                      class="text-text-hint hover:text-accent"
                    />
                  </button>
                  <button
                    v-if="editingId !== character.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Edit"
                    @click="startEdit(character, 'character')"
                  >
                    <BaseIcon name="edit-2" :size="14" class="text-text-hint" />
                  </button>
                  <button
                    v-if="editingId === character.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Save"
                    @click="saveEdit(character.id, 'character')"
                  >
                    <BaseIcon name="check" :size="14" class="text-green-400" />
                  </button>
                  <button
                    v-if="editingId === character.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Cancel"
                    @click="cancelEdit"
                  >
                    <BaseIcon name="x" :size="14" class="text-text-hint" />
                  </button>
                  <button
                    v-if="editingId !== character.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Delete"
                    @click="deleteCharacter(character.id)"
                  >
                    <BaseIcon name="trash-2" :size="14" class="text-red-400" />
                  </button>
                </div>
              </div>
              <div
                v-if="character.notes && editingId !== character.id"
                class="mt-2 text-sm text-text-secondary"
              >
                {{ character.notes }}
              </div>
              <div
                v-if="character.sampleDialogue && editingId !== character.id"
                class="mt-2 text-sm italic text-text-hint border-l-2 border-accent/30 pl-3"
              >
                &ldquo;{{ character.sampleDialogue }}&rdquo;
              </div>
              <div
                v-if="character.traits?.length && editingId !== character.id"
                class="mt-2 flex flex-wrap gap-1"
              >
                <span
                  v-for="trait in character.traits"
                  :key="trait"
                  class="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full"
                  >{{ trait }}</span
                >
              </div>
              <CharacterPortrait
                v-if="editingId !== character.id && character.portrait"
                :character="character"
                :project-id="projectStore.currentProjectId"
                class="mt-2"
                @updated="refresh"
              />
              <div v-if="editingId === character.id" class="mt-2 space-y-2">
                <input
                  v-model="editData.role"
                  placeholder="Role (e.g., Protagonist)"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint"
                />
                <input
                  v-model="editData.goal"
                  placeholder="Goal — what do they want?"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint"
                />
                <input
                  v-model="editData.voice"
                  placeholder="Voice — how do they speak?"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint"
                />
                <textarea
                  v-model="editData.notes"
                  placeholder="Notes"
                  rows="2"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
                />
                <textarea
                  v-model="editData.sampleDialogue"
                  placeholder='Sample dialogue — "A line this character would actually say."'
                  rows="1"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
                />
                <div class="flex items-center gap-1">
                  <TagInput v-model="editData.traits" placeholder="Add trait..." />
                  <button
                    class="p-1.5 rounded hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="isSuggestingTraits"
                    title="Suggest traits"
                    @click="handleSuggestTraits('character')"
                  >
                    <svg
                      v-if="isSuggestingTraits"
                      class="animate-spin h-4 w-4 text-accent"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                        class="opacity-20"
                      />
                      <path
                        d="M4 12a8 8 0 018-8"
                        stroke="currentColor"
                        stroke-width="4"
                        stroke-linecap="round"
                      />
                    </svg>
                    <BaseIcon v-else name="sparkles" :size="16" class="text-accent" />
                  </button>
                </div>
                <div
                  v-if="suggestingId === editingId && traitSuggestions.length"
                  ref="suggestPopoverRef"
                  class="flex flex-wrap gap-1.5 p-2 bg-bg-secondary border border-border-subtle rounded-lg mt-1"
                >
                  <button
                    v-for="t in traitSuggestions"
                    :key="t"
                    class="text-xs px-2 py-1 bg-accent/10 text-accent rounded-full hover:bg-accent/20 transition-colors"
                    @click="addSuggestionTrait(t)"
                  >
                    + {{ t }}
                  </button>
                </div>
              </div>
            </div>
            <button
              class="w-full py-2 border-2 border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
              @click="addCharacter"
            >
              + Add {{ projectStore.terminology.characters.toLowerCase() }}
            </button>
          </div>

          <div v-if="activeTab === 'plotThreads'" class="space-y-3">
            <div class="flex items-center gap-2 mb-2">
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors font-ui disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isGeneratingPlotThread"
                @click="handleGeneratePlotThread"
              >
                <svg
                  v-if="isGeneratingPlotThread"
                  class="animate-spin h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                    class="opacity-20"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linecap="round"
                  />
                </svg>
                <BaseIcon v-else name="sparkles" :size="12" />
                {{ isGeneratingPlotThread ? 'Generating...' : 'Generate' }}
              </button>
            </div>
            <div
              v-for="thread in filteredPlotThreads"
              :key="thread.id"
              class="bg-bg-tertiary border border-border-subtle rounded-lg p-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <BaseIcon name="zap" :size="18" class="text-text-hint" />
                  <input
                    v-if="editingId === thread.id"
                    v-model="editData.title"
                    class="bg-bg-secondary px-1 py-0.5 text-text-primary rounded"
                    @keydown.enter="saveEdit(thread.id, 'plotThread')"
                    @keydown.escape="cancelEdit"
                  />
                  <span v-else class="font-medium text-text-primary">{{ thread.title }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span
                    :class="[
                      'text-xs px-2 py-0.5 rounded',
                      thread.status === 'open'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    ]"
                  >
                    {{ thread.status }}
                  </span>
                  <button
                    v-if="editingId !== thread.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Edit"
                    @click="startEdit(thread, 'plotThread')"
                  >
                    <BaseIcon name="edit-2" :size="14" class="text-text-hint" />
                  </button>
                  <button
                    v-if="editingId === thread.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Save"
                    @click="saveEdit(thread.id, 'plotThread')"
                  >
                    <BaseIcon name="check" :size="14" class="text-green-400" />
                  </button>
                  <button
                    v-if="editingId === thread.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Cancel"
                    @click="cancelEdit"
                  >
                    <BaseIcon name="x" :size="14" class="text-text-hint" />
                  </button>
                  <button
                    v-if="editingId !== thread.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Delete"
                    @click="deletePlotThread(thread.id)"
                  >
                    <BaseIcon name="trash-2" :size="14" class="text-red-400" />
                  </button>
                </div>
              </div>
              <div
                v-if="thread.notes && editingId !== thread.id"
                class="mt-2 text-sm text-text-secondary"
              >
                {{ thread.notes }}
              </div>
              <div
                v-if="thread.traits?.length && editingId !== thread.id"
                class="mt-2 flex flex-wrap gap-1"
              >
                <span
                  v-for="trait in thread.traits"
                  :key="trait"
                  class="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full"
                  >{{ trait }}</span
                >
              </div>
              <div v-if="editingId === thread.id" class="mt-2 space-y-2">
                <select
                  v-model="editData.status"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <textarea
                  v-model="editData.notes"
                  placeholder="Notes"
                  rows="2"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
                />
                <div class="flex items-center gap-1">
                  <TagInput v-model="editData.traits" placeholder="Add trait..." />
                  <button
                    class="p-1.5 rounded hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="isSuggestingTraits"
                    title="Suggest traits"
                    @click="handleSuggestTraits('plotThread')"
                  >
                    <svg
                      v-if="isSuggestingTraits"
                      class="animate-spin h-4 w-4 text-accent"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                        class="opacity-20"
                      />
                      <path
                        d="M4 12a8 8 0 018-8"
                        stroke="currentColor"
                        stroke-width="4"
                        stroke-linecap="round"
                      />
                    </svg>
                    <BaseIcon v-else name="sparkles" :size="16" class="text-accent" />
                  </button>
                </div>
                <div
                  v-if="suggestingId === editingId && traitSuggestions.length"
                  ref="suggestPopoverRef"
                  class="flex flex-wrap gap-1.5 p-2 bg-bg-secondary border border-border-subtle rounded-lg mt-1"
                >
                  <button
                    v-for="t in traitSuggestions"
                    :key="t"
                    class="text-xs px-2 py-1 bg-accent/10 text-accent rounded-full hover:bg-accent/20 transition-colors"
                    @click="addSuggestionTrait(t)"
                  >
                    + {{ t }}
                  </button>
                </div>
              </div>
            </div>
            <button
              class="w-full py-2 border-2 border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
              @click="addPlotThread"
            >
              + Add {{ projectStore.terminology.plotThreads.toLowerCase() }}
            </button>
          </div>

          <div v-if="activeTab === 'locations'" class="space-y-3">
            <div class="flex items-center gap-2 mb-2">
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors font-ui disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isGeneratingLocation"
                @click="handleGenerateLocation"
              >
                <svg
                  v-if="isGeneratingLocation"
                  class="animate-spin h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                    class="opacity-20"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    stroke-width="4"
                    stroke-linecap="round"
                  />
                </svg>
                <BaseIcon v-else name="sparkles" :size="12" />
                {{ isGeneratingLocation ? 'Generating...' : 'Generate' }}
              </button>
            </div>
            <div
              v-for="location in filteredLocations"
              :key="location.id"
              class="bg-bg-tertiary border border-border-subtle rounded-lg p-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <BaseIcon name="map-pin" :size="18" class="text-text-hint" />
                  <input
                    v-if="editingId === location.id"
                    v-model="editData.name"
                    class="bg-bg-secondary px-1 py-0.5 text-text-primary rounded"
                    @keydown.enter="saveEdit(location.id, 'location')"
                    @keydown.escape="cancelEdit"
                  />
                  <span v-else class="font-medium text-text-primary">{{ location.name }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    v-if="editingId !== location.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Edit"
                    @click="startEdit(location, 'location')"
                  >
                    <BaseIcon name="edit-2" :size="14" class="text-text-hint" />
                  </button>
                  <button
                    v-if="editingId === location.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Save"
                    @click="saveEdit(location.id, 'location')"
                  >
                    <BaseIcon name="check" :size="14" class="text-green-400" />
                  </button>
                  <button
                    v-if="editingId === location.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Cancel"
                    @click="cancelEdit"
                  >
                    <BaseIcon name="x" :size="14" class="text-text-hint" />
                  </button>
                  <button
                    v-if="editingId !== location.id"
                    class="p-1 hover:bg-surface-hover rounded"
                    title="Delete"
                    @click="deleteLocation(location.id)"
                  >
                    <BaseIcon name="trash-2" :size="14" class="text-red-400" />
                  </button>
                </div>
              </div>
              <div
                v-if="location.description && editingId !== location.id"
                class="mt-2 text-sm text-text-secondary"
              >
                {{ location.description }}
              </div>
              <div
                v-if="location.traits?.length && editingId !== location.id"
                class="mt-2 flex flex-wrap gap-1"
              >
                <span
                  v-for="trait in location.traits"
                  :key="trait"
                  class="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full"
                  >{{ trait }}</span
                >
              </div>
              <div v-if="editingId === location.id" class="mt-2 space-y-2">
                <textarea
                  v-model="editData.notes"
                  placeholder="Notes"
                  rows="2"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
                />
                <textarea
                  v-model="editData.notes"
                  placeholder="Notes"
                  rows="2"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
                />
                <textarea
                  v-model="editData.sampleDialogue"
                  placeholder='Sample dialogue — "A line this character would actually say."'
                  rows="1"
                  class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
                />
                <div class="flex items-center gap-1">
                  <TagInput v-model="editData.traits" placeholder="Add trait..." />
                  <button
                    class="p-1.5 rounded hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="isSuggestingTraits"
                    title="Suggest traits"
                    @click="handleSuggestTraits('location')"
                  >
                    <svg
                      v-if="isSuggestingTraits"
                      class="animate-spin h-4 w-4 text-accent"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                        class="opacity-20"
                      />
                      <path
                        d="M4 12a8 8 0 018-8"
                        stroke="currentColor"
                        stroke-width="4"
                        stroke-linecap="round"
                      />
                    </svg>
                    <BaseIcon v-else name="sparkles" :size="16" class="text-accent" />
                  </button>
                </div>
                <div
                  v-if="suggestingId === editingId && traitSuggestions.length"
                  ref="suggestPopoverRef"
                  class="flex flex-wrap gap-1.5 p-2 bg-bg-secondary border border-border-subtle rounded-lg mt-1"
                >
                  <button
                    v-for="t in traitSuggestions"
                    :key="t"
                    class="text-xs px-2 py-1 bg-accent/10 text-accent rounded-full hover:bg-accent/20 transition-colors"
                    @click="addSuggestionTrait(t)"
                  >
                    + {{ t }}
                  </button>
                </div>
              </div>
            </div>
            <button
              class="w-full py-2 border-2 border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
              @click="addLocation"
            >
              + Add {{ projectStore.terminology.locations.toLowerCase() }}
            </button>
          </div>

          <div v-if="activeTab === 'documents'">
            <div class="flex gap-1.5 flex-wrap mb-4">
              <button
                v-for="dt in documentTypes"
                :key="dt.key"
                :class="[
                  'px-2.5 py-1 text-11px font-medium rounded-lg font-ui transition-colors',
                  selectedDocType === dt.key
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-bg-secondary text-text-secondary hover:bg-surface-hover'
                ]"
                @click="selectedDocType = dt.key"
              >
                {{ dt.label }}
              </button>
            </div>

            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <button
                class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-accent text-accent-foreground disabled:opacity-40"
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
              <span v-if="hasUnsavedChanges" class="text-xs text-amber-400 ml-auto"
                >Unsaved changes</span
              >
            </div>

            <div
              v-if="isLargeContent"
              class="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              <span>Large file — {{ documentContent.length.toLocaleString() }} characters.</span>
              <span v-if="contentReadonly" class="ml-1 text-amber-400/70"
                >Displayed as read-only to prevent slowdowns.</span
              >
              <button
                v-if="contentReadonly"
                class="ml-auto px-2 py-0.5 rounded text-11px font-medium bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
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
          </div>
        </div>

        <!-- prettier-ignore -->
        <GenerateCharacterModal
          ref="generateModalRef"
          :show="showGenerateModal"
          :mode="generateMode"
          :existing-character="characterToEnhance"
          @close="handleGenerateModalClose()"
          @generate="onModalGenerate"
          @reject="onRejectGeneration"
          @create="onCreateCharacter"
          @update="onUpdateCharacter"
        />
      </template>
    </div>

    <Modal
      :show="showChatModal"
      max-width="max-w-2xl"
      panel-class="p-0 overflow-hidden w-full"
      @close="showChatModal = false"
    >
      <CharacterChatSession
        :character-ids="chattingCharacterIds"
        :project-id="projectStore.currentProjectId"
        @close="showChatModal = false"
      />
    </Modal>
  </ErrorBoundary>
</template>
