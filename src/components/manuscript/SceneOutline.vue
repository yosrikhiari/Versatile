<script setup>
import { ref, computed, onMounted } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useChapterSceneManager } from '../../composables/useChapterSceneManager'
import { useDraggableList, DRAG_OPTIONS } from '../../composables/useDraggableList'
import Modal from '../shared/Modal.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import draggable from 'vuedraggable'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const { startDrag, endDrag } = useDraggableList()

const {
  editingScene,
  showSceneModal,
  activeChapterId,
  newScene,
  getStatusColor,
  getSceneWordCount,
  getChapterWordCount,
  openAddScene,
  openEditScene,
  saveScene,
  deleteScene
} = useChapterSceneManager()

const selectedChapterId = ref(null)
const viewMode = ref('chapters')
const filterStatus = ref('all')
const searchQuery = ref('')

const sortedChapters = computed(() => manuscriptStore.sortedChapters)
const scenesByChapter = computed(() => manuscriptStore.scenesByChapter)
const filteredChapters = computed(() => {
  return sortedChapters.value.filter(chapter => {
    const scenes = scenesByChapter.value[chapter.id] || []
    const matchesSearch = searchQuery.value === '' || 
      chapter.title?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      scenes.some(s => s.title?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                      s.summary?.toLowerCase().includes(searchQuery.value.toLowerCase()))
    const matchesStatus = filterStatus.value === 'all' || chapter.status === filterStatus.value
    return matchesSearch && matchesStatus
  })
})

const allScenes = computed(() => {
  const scenes = []
  for (const chapter of sortedChapters.value) {
    const chapterScenes = scenesByChapter.value[chapter.id] || []
    for (const scene of chapterScenes) {
      scenes.push({ ...scene, chapterTitle: chapter.title, chapterOrder: chapter.order })
    }
  }
  return scenes.sort((a, b) => {
    if (a.chapterOrder !== b.chapterOrder) return a.chapterOrder - b.chapterOrder
    return (a.order || 0) - (b.order || 0)
  })
})

const dragOptions = {
  ...DRAG_OPTIONS,
  group: 'scenes'
}

function selectChapter(chapterId) {
  selectedChapterId.value = selectedChapterId.value === chapterId ? null : chapterId
}

function onSceneDragEnd(chapterId) {
  endDrag()
  const sceneIds = scenesByChapter.value[chapterId]?.map(s => s.id) || []
  manuscriptStore.reorderScenesData(sceneIds, projectStore.currentProjectId)
}

function getChapterTotalScenes(chapterId) {
  return scenesByChapter.value[chapterId]?.length || 0
}

onMounted(() => {
  if (projectStore.currentProjectId) {
    manuscriptStore.loadManuscript(projectStore.currentProjectId)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <div class="px-4 py-3 border-b border-border-subtle">
      <div class="flex items-center justify-between mb-3">
        <span class="font-spark text-accent tracking-wide">Scene Outline</span>
        <div class="flex gap-2">
          <button
            v-for="mode in [{ value: 'chapters', label: 'By Chapter' }, { value: 'list', label: 'List' }]"
            :key="mode.value"
            @click="viewMode = mode.value"
            :class="[
              'px-2 py-1 text-xs rounded font-ui',
              viewMode === mode.value
                ? 'bg-accent/10 text-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>
      
      <div class="flex gap-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search scenes..."
          class="flex-1 px-3 py-1.5 text-xs border border-border-subtle rounded bg-bg-tertiary text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <select
          v-model="filterStatus"
          class="px-2 py-1.5 text-xs border border-border-subtle rounded bg-bg-tertiary text-text-primary font-ui"
        >
          <option value="all">All Status</option>
          <option value="planning">Planning</option>
          <option value="outline">Outlined</option>
          <option value="writing">Writing</option>
          <option value="revision">Revision</option>
          <option value="complete">Complete</option>
        </select>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="sortedChapters.length === 0" class="text-center py-12 space-y-4">
        <p class="text-text-hint font-ui text-sm">No chapters yet. Create chapters in Chapter Manager to organize your scenes.</p>
        <p class="text-xs text-text-hint font-ui">Tip: Press <kbd class="px-1.5 py-0.5 bg-bg-tertiary rounded text-[10px]">8</kbd> to open Chapter Manager</p>
      </div>

      <div v-else-if="viewMode === 'chapters'" class="space-y-4">
        <div
          v-for="chapter in filteredChapters"
          :key="chapter.id"
          class="bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden"
        >
          <div
            @click="selectChapter(chapter.id)"
            class="p-3 cursor-pointer flex items-center justify-between hover:bg-surface-hover transition-colors"
          >
            <div class="flex items-center gap-3">
              <span
                class="w-2 h-8 rounded-full"
                :style="{ backgroundColor: getStatusColor(chapter.status) }"
              ></span>
              <div>
                <div class="font-semibold text-text-primary font-ui">
                  {{ chapter.title || `Chapter ${chapter.order + 1}` }}
                </div>
                <div class="text-xs text-text-hint font-ui">
                  {{ getChapterTotalScenes(chapter.id) }} scenes · {{ getChapterWordCount(chapter.id) }} words
                </div>
              </div>
            </div>
            <BaseIcon :name="selectedChapterId === chapter.id ? 'chevron-down' : 'chevron-right'" :size="16" class="text-text-hint" />
          </div>

          <div v-if="selectedChapterId === chapter.id" class="border-t border-border-subtle">
            <div class="p-2 bg-surface-hover flex justify-end">
              <button
                @click="openAddScene(chapter.id)"
                class="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded font-ui"
              >
                + Add Scene
              </button>
            </div>

            <draggable
              :list="scenesByChapter[chapter.id]"
              item-key="id"
              v-bind="dragOptions"
              @end="() => onSceneDragEnd(chapter.id)"
              class="p-2 space-y-2 min-h-[50px]"
            >
              <template #item="{ element: scene }">
                <div
                  class="bg-bg-secondary rounded p-2 border border-border-subtle cursor-grab hover:border-accent/50 transition-colors group"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <BaseIcon name="grip-vertical" :size="14" class="text-text-hint cursor-grab" />
                        <span class="text-sm font-medium text-text-primary font-ui">{{ scene.title || 'Untitled' }}</span>
                      </div>
                      <div v-if="scene.summary" class="mt-1 text-xs text-text-hint font-ui pl-5">
                        {{ scene.summary.length > 80 ? scene.summary.slice(0, 80) + '...' : scene.summary }}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        @click="openEditScene(scene)"
                        class="p-1 text-text-hint hover:text-text-secondary"
                        title="Edit scene"
                      >
                        <BaseIcon name="pencil" :size="14" />
                      </button>
                      <button
                        @click="deleteScene(scene)"
                        class="p-1 text-text-hint hover:text-danger"
                        title="Delete scene"
                      >
                        <BaseIcon name="x" :size="14" />
                      </button>
                    </div>
                  </div>
                  <div class="mt-1 pl-5 text-[10px] text-text-hint font-ui">
                    {{ getSceneWordCount(scene) }} words
                  </div>
                </div>
              </template>
            </draggable>

            <div v-if="!scenesByChapter[chapter.id]?.length" class="p-4 text-center">
              <p class="text-xs text-text-hint font-ui">Drag scenes here or click "Add Scene"</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="scene in allScenes"
          :key="scene.id"
          class="bg-bg-tertiary rounded p-3 border border-border-subtle hover:border-accent/50 transition-colors cursor-pointer"
          @click="openEditScene(scene)"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-accent font-ui">
              Ch. {{ scene.chapterOrder + 1 }} · {{ scene.chapterTitle }}
            </span>
            <span class="text-xs text-text-hint font-ui">
              {{ getSceneWordCount(scene) }} words
            </span>
          </div>
          <div class="font-medium text-text-primary font-ui">{{ scene.title || 'Untitled' }}</div>
          <div v-if="scene.summary" class="text-xs text-text-hint font-ui mt-1">
            {{ scene.summary.length > 100 ? scene.summary.slice(0, 100) + '...' : scene.summary }}
          </div>
        </div>
      </div>
    </div>

    <Modal :show="showSceneModal" max-width="max-w-lg" @close="showSceneModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingScene ? 'Edit Scene' : 'New Scene' }}
        </h3>
        
        <div v-if="!editingScene" class="mb-3 text-xs text-text-hint font-ui">
          Adding to: {{ sortedChapters.find(c => c.id === activeChapterId)?.title || 'Unknown Chapter' }}
        </div>

        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Scene Title</label>
          <input
            v-model="newScene.title"
            type="text"
            placeholder="What happens in this scene?"
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Summary / Beats</label>
          <textarea
            v-model="newScene.summary"
            rows="4"
            placeholder="Key beats and moments in this scene..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          ></textarea>
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Draft Content (optional)</label>
          <textarea
            v-model="newScene.content"
            rows="8"
            placeholder="Write the scene here..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          ></textarea>
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
  </div>
</template>

<style scoped>
.ghost {
  opacity: 0.5;
  background: #6366f1;
}
.drag {
  opacity: 0.9;
}
</style>