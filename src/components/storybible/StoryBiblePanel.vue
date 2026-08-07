<script setup>
import { ref, computed, watch, inject, nextTick } from 'vue'
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
import { useStoryDocuments } from '../../composables/useStoryDocuments'
import { useNotifications } from '../../composables/useNotifications'
import ErrorBoundary from '../shared/ErrorBoundary.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import EmptyState from '../shared/EmptyState.vue'
import Skeleton from '../shared/Skeleton.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import StoryBibleDocumentEditor from './StoryBibleDocumentEditor.vue'
import EntityActionButtons from './EntityActionButtons.vue'
import TraitSuggestionsPopover from './TraitSuggestionsPopover.vue'
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
const navigateTarget = inject('consistencyNavigateTarget', ref(null))

watch(navigateTarget, (target) => {
  if (!target) return
  if (target.startsWith('char-')) {
    activeTab.value = 'characters'
  } else if (target.startsWith('loc-')) {
    activeTab.value = 'locations'
  } else if (target.startsWith('thread-')) {
    activeTab.value = 'plotThreads'
  }
  nextTick(() => {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
})
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

function handleCloseSuggestions() {
  suggestingId.value = null
  traitSuggestions.value = []
}

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

async function switchTab(tab) {
  if (editingId.value) {
    const confirmed = await showConfirm(
      'Unsaved Changes',
      'Switch tabs? Your edits will be lost.',
      'Switch',
      'warning'
    )
    if (!confirmed) return
  }
  cancelEdit()
  activeTab.value = tab
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
          <span class="font-ui font-medium text-text-primary tracking-wide">{{
            projectStore.terminology.bible
          }}</span>
        </div>
      </div>

      <!-- Loading state: shown while story bible data is being fetched -->
      <div v-if="storyBibleStore.isLoading" class="flex-1 px-4 py-4 overflow-hidden">
        <Skeleton variant="list" :count="6" size="2rem" label="Loading story bible…" />
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
            @click="switchTab('characters')"
          >
            {{ projectStore.terminology.characters }}
            <span class="text-xs opacity-60">{{ filteredCharacters.length }}</span>
          </button>
          <button
            :class="[
              'flex-1 py-2 text-xs font-medium transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded',
              activeTab === 'plotThreads'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            role="tab"
            @click="switchTab('plotThreads')"
          >
            {{ projectStore.terminology.plotThreads }}
            <span class="text-xs opacity-60">{{ filteredPlotThreads.length }}</span>
          </button>
          <button
            :class="[
              'flex-1 py-2 text-xs font-medium transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded',
              activeTab === 'locations'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            role="tab"
            @click="switchTab('locations')"
          >
            {{ projectStore.terminology.locations }}
            <span class="text-xs opacity-60">{{ filteredLocations.length }}</span>
          </button>
          <button
            :class="[
              'flex-1 py-2 text-xs font-medium transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded',
              activeTab === 'documents'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            role="tab"
            @click="switchTab('documents')"
          >
            Documents
          </button>
        </div>

        <div
          v-if="storyBibleStore.loadError"
          class="mx-4 mb-2 px-3 py-2 rounded text-xs text-danger bg-danger/10 border border-danger/30"
          role="alert"
        >
          <p>{{ storyBibleStore.loadError }}</p>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-4 scrollbar-thin">
          <div v-if="activeTab === 'characters'" class="space-y-3">
            <div class="flex items-center gap-2 mb-2">
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors font-ui disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isGenerating"
                @click="handleGenerateCharacter"
              >
                <BaseIcon v-if="isGenerating" name="loader-2" :size="12" class="animate-spin" />
                <BaseIcon v-else name="sparkles" :size="12" />
                {{ isGenerating ? 'Generating...' : 'Generate' }}
              </button>
            </div>
            <div
              v-for="character in filteredCharacters"
              :id="'char-' + character.id"
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
                  <!--
                    An <img> is implicitly draggable, so grabbing the portrait
                    started the browser's own image drag *alongside* the card's
                    drag — two things following the cursor from one gesture.
                    The card owns the drag; the portrait must not compete.
                  -->
                  <img
                    v-if="character.portrait && editingId !== character.id"
                    :src="character.portrait"
                    :alt="character.name"
                    draggable="false"
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
                  <EntityActionButtons
                    :entity-id="character.id"
                    :editing-id="editingId"
                    @edit="startEdit(character, 'character')"
                    @save="saveEdit(character.id, 'character')"
                    @cancel="cancelEdit"
                    @delete="deleteCharacter(character.id)"
                  >
                    <template #before>
                      <button
                        v-if="editingId !== character.id && !isEnhancing"
                        class="p-1 hover:bg-accent/10 rounded"
                        title="Enhance with AI"
                        @click="handleEnhanceCharacter(character)"
                      >
                        <BaseIcon
                          name="sparkles"
                          :size="14"
                          class="text-text-hint hover:text-accent"
                        />
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
                    </template>
                  </EntityActionButtons>
                </div>
              </div>
              <div
                v-if="character.description && editingId !== character.id"
                class="mt-2 text-sm text-text-secondary"
              >
                {{ character.description }}
              </div>
              <!--
                `notes` carries arc scheduling from the cast expander ("Enters
                chapter 58, provides critical intel..."), not character prose.
                Rendering it in the body slot pushed the real description out of
                the collapsed card, so a described character read as blank.
                Locations already show `description` here; this matches them.

                It still falls back to the body slot when there is no
                description: `description` only became a required field for
                newly generated characters, so anything generated before that
                has notes and nothing else, and would otherwise render as an
                empty card.
              -->
              <div
                v-if="character.notes && editingId !== character.id"
                :class="
                  character.description
                    ? 'mt-1 text-xs text-text-hint'
                    : 'mt-2 text-sm text-text-secondary'
                "
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
                  class="text-xs px-2 py-0.5 bg-bg-secondary text-accent rounded"
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
                <TraitSuggestionsPopover
                  v-model="editData.traits"
                  :is-suggesting="isSuggestingTraits"
                  :suggestions="traitSuggestions"
                  :show-suggestions="suggestingId === editingId"
                  @suggest="handleSuggestTraits('character')"
                  @add-suggestion="addSuggestionTrait"
                  @close="handleCloseSuggestions"
                />
              </div>
            </div>
            <EmptyState
              v-if="filteredCharacters.length === 0"
              icon="users"
              title="No characters yet"
              description="Create your first character to bring your story to life."
            />
            <button
              class="w-full py-2 border border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
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
                <BaseIcon
                  v-if="isGeneratingPlotThread"
                  name="loader-2"
                  :size="12"
                  class="animate-spin"
                />
                <BaseIcon v-else name="sparkles" :size="12" />
                {{ isGeneratingPlotThread ? 'Generating...' : 'Generate' }}
              </button>
            </div>
            <div
              v-for="thread in filteredPlotThreads"
              :id="'thread-' + thread.id"
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
                    :class="['text-xs px-2 py-0.5 rounded bg-bg-secondary', 'text-text-hint']"
                    :style="{
                      color: `var(--vers-status-${thread.status})`
                    }"
                  >
                    {{ thread.status }}
                  </span>
                  <EntityActionButtons
                    :entity-id="thread.id"
                    :editing-id="editingId"
                    @edit="startEdit(thread, 'plotThread')"
                    @save="saveEdit(thread.id, 'plotThread')"
                    @cancel="cancelEdit"
                    @delete="deletePlotThread(thread.id)"
                  />
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
                  class="text-xs px-2 py-0.5 bg-bg-secondary text-accent rounded"
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
                <TraitSuggestionsPopover
                  v-model="editData.traits"
                  :is-suggesting="isSuggestingTraits"
                  :suggestions="traitSuggestions"
                  :show-suggestions="suggestingId === editingId"
                  @suggest="handleSuggestTraits('plotThread')"
                  @add-suggestion="addSuggestionTrait"
                  @close="handleCloseSuggestions"
                />
              </div>
            </div>
            <EmptyState
              v-if="filteredPlotThreads.length === 0"
              icon="git-branch"
              title="No plot threads yet"
              description="Map out your story's twists and turns."
            />
            <button
              class="w-full py-2 border border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
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
                <BaseIcon
                  v-if="isGeneratingLocation"
                  name="loader-2"
                  :size="12"
                  class="animate-spin"
                />
                <BaseIcon v-else name="sparkles" :size="12" />
                {{ isGeneratingLocation ? 'Generating...' : 'Generate' }}
              </button>
            </div>
            <div
              v-for="location in filteredLocations"
              :id="'loc-' + location.id"
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
                <EntityActionButtons
                  :entity-id="location.id"
                  :editing-id="editingId"
                  @edit="startEdit(location, 'location')"
                  @save="saveEdit(location.id, 'location')"
                  @cancel="cancelEdit"
                  @delete="deleteLocation(location.id)"
                />
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
                  class="text-xs px-2 py-0.5 bg-bg-secondary text-accent rounded"
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
                <TraitSuggestionsPopover
                  v-model="editData.traits"
                  :is-suggesting="isSuggestingTraits"
                  :suggestions="traitSuggestions"
                  :show-suggestions="suggestingId === editingId"
                  @suggest="handleSuggestTraits('location')"
                  @add-suggestion="addSuggestionTrait"
                  @close="handleCloseSuggestions"
                />
              </div>
            </div>
            <EmptyState
              v-if="filteredLocations.length === 0"
              icon="map-pin"
              title="No locations yet"
              description="Build the world your story inhabits."
            />
            <button
              class="w-full py-2 border border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
              @click="addLocation"
            >
              + Add {{ projectStore.terminology.locations.toLowerCase() }}
            </button>
          </div>

          <StoryBibleDocumentEditor
            v-if="activeTab === 'documents'"
            :project-id="projectStore.currentProjectId"
          />
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
