<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVolumeStore } from '../../stores/volumeStore'
import { generateRandomCharacter, enhanceExistingCharacter } from '../../composables/useOllama'
import { useManuscriptContext } from '../../composables/useManuscriptContext'
import { DOC_TYPES } from '../../services/db-story-documents'
import { useStoryDocuments } from '../../composables/useStoryDocuments'
import BaseIcon from '../shared/BaseIcon.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import GenerateCharacterModal from './GenerateCharacterModal.vue'

const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const volumeStore = useVolumeStore()
const { getSectionContext } = useManuscriptContext()

const characterPortraitRef = ref(null)

const activeTab = ref('characters')
const searchQuery = ref('')
const editingId = ref(null)
const editData = ref({ name: '', role: '', goal: '', voice: '', notes: '', sampleDialogue: '' })
const isEnhancing = ref(false)

const showGenerateModal = ref(false)
const generateMode = ref('generate')
const characterToEnhance = ref(null)

const generateModalRef = ref(null)

const selectedDocType = ref('synopsis')
const documentContent = ref('')
const docReloadKey = ref(0)

const documentTypes = [
  { key: 'synopsis', label: 'Synopsis' },
  { key: 'characters', label: 'Characters' },
  { key: 'world', label: 'World' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'rejected_patterns', label: 'Rejected' }
]

async function loadDocument() {
  if (!projectStore.currentProjectId) return
  const { getDocument } = useStoryDocuments()
  const doc = await getDocument(projectStore.currentProjectId, selectedDocType.value)
  documentContent.value = doc?.content || ''
}

watch(selectedDocType, loadDocument, { immediate: true })
watch(docReloadKey, loadDocument)

watch(() => storyBibleStore.characters.length, () => {
  if (activeTab.value === 'documents') docReloadKey.value++
})
watch(() => storyBibleStore.locations.length, () => {
  if (activeTab.value === 'documents') docReloadKey.value++
})
watch(() => storyBibleStore.plotThreads.length, () => {
  if (activeTab.value === 'documents') docReloadKey.value++
})

function handleGenerateCharacter() {
  generateMode.value = 'generate'
  characterToEnhance.value = null
  showGenerateModal.value = true
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
    } else {
      generateModalRef.value.setError('AI returned empty response. Please try again.')
    }
  } catch (e) {
    console.error('Generate failed:', e)
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
  await storyBibleStore.updateCharacterData(characterToEnhance.value.id, charData, projectStore.currentProjectId)
  showGenerateModal.value = false
  characterToEnhance.value = null
}

async function onRejectGeneration(rejectedData) {
  if (!projectStore.currentProjectId) return
  const { logRejectedPattern } = useStoryDocuments()
  await logRejectedPattern(projectStore.currentProjectId, rejectedData)
}

onMounted(async () => {
  if (projectStore.currentProjectId) {
    await storyBibleStore.loadAll(projectStore.currentProjectId)
    await volumeStore.loadVolumes(projectStore.currentProjectId)
    const { regenerateAllDocuments } = useStoryDocuments()
    await regenerateAllDocuments(projectStore.currentProjectId)
  }
})

watch(() => storyBibleStore.characters.length, async () => {
  if (!projectStore.currentProjectId) return
  const { regenerateDocument } = useStoryDocuments()
  await regenerateDocument(projectStore.currentProjectId, DOC_TYPES.CHARACTERS)
  await regenerateDocument(projectStore.currentProjectId, DOC_TYPES.RELATIONSHIPS)
})

watch(() => storyBibleStore.locations.length, async () => {
  if (!projectStore.currentProjectId) return
  const { regenerateDocument } = useStoryDocuments()
  await regenerateDocument(projectStore.currentProjectId, DOC_TYPES.WORLD)
})

watch(() => storyBibleStore.plotThreads.length, async () => {
  if (!projectStore.currentProjectId) return
  const { regenerateDocument } = useStoryDocuments()
  await regenerateDocument(projectStore.currentProjectId, DOC_TYPES.TIMELINE)
})

const filteredCharacters = computed(() => {
  if (!searchQuery.value) return storyBibleStore.characters
  const query = searchQuery.value.toLowerCase()
  return storyBibleStore.characters.filter(c => 
    c.name?.toLowerCase().includes(query) || c.role?.toLowerCase().includes(query)
  )
})

const filteredLocations = computed(() => {
  if (!searchQuery.value) return storyBibleStore.locations
  const query = searchQuery.value.toLowerCase()
  return storyBibleStore.locations.filter(l => 
    l.name?.toLowerCase().includes(query) || l.description?.toLowerCase().includes(query)
  )
})

const filteredPlotThreads = computed(() => {
  if (!searchQuery.value) return storyBibleStore.plotThreads
  const query = searchQuery.value.toLowerCase()
  return storyBibleStore.plotThreads.filter(t => 
    t.title?.toLowerCase().includes(query) || t.status?.toLowerCase().includes(query)
  )
})

async function addCharacter() {
  if (!projectStore.currentProjectId) return
  await storyBibleStore.addCharacterData(projectStore.currentProjectId, {
    name: 'New Character',
    role: '',
    goal: '',
    voice: '',
    notes: '',
    sampleDialogue: ''
  })
}

async function updateCharacter(id, data) {
  await storyBibleStore.updateCharacterData(id, data, projectStore.currentProjectId)
}

async function deleteCharacter(id) {
  if (confirm('Delete this character?')) {
    await storyBibleStore.deleteCharacterData(id, projectStore.currentProjectId)
  }
}

async function addLocation() {
  if (!projectStore.currentProjectId) return
  await storyBibleStore.addLocationData(projectStore.currentProjectId, {
    name: 'New Location',
    description: '',
    notes: ''
  })
}

async function updateLocation(id, data) {
  await storyBibleStore.updateLocationData(id, data, projectStore.currentProjectId)
}

async function deleteLocation(id) {
  if (confirm('Delete this location?')) {
    await storyBibleStore.deleteLocationData(id, projectStore.currentProjectId)
  }
}

async function addPlotThread() {
  if (!projectStore.currentProjectId) return
  await storyBibleStore.addPlotThreadData(projectStore.currentProjectId, {
    title: 'New Plot Thread',
    status: 'open',
    notes: ''
  })
}

async function updatePlotThread(id, data) {
  await storyBibleStore.updatePlotThreadData(id, data, projectStore.currentProjectId)
}

async function deletePlotThread(id) {
  if (confirm('Delete this thread?')) {
    await storyBibleStore.deletePlotThreadData(id, projectStore.currentProjectId)
  }
}

function startEdit(entity, type) {
  editingId.value = entity.id
  editData.value = { ...entity }
}

function cancelEdit() {
  editingId.value = null
  editData.value = { name: '', role: '', goal: '', voice: '', notes: '', sampleDialogue: '' }
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

defineExpose({
  refresh: async () => {
    if (projectStore.currentProjectId) {
      await storyBibleStore.loadAll(projectStore.currentProjectId)
    }
  }
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle">
      <div class="flex items-center justify-between mb-3">
        <span class="font-storybible text-accent tracking-wide">Story Bible</span>
      </div>
    </div>

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
        Characters <span class="text-[10px] opacity-60">{{ filteredCharacters.length }}</span>
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
        Threads <span class="text-[10px] opacity-60">{{ filteredPlotThreads.length }}</span>
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
        Locations <span class="text-[10px] opacity-60">{{ filteredLocations.length }}</span>
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

    <div v-if="activeTab === 'characters'" class="flex-1 overflow-y-auto p-4 space-y-3">
      <div class="flex items-center gap-2 mb-2">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors font-ui"
          @click="handleGenerateCharacter"
        >
          <BaseIcon name="sparkles" :size="12" />
          Generate
        </button>
      </div>
        <div
          v-for="character in filteredCharacters"
          :key="character.id"
          class="bg-bg-tertiary border border-border-subtle rounded-lg p-3"
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
            <span v-if="character.role" class="text-xs px-2 py-0.5 bg-bg-secondary text-text-secondary rounded">
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
          <div v-if="character.notes && editingId !== character.id" class="mt-2 text-sm text-text-secondary">
            {{ character.notes }}
          </div>
          <div v-if="character.sampleDialogue && editingId !== character.id" class="mt-2 text-sm italic text-text-hint border-l-2 border-accent/30 pl-3">
            &ldquo;{{ character.sampleDialogue }}&rdquo;
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
            placeholder="Sample dialogue — &quot;A line this character would actually say.&quot;"
            rows="1"
            class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
          />
        </div>
      </div>
      <button
        class="w-full py-2 border-2 border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
        @click="addCharacter"
      >
        + Add character
      </button>
    </div>

    <div v-if="activeTab === 'plotThreads'" class="flex-1 overflow-y-auto p-4 space-y-3">
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
              thread.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
            ]">
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
        <div v-if="thread.notes && editingId !== thread.id" class="mt-2 text-sm text-text-secondary">
          {{ thread.notes }}
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
        </div>
      </div>
      <button
        class="w-full py-2 border-2 border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
        @click="addPlotThread"
      >
        + Add thread
      </button>
    </div>

    <div v-if="activeTab === 'locations'" class="flex-1 overflow-y-auto p-4 space-y-3">
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
        <div v-if="location.description && editingId !== location.id" class="mt-2 text-sm text-text-secondary">
          {{ location.description }}
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
            placeholder="Sample dialogue — &quot;A line this character would actually say.&quot;"
            rows="1"
            class="w-full bg-bg-secondary px-2 py-1 text-sm text-text-primary rounded placeholder:text-text-hint resize-none"
          />
        </div>
      </div>
      <button
        class="w-full py-2 border-2 border-dashed border-border-subtle text-text-secondary text-sm rounded-lg hover:border-accent hover:text-accent transition-colors"
        @click="addLocation"
      >
        + Add location
      </button>
    </div>

    <div v-if="activeTab === 'documents'" class="flex-1 overflow-y-auto p-4">
      <div class="flex gap-1.5 flex-wrap mb-4">
        <button
          v-for="dt in documentTypes"
          :key="dt.key"
          :class="[
            'px-2.5 py-1 text-[11px] font-medium rounded-lg font-ui transition-colors',
            selectedDocType === dt.key
              ? 'bg-accent text-white'
              : 'bg-bg-secondary text-text-secondary hover:bg-surface-hover'
          ]"
          @click="selectedDocType = dt.key"
        >
          {{ dt.label }}
        </button>
      </div>
      <pre
        class="p-3 bg-bg-tertiary rounded-lg text-xs text-text-primary whitespace-pre-wrap font-mono leading-relaxed min-h-[200px] overflow-y-auto"
      >{{ documentContent || 'No content yet. Add some story elements first.' }}</pre>
    </div>

    <GenerateCharacterModal
      ref="generateModalRef"
      :show="showGenerateModal"
      :mode="generateMode"
      :existing-character="characterToEnhance"
      @close="showGenerateModal = false; characterToEnhance = null"
      @generate="onModalGenerate"
      @reject="onRejectGeneration"
      @create="onCreateCharacter"
      @update="onUpdateCharacter"
    />
  </div>
</template>