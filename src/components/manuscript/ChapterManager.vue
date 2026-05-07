<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVolumeStore } from '../../stores/volumeStore'
import { useChapterSceneManager, SECTION_STATUSES } from '../../composables/useChapterSceneManager'
import { useDraggableList, DRAG_OPTIONS } from '../../composables/useDraggableList'
import { getChapterWordCounts } from '../../services/dbService'
import Modal from '../shared/Modal.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import draggable from 'vuedraggable'
import SnapshotHistoryDrawer from './SnapshotHistoryDrawer.vue'
import TagInput from '../shared/TagInput.vue'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const volumeStore = useVolumeStore()
const { endDrag } = useDraggableList()

const {
  showSceneModal,
  activeSectionId,
  newScene,
  editingScene,
  getStatusColor,
  getStatusLabel,
  getSectionWordCount,
  openAddSubsection,
  openEditSubsection,
  saveSubsection,
  deleteSubsection
} = useChapterSceneManager()

const showChapterModal = ref(false)
const editingChapter = ref(null)
const newChapter = ref({ title: '', summary: '', status: 'planning', tags: [] })

const showSnapshotDrawer = ref(false)
const snapshotChapterId = ref(null)
const showSceneSnapshotDrawer = ref(false)
const snapshotSceneId = ref(null)

const tagFilter = ref([])
const allTags = computed(() => {
  const tags = new Set()
  for (const section of sortedSections.value) {
    if (section.tags) {
      for (const tag of section.tags) {
        tags.add(tag)
      }
    }
  }
  return Array.from(tags).sort()
})

const filteredSections = computed(() => {
  if (tagFilter.value.length === 0) return sortedSections.value
  return sortedSections.value.filter(c => 
    c.tags && c.tags.some(t => tagFilter.value.includes(t))
  )
})

function toggleTagFilter(tag) {
  if (tagFilter.value.includes(tag)) {
    tagFilter.value = tagFilter.value.filter(t => t !== tag)
  } else {
    tagFilter.value = [...tagFilter.value, tag]
  }
}

const sortedSections = computed(() => manuscriptStore.sortedSections)
const subsectionsBySection = computed(() => manuscriptStore.subsectionsBySection)

const showVolumeModal = ref(false)
const editingVolume = ref(null)
const newVolume = ref({ title: '', description: '', color: '' })
const expandedVolumes = ref(new Set())
const assignMode = ref(false)
const assignVolumeId = ref(null)

const totalWordCount = computed(() => {
  let total = 0
  for (const chapter of sortedChapters.value) {
    const wc = getChapterWordCount(chapter.id)
    total += wc
  }
  return total
})

const sectionDragOptions = {
  ...DRAG_OPTIONS,
  group: 'sections'
}

const subsectionDragOptions = {
  ...DRAG_OPTIONS,
  group: 'subsections'
}

function openAddChapter() {
  editingChapter.value = null
  newChapter.value = { title: '', summary: '', status: 'planning' }
  showChapterModal.value = true
}

function openEditChapter(chapter) {
  editingChapter.value = chapter
  newChapter.value = { 
    title: chapter.title || '',
    summary: chapter.summary || '',
    status: chapter.status || 'planning',
    tags: chapter.tags ? [...chapter.tags] : []
  }
  showChapterModal.value = true
}

function saveChapter() {
  if (!newChapter.value.title.trim()) return
  
  if (editingChapter.value) {
    manuscriptStore.updateSectionData(
      editingChapter.value.id,
      newChapter.value,
      projectStore.currentProjectId
    )
  } else {
    manuscriptStore.addSectionData(projectStore.currentProjectId, newChapter.value)
  }
  
  showChapterModal.value = false
}

function deleteChapter(section) {
  if (confirm(`Delete "${section.title || 'Section ' + (section.order + 1)}"? This will also delete all subsections in this section.`)) {
    manuscriptStore.deleteSectionData(section.id, projectStore.currentProjectId)
  }
}

function updateSectionOrder() {
  endDrag()
  const ids = sortedSections.value.map(s => s.id)
  manuscriptStore.reorderSectionsData(ids, projectStore.currentProjectId)
}

function selectSection(sectionId) {
  activeSectionId.value = activeSectionId.value === sectionId ? null : sectionId
}

function updateSubsectionOrder(sectionId) {
  endDrag()
  const subsectionIds = subsectionsBySection.value[sectionId]?.map(s => s.id) || []
  manuscriptStore.reorderSubsectionsData(subsectionIds, projectStore.currentProjectId)
}

onMounted(() => {
  if (projectStore.currentProjectId) {
    manuscriptStore.loadManuscript(projectStore.currentProjectId)
    volumeStore.loadVolumes(projectStore.currentProjectId)
  }
})

watch(() => projectStore.currentProjectId, (newId) => {
  if (newId) {
    manuscriptStore.loadManuscript(newId)
    volumeStore.loadVolumes(newId)
  }
})

function openChapterSnapshot(chapter) {
  snapshotChapterId.value = chapter.id
  showSnapshotDrawer.value = true
}

function openSceneSnapshot(scene) {
  snapshotSceneId.value = scene.id
  showSceneSnapshotDrawer.value = true
}

function handleSnapshotRestored(content) {
  if (snapshotSceneId.value !== null) {
    manuscriptStore.updateSceneData(snapshotSceneId.value, { content }, projectStore.currentProjectId)
  }
  showSceneSnapshotDrawer.value = false
  snapshotSceneId.value = null
}

function openAddVolume() {
  editingVolume.value = null
  newVolume.value = { 
    title: '', 
    description: '', 
    color: volumeStore.getNextColor() 
  }
  showVolumeModal.value = true
}

function openEditVolume(volume) {
  editingVolume.value = volume
  newVolume.value = { 
    title: volume.title || '',
    description: volume.description || '',
    color: volume.color || '#6366f1'
  }
  showVolumeModal.value = true
}

function saveVolume() {
  if (!newVolume.value.title.trim()) return
  
  if (editingVolume.value) {
    volumeStore.updateVolumeData(editingVolume.value.id, newVolume.value, projectStore.currentProjectId)
  } else {
    volumeStore.createVolume(projectStore.currentProjectId, newVolume.value)
  }
  
  showVolumeModal.value = false
}

function deleteVolume(volume) {
  if (confirm(`Delete "${volume.title}"? Chapters will be unassigned from this volume.`)) {
    volumeStore.deleteVolumeData(volume.id, projectStore.currentProjectId)
  }
}

function toggleVolumeExpand(volumeId) {
  if (expandedVolumes.value.has(volumeId)) {
    expandedVolumes.value.delete(volumeId)
  } else {
    expandedVolumes.value.add(volumeId)
  }
}

function toggleAssignMode(volumeId) {
  if (assignMode.value && assignVolumeId.value === volumeId) {
    assignMode.value = false
    assignVolumeId.value = null
  } else {
    assignMode.value = true
    assignVolumeId.value = volumeId
  }
}

async function assignChapterToVolume(chapterId) {
  if (!assignVolumeId.value || !projectStore.currentProjectId) return
  await volumeStore.assignChapter(chapterId, assignVolumeId.value, projectStore.currentProjectId)
  assignMode.value = false
  assignVolumeId.value = null
}

function getSectionsInVolume(volumeId) {
  return sortedSections.value.filter(s => s.volumeId === volumeId)
}
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
      <span class="font-spark text-accent tracking-wide">Section Manager</span>
      <button
        class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
        @click="openAddChapter"
      >
        + Add Section
      </button>
    </div>

    <div v-if="allTags.length > 0" class="px-4 py-2 border-b border-border-subtle flex items-center gap-2 overflow-x-auto shrink-0">
      <span class="text-xs text-text-hint font-ui shrink-0">Filter:</span>
      <button
        v-for="tag in allTags"
        :key="tag"
        :class="[
          'px-2 py-0.5 text-xs rounded-full font-ui shrink-0',
          tagFilter.includes(tag)
            ? 'bg-accent text-white'
            : 'bg-bg-tertiary text-text-hint hover:text-text-secondary'
        ]"
        @click="toggleTagFilter(tag)"
      >
        {{ tag }}
      </button>
      <button
        v-if="tagFilter.length > 0"
        class="text-xs text-text-hint hover:text-danger font-ui shrink-0"
        @click="tagFilter = []"
      >
        Clear
      </button>
    </div>

    <div class="px-4 py-2 border-b border-border-subtle flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-xs text-text-hint font-ui">Volumes</span>
        <button
          class="px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-surface-hover"
          @click="openAddVolume"
        >
          + Add
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <div v-if="volumeStore.volumes.length > 0" class="space-y-3">
        <div
          v-for="volume in volumeStore.volumes"
          :key="volume.id"
          class="bg-bg-tertiary rounded-lg border overflow-hidden"
        >
          <div
            class="px-3 py-2 flex items-center justify-between cursor-pointer"
            :style="{ borderLeft: `4px solid ${volume.color || '#6366f1'}` }"
            @click="toggleVolumeExpand(volume.id)"
          >
            <div class="flex items-center gap-2">
              <BaseIcon 
                :name="expandedVolumes.has(volume.id) ? 'chevron-down' : 'chevron-right'" 
                :size="14" 
                class="text-text-hint" 
              />
              <span class="font-medium text-text-primary font-ui text-sm">{{ volume.title }}</span>
              <span class="text-xs text-text-hint">({{ getSectionsInVolume(volume.id).length }} sections)</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                :class="[
                  'px-2 py-1 text-xs rounded',
                  assignMode && assignVolumeId === volume.id
                    ? 'bg-accent text-white'
                    : 'bg-bg-secondary text-text-hint hover:text-text-secondary'
                ]"
                  title="Assign sections"
                @click.stop="toggleAssignMode(volume.id)"
              >
                <BaseIcon name="folder-plus" :size="12" />
              </button>
              <button
                class="p-1 text-text-hint hover:text-text-secondary"
                @click.stop="openEditVolume(volume)"
              >
                <BaseIcon name="edit-2" :size="12" />
              </button>
              <button
                class="p-1 text-text-hint hover:text-danger"
                @click.stop="deleteVolume(volume)"
              >
                <BaseIcon name="trash-2" :size="12" />
              </button>
            </div>
          </div>
          
          <div v-if="expandedVolumes.has(volume.id)" class="border-t border-border-subtle p-2 space-y-2">
            <div
              v-for="chapter in getChaptersInVolume(volume.id)"
              :key="chapter.id"
              class="bg-bg-secondary rounded p-2 flex items-center justify-between"
            >
              <div class="flex items-center gap-2">
                <BaseIcon name="file-text" :size="14" class="text-text-hint" />
                <span class="text-sm text-text-primary">{{ chapter.title || `Chapter ${chapter.order + 1}` }}</span>
              </div>
              <button
                class="text-text-hint hover:text-danger"
                @click="volumeStore.removeChapter(chapter.id, projectStore.currentProjectId)"
              >
                <BaseIcon name="x" :size="12" />
              </button>
            </div>
            <div v-if="getChaptersInVolume(volume.id).length === 0" class="text-center py-2">
                <p class="text-xs text-text-hint">No sections assigned. Click the folder icon to add.</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredChapters.length === 0 && sortedChapters.length > 0" class="text-center py-12">
        <p class="text-text-hint font-ui text-sm mb-4">No sections match the selected tags.</p>
        <button
          class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 font-ui"
          @click="tagFilter = []"
        >
          Clear Filters
        </button>
      </div>
      <div v-else-if="filteredChapters.length === 0" class="text-center py-12">
        <p class="text-text-hint font-ui text-sm mb-4">No sections yet. Start planning your document!</p>
        <button
          class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 font-ui"
          @click="openAddChapter"
        >
          Add First Section
        </button>
      </div>

      <draggable
        :list="filteredSections"
        item-key="id"
        v-bind="sectionDragOptions"
        class="space-y-3"
        @end="updateSectionOrder"
      >
        <template #item="{ element: chapter }">
          <div
            :class="[
              'bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden',
              assignMode ? 'ring-2 ring-accent cursor-pointer' : ''
            ]"
          >
            <div
              :class="[
                'p-3 flex items-center justify-between transition-colors',
                assignMode ? 'hover:bg-accent/10' : 'hover:bg-surface-hover cursor-pointer'
              ]"
              @click="assignMode ? assignChapterToVolume(chapter.id) : selectChapter(chapter.id)"
            >
              <div class="flex items-center gap-3">
                <BaseIcon name="grip-vertical" :size="16" class="text-text-hint cursor-grab" />
                <div>
                  <div class="font-semibold text-text-primary font-ui">
                    {{ chapter.title || `Chapter ${chapter.order + 1}` }}
                  </div>
                  <div v-if="chapter.summary" class="text-xs text-text-hint font-ui mt-0.5">
                    {{ chapter.summary.length > 60 ? chapter.summary.slice(0, 60) + '...' : chapter.summary }}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="px-2 py-0.5 text-[10px] rounded-full text-white font-ui"
                  :style="{ backgroundColor: getStatusColor(chapter.status) }"
                >
                  {{ getStatusLabel(chapter.status) }}
                </span>
                <span class="text-xs text-text-hint font-ui">
                  {{ getSectionWordCount(chapter.id) }} words
                </span>
                <span class="text-text-hint">{{ subsectionsBySection[chapter.id]?.length || 0 }} subsections</span>
              </div>
            </div>

              <div v-if="activeSectionId === chapter.id" class="border-t border-border-subtle p-3 bg-surface-hover">
              <div class="flex gap-2 mb-3">
                <button
                  class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
                  @click="openAddSubsection(chapter.id)"
                >
                  + Add Subsection
                </button>
                <button
                  class="px-3 py-1 text-xs bg-bg-secondary text-text-secondary rounded hover:bg-surface-hover font-ui"
                  @click="openEditChapter(chapter)"
                >
                  Edit
                </button>
                <button
                  class="px-3 py-1 text-xs text-danger hover:bg-danger/10 font-ui"
                  @click="deleteChapter(chapter)"
                >
                  Delete
                </button>
                <button
                  class="px-3 py-1 text-xs bg-bg-secondary text-text-secondary rounded hover:bg-surface-hover font-ui"
                  title="Version history"
                  @click="openChapterSnapshot(chapter)"
                >
                  History
                </button>
              </div>

              <draggable
                :list="subsectionsBySection[chapter.id]"
                item-key="id"
                v-bind="subsectionDragOptions"
                class="space-y-2 min-h-[50px]"
                @end="() => updateSubsectionOrder(chapter.id)"
              >
                <template #item="{ element: scene }">
                  <div
                    class="bg-bg-secondary rounded p-2 flex items-center justify-between cursor-grab"
                  >
                    <div class="flex items-center gap-2">
                      <BaseIcon name="grip-vertical" :size="14" class="text-text-hint cursor-grab" />
                      <div>
                        <div class="text-sm text-text-primary font-ui">{{ scene.title || 'Untitled Subsection' }}</div>
                        <div v-if="scene.summary" class="text-xs text-text-hint font-ui">
                          {{ scene.summary.length > 50 ? scene.summary.slice(0, 50) + '...' : scene.summary }}
                        </div>
                      </div>
                    </div>
                    <div class="flex gap-1">
                        <button
                          class="px-2 py-1 text-xs text-text-hint hover:text-text-secondary font-ui"
                          title="Edit subsection"
                          @click="openEditSubsection(scene)"
                        >
                          Edit
                        </button>
                        <button
                          class="px-2 py-1 text-xs text-danger hover:bg-danger/10 font-ui"
                          title="Delete subsection"
                          @click="deleteSubsection(scene)"
                        >
                          <BaseIcon name="x" :size="12" />
                        </button>
                      <button
                        class="px-2 py-1 text-xs text-text-hint hover:text-text-secondary font-ui"
                        title="Version history"
                        @click="openSceneSnapshot(scene)"
                      >
                        History
                      </button>
                    </div>
                  </div>
                </template>
              </draggable>

              <div v-if="!subsectionsBySection[chapter.id]?.length" class="text-center py-4">
                <p class="text-xs text-text-hint font-ui">No subsections yet. Break down this section into subsections.</p>
              </div>
            </div>
          </div>
        </template>
      </draggable>

      <div v-if="sortedSections.length > 0" class="mt-4 pt-3 border-t border-border-subtle">
        <div class="text-xs text-text-hint font-ui">
          Total: {{ totalWordCount.toLocaleString() }} words
        </div>
      </div>
    </div>

    <Modal :show="showChapterModal" @close="showChapterModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingChapter ? 'Edit Section' : 'Add Section' }}
        </h3>
        
        <div class="mb-3">
                <label class="block text-xs text-text-hint font-ui mb-1">Title</label>
                <input
                  v-model="newChapter.title"
                  type="text"
                  placeholder="Section title..."
                  class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
        </div>

        <div class="mb-3">
                <label class="block text-xs text-text-hint font-ui mb-1">Summary</label>
                <textarea
                  v-model="newChapter.summary"
                  rows="3"
                  placeholder="Brief summary of what happens in this section..."
                  class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                ></textarea>
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Status</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="status in SECTION_STATUSES"
              :key="status.value"
              :class="[
                'px-3 py-1 text-xs rounded-full border font-ui',
                newChapter.status === status.value
                  ? 'text-white'
                  : 'border-border-subtle text-text-hint'
              ]"
              :style="newChapter.status === status.value ? { backgroundColor: status.color } : {}"
              @click="newChapter.status = status.value"
            >
              {{ status.label }}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Tags</label>
          <TagInput v-model="newChapter.tags" placeholder="Add tags, press Enter" />
        </div>

        <div class="flex gap-2">
          <button
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui"
            @click="saveChapter"
          >
            {{ editingChapter ? 'Save' : 'Add' }}
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showChapterModal = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>

    <Modal :show="showSceneModal" @close="showSceneModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingScene ? 'Edit Subsection' : 'New Subsection' }}
        </h3>
        
        <div class="mb-3">
                <label class="block text-xs text-text-hint font-ui mb-1">Subsection Title</label>
          <input
            v-model="newScene.title"
            type="text"
            placeholder="Scene title..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Summary / Beats</label>
          <textarea
            v-model="newScene.summary"
            rows="4"
            placeholder="Key moments, beats, or summary of this scene..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          ></textarea>
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Tags</label>
          <TagInput v-model="newScene.tags" placeholder="Add tags, press Enter" />
        </div>

        <div class="flex gap-2">
          <button
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui"
            @click="saveScene"
          >
            {{ editingScene ? 'Save' : 'Add' }}
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showSceneModal = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>

    <SnapshotHistoryDrawer
      :show="showSnapshotDrawer"
      :chapter-id="snapshotChapterId"
      @close="showSnapshotDrawer = false; snapshotChapterId = null"
      @restored="(content) => { if (snapshotChapterId !== null) { manuscriptStore.updateChapterData(snapshotChapterId, { content }, projectStore.currentProjectId) }; showSnapshotDrawer = false; snapshotChapterId = null }"
    />

    <SnapshotHistoryDrawer
      :show="showSceneSnapshotDrawer"
      :chapter-id="snapshotSceneId"
      @close="showSceneSnapshotDrawer = false; snapshotSceneId = null"
      @restored="handleSnapshotRestored"
    />

    <Modal :show="showVolumeModal" @close="showVolumeModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingVolume ? 'Edit Volume' : 'Add Volume' }}
        </h3>
        
        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Volume Title</label>
          <input
            v-model="newVolume.title"
            type="text"
            placeholder="e.g. Volume 1: The Awakening"
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Description</label>
          <textarea
            v-model="newVolume.description"
            rows="2"
            placeholder="What is this volume about?"
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          ></textarea>
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-2">Color</label>
          <div class="flex gap-2">
            <button
              v-for="color in volumeStore.VOLUME_COLORS"
              :key="color"
              :class="[
                'w-6 h-6 rounded-full border-2',
                newVolume.color === color ? 'border-white scale-110' : 'border-transparent'
              ]"
              :style="{ backgroundColor: color }"
              @click="newVolume.color = color"
            ></button>
          </div>
        </div>

        <div class="flex gap-2">
          <button
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui"
            @click="saveVolume"
          >
            {{ editingVolume ? 'Save' : 'Add' }}
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showVolumeModal = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>