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
const { endDrag } = useDraggableList()

const {
  editingScene,
  showSceneModal,
  activeSectionId,
  newScene,
  getStatusColor,
  getSubsectionWordCount,
  getSectionWordCount,
  openAddSubsection,
  openEditSubsection,
  saveSubsection,
  deleteSubsection
} = useChapterSceneManager()

const selectedSectionId = ref(null)
const viewMode = ref('sections')
const filterStatus = ref('all')
const searchQuery = ref('')

const sortedSections = computed(() => manuscriptStore.sortedSections)
const subsectionsBySection = computed(() => manuscriptStore.subsectionsBySection)
const filteredSections = computed(() => {
  return sortedSections.value.filter(section => {
    const subsections = subsectionsBySection.value[section.id] || []
    const matchesSearch = searchQuery.value === '' || 
      section.title?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      subsections.some(s => s.title?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
                      s.summary?.toLowerCase().includes(searchQuery.value.toLowerCase()))
    const matchesStatus = filterStatus.value === 'all' || section.status === filterStatus.value
    return matchesSearch && matchesStatus
  })
})

const allSubsections = computed(() => {
  const subsections = []
  for (const section of sortedSections.value) {
    const sectionSubsections = subsectionsBySection.value[section.id] || []
    for (const subsection of sectionSubsections) {
      subsections.push({ ...subsection, sectionTitle: section.title, sectionOrder: section.order })
    }
  }
  return subsections.sort((a, b) => {
    if (a.sectionOrder !== b.sectionOrder) return a.sectionOrder - b.sectionOrder
    return (a.order || 0) - (b.order || 0)
  })
})

const dragOptions = {
  ...DRAG_OPTIONS,
  group: 'subsections'
}

function selectSection(sectionId) {
  selectedSectionId.value = selectedSectionId.value === sectionId ? null : sectionId
  if (manuscriptStore.activeSectionId === sectionId) {
    manuscriptStore.setActiveSection(null)
  } else {
    manuscriptStore.setActiveSection(sectionId)
  }
}

function onSubsectionDragEnd(sectionId) {
  endDrag()
  const subsectionIds = subsectionsBySection.value[sectionId]?.map(s => s.id) || []
  manuscriptStore.reorderSubsectionsData(subsectionIds, projectStore.currentProjectId)
}

function getSectionTotalSubsections(sectionId) {
  return subsectionsBySection.value[sectionId]?.length || 0
}

const selectedChapterId = selectedSectionId

function selectChapter(sectionId) {
  selectSection(sectionId)
}

function getSceneWordCount(scene) {
  return getSubsectionWordCount(scene)
}

function saveScene() {
  saveSubsection()
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
        <span class="font-spark text-accent tracking-wide">Subsection Outline</span>
        <div class="flex gap-2">
          <button
            v-for="mode in [{ value: 'sections', label: 'By Section' }, { value: 'list', label: 'List' }]"
            :key="mode.value"
            :class="[
              'px-2 py-1 text-xs rounded font-ui',
              viewMode === mode.value
                ? 'bg-accent/10 text-accent'
                : 'text-text-hint hover:text-text-secondary'
            ]"
            @click="viewMode = mode.value"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>
      
      <div class="flex gap-2">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search subsections..."
          class="flex-1 px-3 py-1.5 text-xs border border-border-subtle rounded bg-bg-tertiary text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <select
          v-model="filterStatus"
          class="px-2 py-1.5 text-xs border border-border-subtle rounded bg-bg-tertiary text-text-primary font-ui"
        >
          <option value="all">All Status</option>
          <option value="planning">Planning</option>
          <option value="drafting">Drafting</option>
          <option value="review">Under Review</option>
          <option value="final">Final</option>
        </select>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="sortedSections.length === 0" class="text-center py-12 space-y-4">
        <p class="text-text-hint font-ui text-sm">No sections yet. Create sections in Section Manager to organize your subsections.</p>
        <p class="text-xs text-text-hint font-ui">Tip: Press <kbd class="px-1.5 py-0.5 bg-bg-tertiary rounded text-[10px]">8</kbd> to open Section Manager</p>
      </div>

      <div v-else-if="viewMode === 'sections'" class="space-y-4">
        <div
          v-for="chapter in filteredSections"
          :key="chapter.id"
          class="bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden"
        >
          <div
            :class="[
              'p-3 cursor-pointer flex items-center justify-between hover:bg-surface-hover transition-colors',
              manuscriptStore.activeSectionId === chapter.id ? 'border-l-2 border-accent' : ''
            ]"
            @click="selectChapter(chapter.id)"
          >
            <div class="flex items-center gap-3">
              <span
                class="w-2 h-8 rounded-full"
                :style="{ backgroundColor: getStatusColor(chapter.status) }"
              ></span>
              <div>
                <div class="font-semibold text-text-primary font-ui">
                  {{ chapter.title || `Section ${chapter.order + 1}` }}
                </div>
                <div class="text-xs text-text-hint font-ui">
                  {{ getSectionTotalSubsections(chapter.id) }} subsections · {{ getSectionWordCount(chapter.id) }} words
                </div>
              </div>
            </div>
            <BaseIcon :name="selectedChapterId === chapter.id ? 'chevron-down' : 'chevron-right'" :size="16" class="text-text-hint" />
          </div>

              <div v-if="selectedSectionId === chapter.id" class="border-t border-border-subtle">
              <div class="p-2 bg-surface-hover flex justify-end">
                <button
                  class="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded font-ui"
                  @click="openAddSubsection(chapter.id)"
                >
                  + Add Subsection
                </button>
              </div>

              <draggable
                :list="subsectionsBySection[chapter.id]"
                item-key="id"
                v-bind="dragOptions"
                class="p-2 space-y-2 min-h-[50px]"
                @end="() => onSubsectionDragEnd(chapter.id)"
              >
              <template #item="{ element: scene }">
                <div
                  class="bg-bg-secondary rounded p-2 border border-border-subtle cursor-grab hover:border-accent/50 transition-colors group"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <BaseIcon name="grip-vertical" :size="14" class="text-text-hint cursor-grab" />
          <span
            class="text-sm font-medium font-ui cursor-pointer hover:text-accent"
            :class="manuscriptStore.activeSubsectionId === scene.id ? 'text-accent' : 'text-text-primary'"
            @click.stop="manuscriptStore.setActiveSubsection(scene.id); manuscriptStore.setActiveSection(scene.sectionId)"
          >{{ scene.title || 'Untitled' }}</span>
        </div>
        <div v-if="scene.summary" class="mt-1 text-xs text-text-hint font-ui pl-5">
                        {{ scene.summary.length > 80 ? scene.summary.slice(0, 80) + '...' : scene.summary }}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
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
                    </div>
                  </div>
                  <div class="mt-1 pl-5 text-[10px] text-text-hint font-ui">
                    {{ getSceneWordCount(scene) }} words
                  </div>
                </div>
              </template>
            </draggable>

              <div v-if="!subsectionsBySection[chapter.id]?.length" class="p-4 text-center">
                <p class="text-xs text-text-hint font-ui">Drag subsections here or click "Add Subsection"</p>
              </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="subsection in allSubsections"
          :key="subsection.id"
          class="bg-bg-tertiary rounded p-3 border border-border-subtle hover:border-accent/50 transition-colors cursor-pointer"
          @click="openEditSubsection(subsection)"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-accent font-ui">
              Sec. {{ subsection.sectionOrder + 1 }} · {{ subsection.sectionTitle }}
            </span>
            <span class="text-xs text-text-hint font-ui">
              {{ getSubsectionWordCount(subsection) }} words
            </span>
          </div>
          <div class="font-medium text-text-primary font-ui">{{ subsection.title || 'Untitled' }}</div>
          <div v-if="subsection.summary" class="mt-1 text-xs text-text-hint font-ui">
            {{ subsection.summary.length > 100 ? subsection.summary.slice(0, 100) + '...' : subsection.summary }}
          </div>
        </div>
      </div>
    </div>

    <Modal :show="showSceneModal" max-width="max-w-lg" @close="showSceneModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingScene ? 'Edit Subsection' : 'New Subsection' }}
        </h3>
        
        <div v-if="!editingScene" class="mb-3 text-xs text-text-hint font-ui">
          Adding to: {{ sortedSections.find(c => c.id === activeSectionId)?.title || 'Unknown Section' }}
        </div>

        <div class="mb-3">
              <label class="block text-xs text-text-hint font-ui mb-1">Subsection Title</label>
          <input
            v-model="newScene.title"
            type="text"
              placeholder="What happens in this subsection?"
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>

        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Summary / Beats</label>
          <textarea
            v-model="newScene.summary"
            rows="4"
              placeholder="Key beats and moments in this subsection..."
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
  </div>
</template>

<style scoped>
.ghost {
  opacity: 0.5;
  background: var(--vers-accent-primary);
}
.drag {
  opacity: 0.9;
}
</style>