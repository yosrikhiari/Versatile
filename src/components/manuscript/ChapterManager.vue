<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVolumeStore } from '../../stores/volumeStore'
import { useChapterSceneManager, CHAPTER_STATUSES } from '../../composables/useChapterSceneManager'
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
  activeChapterId,
  newScene,
  editingScene,
  getStatusColor,
  getStatusLabel,
  getChapterWordCount,
  openAddScene,
  openEditScene,
  saveScene,
  deleteScene
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
  for (const chapter of sortedChapters.value) {
    if (chapter.tags) {
      for (const tag of chapter.tags) {
        tags.add(tag)
      }
    }
  }
  return Array.from(tags).sort()
})

const filteredChapters = computed(() => {
  if (tagFilter.value.length === 0) return sortedChapters.value
  return sortedChapters.value.filter(c => 
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

const sortedChapters = computed(() => manuscriptStore.sortedChapters)
const scenesByChapter = computed(() => manuscriptStore.scenesByChapter)

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

const chapterDragOptions = {
  ...DRAG_OPTIONS,
  group: 'chapters'
}

const sceneDragOptions = {
  ...DRAG_OPTIONS,
  group: 'scenes'
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
    manuscriptStore.updateChapterData(
      editingChapter.value.id,
      newChapter.value,
      projectStore.currentProjectId
    )
  } else {
    manuscriptStore.addChapterData(projectStore.currentProjectId, newChapter.value)
  }
  
  showChapterModal.value = false
}

function deleteChapter(chapter) {
  if (confirm(`Delete "${chapter.title || 'Chapter ' + (chapter.order + 1)}"? This will also delete all scenes in this chapter.`)) {
    manuscriptStore.deleteChapterData(chapter.id, projectStore.currentProjectId)
  }
}

function updateChapterOrder() {
  endDrag()
  const ids = sortedChapters.value.map(c => c.id)
  manuscriptStore.reorderChaptersData(ids, projectStore.currentProjectId)
}

function selectChapter(chapterId) {
  activeChapterId.value = activeChapterId.value === chapterId ? null : chapterId
}

function updateSceneOrder(chapterId) {
  endDrag()
  const sceneIds = scenesByChapter.value[chapterId]?.map(s => s.id) || []
  manuscriptStore.reorderScenesData(sceneIds, projectStore.currentProjectId)
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

function getChaptersInVolume(volumeId) {
  return sortedChapters.value.filter(c => c.volumeId === volumeId)
}
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
      <span class="font-spark text-accent tracking-wide">Chapter Manager</span>
      <button
        @click="openAddChapter"
        class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
      >
        + Add Chapter
      </button>
    </div>

    <div v-if="allTags.length > 0" class="px-4 py-2 border-b border-border-subtle flex items-center gap-2 overflow-x-auto shrink-0">
      <span class="text-xs text-text-hint font-ui shrink-0">Filter:</span>
      <button
        v-for="tag in allTags"
        :key="tag"
        @click="toggleTagFilter(tag)"
        :class="[
          'px-2 py-0.5 text-xs rounded-full font-ui shrink-0',
          tagFilter.includes(tag)
            ? 'bg-accent text-white'
            : 'bg-bg-tertiary text-text-hint hover:text-text-secondary'
        ]"
      >
        {{ tag }}
      </button>
      <button
        v-if="tagFilter.length > 0"
        @click="tagFilter = []"
        class="text-xs text-text-hint hover:text-danger font-ui shrink-0"
      >
        Clear
      </button>
    </div>

    <div class="px-4 py-2 border-b border-border-subtle flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-xs text-text-hint font-ui">Volumes</span>
        <button
          @click="openAddVolume"
          class="px-2 py-0.5 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-surface-hover"
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
              <span class="text-xs text-text-hint">({{ getChaptersInVolume(volume.id).length }} chapters)</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                @click.stop="toggleAssignMode(volume.id)"
                :class="[
                  'px-2 py-1 text-xs rounded',
                  assignMode && assignVolumeId === volume.id
                    ? 'bg-accent text-white'
                    : 'bg-bg-secondary text-text-hint hover:text-text-secondary'
                ]"
                title="Assign chapters"
              >
                <BaseIcon name="folder-plus" :size="12" />
              </button>
              <button
                @click.stop="openEditVolume(volume)"
                class="p-1 text-text-hint hover:text-text-secondary"
              >
                <BaseIcon name="edit-2" :size="12" />
              </button>
              <button
                @click.stop="deleteVolume(volume)"
                class="p-1 text-text-hint hover:text-danger"
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
                @click="volumeStore.removeChapter(chapter.id, projectStore.currentProjectId)"
                class="text-text-hint hover:text-danger"
              >
                <BaseIcon name="x" :size="12" />
              </button>
            </div>
            <div v-if="getChaptersInVolume(volume.id).length === 0" class="text-center py-2">
              <p class="text-xs text-text-hint">No chapters assigned. Click the folder icon to add.</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredChapters.length === 0 && sortedChapters.length > 0" class="text-center py-12">
        <p class="text-text-hint font-ui text-sm mb-4">No chapters match the selected tags.</p>
        <button
          @click="tagFilter = []"
          class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 font-ui"
        >
          Clear Filters
        </button>
      </div>
      <div v-else-if="filteredChapters.length === 0" class="text-center py-12">
        <p class="text-text-hint font-ui text-sm mb-4">No chapters yet. Start planning your manuscript!</p>
        <button
          @click="openAddChapter"
          class="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 font-ui"
        >
          Add First Chapter
        </button>
      </div>

      <draggable
        :list="filteredChapters"
        item-key="id"
        v-bind="chapterDragOptions"
        @end="updateChapterOrder"
        class="space-y-3"
      >
        <template #item="{ element: chapter }">
          <div
            :class="[
              'bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden',
              assignMode ? 'ring-2 ring-accent cursor-pointer' : ''
            ]"
          >
            <div
              @click="assignMode ? assignChapterToVolume(chapter.id) : selectChapter(chapter.id)"
              :class="[
                'p-3 flex items-center justify-between transition-colors',
                assignMode ? 'hover:bg-accent/10' : 'hover:bg-surface-hover cursor-pointer'
              ]"
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
                  {{ getChapterWordCount(chapter.id) }} words
                </span>
                <span class="text-text-hint">{{ scenesByChapter[chapter.id]?.length || 0 }} scenes</span>
              </div>
            </div>

            <div v-if="activeChapterId === chapter.id" class="border-t border-border-subtle p-3 bg-surface-hover">
              <div class="flex gap-2 mb-3">
                <button
                  @click="openAddScene(chapter.id)"
                  class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
                >
                  + Add Scene
                </button>
                <button
                  @click="openEditChapter(chapter)"
                  class="px-3 py-1 text-xs bg-bg-secondary text-text-secondary rounded hover:bg-surface-hover font-ui"
                >
                  Edit
                </button>
                <button
                  @click="deleteChapter(chapter)"
                  class="px-3 py-1 text-xs text-danger hover:bg-danger/10 rounded font-ui"
                >
                  Delete
                </button>
                <button
                  @click="openChapterSnapshot(chapter)"
                  class="px-3 py-1 text-xs bg-bg-secondary text-text-secondary rounded hover:bg-surface-hover font-ui"
                  title="Version history"
                >
                  History
                </button>
              </div>

              <draggable
                :list="scenesByChapter[chapter.id]"
                item-key="id"
                v-bind="sceneDragOptions"
                @end="() => updateSceneOrder(chapter.id)"
                class="space-y-2 min-h-[50px]"
              >
                <template #item="{ element: scene, index }">
                  <div
                    class="bg-bg-secondary rounded p-2 flex items-center justify-between cursor-grab"
                  >
                    <div class="flex items-center gap-2">
                      <BaseIcon name="grip-vertical" :size="14" class="text-text-hint cursor-grab" />
                      <div>
                        <div class="text-sm text-text-primary font-ui">{{ scene.title || 'Untitled Scene' }}</div>
                        <div v-if="scene.summary" class="text-xs text-text-hint font-ui">
                          {{ scene.summary.length > 50 ? scene.summary.slice(0, 50) + '...' : scene.summary }}
                        </div>
                      </div>
                    </div>
                    <div class="flex gap-1">
                      <button
                        @click="openEditScene(scene)"
                        class="px-2 py-1 text-xs text-text-hint hover:text-text-secondary font-ui"
                        title="Edit scene"
                      >
                        Edit
                      </button>
                      <button
                        @click="deleteScene(scene)"
                        class="px-2 py-1 text-xs text-danger hover:bg-danger/10 font-ui"
                        title="Delete scene"
                      >
                        <BaseIcon name="x" :size="12" />
                      </button>
                      <button
                        @click="openSceneSnapshot(scene)"
                        class="px-2 py-1 text-xs text-text-hint hover:text-text-secondary font-ui"
                        title="Version history"
                      >
                        History
                      </button>
                    </div>
                  </div>
                </template>
              </draggable>

              <div v-if="!scenesByChapter[chapter.id]?.length" class="text-center py-4">
                <p class="text-xs text-text-hint font-ui">No scenes yet. Break down this chapter into scenes.</p>
              </div>
            </div>
          </div>
        </template>
      </draggable>

      <div v-if="sortedChapters.length > 0" class="mt-4 pt-3 border-t border-border-subtle">
        <div class="text-xs text-text-hint font-ui">
          Total: {{ totalWordCount.toLocaleString() }} words
        </div>
      </div>
    </div>

    <Modal :show="showChapterModal" @close="showChapterModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingChapter ? 'Edit Chapter' : 'Add Chapter' }}
        </h3>
        
        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Title</label>
          <input
            v-model="newChapter.title"
            type="text"
            placeholder="Chapter title..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Summary</label>
          <textarea
            v-model="newChapter.summary"
            rows="3"
            placeholder="Brief summary of what happens in this chapter..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          ></textarea>
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Status</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="status in CHAPTER_STATUSES"
              :key="status.value"
              @click="newChapter.status = status.value"
              :class="[
                'px-3 py-1 text-xs rounded-full border font-ui',
                newChapter.status === status.value
                  ? 'text-white'
                  : 'border-border-subtle text-text-hint'
              ]"
              :style="newChapter.status === status.value ? { backgroundColor: status.color } : {}"
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
            @click="saveChapter"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui"
          >
            {{ editingChapter ? 'Save' : 'Add' }}
          </button>
          <button
            @click="showChapterModal = false"
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>

    <Modal :show="showSceneModal" @close="showSceneModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingScene ? 'Edit Scene' : 'New Scene' }}
        </h3>
        
        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Scene Title</label>
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
            @click="saveScene"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui"
          >
            {{ editingScene ? 'Save' : 'Add' }}
          </button>
          <button
            @click="showSceneModal = false"
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
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
              @click="newVolume.color = color"
              :class="[
                'w-6 h-6 rounded-full border-2',
                newVolume.color === color ? 'border-white scale-110' : 'border-transparent'
              ]"
              :style="{ backgroundColor: color }"
            ></button>
          </div>
        </div>

        <div class="flex gap-2">
          <button
            @click="saveVolume"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui"
          >
            {{ editingVolume ? 'Save' : 'Add' }}
          </button>
          <button
            @click="showVolumeModal = false"
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>