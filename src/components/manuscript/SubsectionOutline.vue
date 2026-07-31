<script setup>
import { ref, computed, onMounted } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSectionSchemaManager } from '../../composables/useSectionSchemaManager'
import { useDraggableList, DRAG_OPTIONS } from '../../composables/useDraggableList'
import Modal from '../shared/Modal.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseStatusDot from '../ui/BaseStatusDot.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
import BaseChip from '../ui/BaseChip.vue'
import draggable from 'vuedraggable'
import EmptyState from '../shared/EmptyState.vue'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const { endDrag } = useDraggableList()

const {
  editingSubsection,
  showSubsectionModal,
  activeSectionId,
  newSubsection,
  SECTION_STATUSES,
  getStatusColor,
  getStatusLabel,
  getStatusShape,
  getSubsectionWordCount,
  getSectionWordCount,
  openAddSubsection,
  openEditSubsection,
  saveSubsection,
  deleteSubsection
} = useSectionSchemaManager()

const selectedSectionId = ref(null)
const viewMode = ref('sections')
const filterStatus = ref('all')
const searchQuery = ref('')

const sortedSections = computed(() => manuscriptStore.sortedSections)
const subsectionsBySection = computed(() => manuscriptStore.subsectionsBySection)
const filteredSections = computed(() => {
  return sortedSections.value.filter((section) => {
    const subsections = subsectionsBySection.value[section.id] || []
    const matchesSearch =
      searchQuery.value === '' ||
      section.title?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      subsections.some(
        (s) =>
          s.title?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
          s.summary?.toLowerCase().includes(searchQuery.value.toLowerCase())
      )
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
  const subsectionIds = subsectionsBySection.value[sectionId]?.map((s) => s.id) || []
  manuscriptStore.reorderSubsectionsData(subsectionIds, projectStore.currentProjectId)
}

function getSectionTotalSubsections(sectionId) {
  return subsectionsBySection.value[sectionId]?.length || 0
}

function handleSubsectionClick(subsection) {
  manuscriptStore.setActiveSubsection(subsection.id)
  manuscriptStore.setActiveSection(subsection.sectionId)
}

onMounted(() => {
  if (projectStore.currentProjectId) {
    manuscriptStore.loadManuscript(projectStore.currentProjectId)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary overflow-hidden">
    <div class="px-4 py-3 border-b border-border-subtle">
      <div class="flex items-center justify-between mb-3 gap-2">
        <span class="font-ui text-accent tracking-wide">Subsection Outline</span>
        <BaseSegmented
          v-model="viewMode"
          size="sm"
          aria-label="Outline view"
          :options="[
            { value: 'sections', label: 'By Section' },
            { value: 'list', label: 'List' }
          ]"
        />
      </div>

      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search subsections..."
        class="w-full px-3 py-1.5 text-xs border border-border-subtle rounded-lg bg-bg-tertiary text-text-primary font-ui focus:outline-none focus:border-accent"
      />

      <!--
        The status filter was a <select>, which hid four of its five options and
        gave no sense of what was being filtered out. Five short, mutually
        exclusive values are worth showing at rest.
      -->
      <div class="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter sections by status">
        <BaseChip
          variant="filter"
          size="md"
          :active="filterStatus === 'all'"
          @click="filterStatus = 'all'"
        >
          All
        </BaseChip>
        <BaseChip
          v-for="status in SECTION_STATUSES"
          :key="status.value"
          variant="filter"
          size="md"
          :active="filterStatus === status.value"
          @click="filterStatus = status.value"
        >
          {{ status.label }}
        </BaseChip>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
      <EmptyState
        v-if="sortedSections.length === 0"
        icon="folder-plus"
        title="No sections yet"
        description="Create sections in Section Manager to organize your subsections."
      >
        <p class="text-xs text-text-hint font-ui mt-1">
          Tip: Press <kbd class="px-1.5 py-0.5 bg-bg-tertiary rounded text-2xs">8</kbd> to open
          Section Manager
        </p>
      </EmptyState>

      <div v-else-if="viewMode === 'sections'" class="space-y-4">
        <div
          v-for="section in filteredSections"
          :key="section.id"
          class="bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden"
        >
          <!--
            Active state was `border-l-2 border-accent`, which both nudged the
            row's contents 2px sideways as it toggled and reached for the chunky
            coloured rail the rest of the app avoids. Same inset marker the
            sidebar uses, so selection reads identically in both places.
          -->
          <div
            :class="[
              'relative p-3 cursor-pointer flex items-center justify-between hover:bg-surface-hover transition-colors',
              manuscriptStore.activeSectionId === section.id ? 'bg-accent/8' : ''
            ]"
            @click="selectSection(section.id)"
          >
            <span
              v-if="manuscriptStore.activeSectionId === section.id"
              class="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-sm bg-accent"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <div class="font-semibold text-text-primary font-ui truncate">
                {{ section.title || `Section ${section.order + 1}` }}
              </div>
              <!-- Status used to be an 8px colour bar and nothing else, so it
                   was unreadable to anyone who could not tell the hues apart.
                   The dot now scans, and the word carries the meaning. -->
              <div class="flex items-center gap-2 text-xs text-text-hint font-ui">
                <BaseStatusDot
                  :color="getStatusColor(section.status)"
                  :shape="getStatusShape(section.status)"
                  :label="getStatusLabel(section.status)"
                  size="sm"
                />
                <span aria-hidden="true">·</span>
                <span>
                  {{ getSectionTotalSubsections(section.id) }} subsections ·
                  {{ getSectionWordCount(section.id) }} words
                </span>
              </div>
            </div>
            <BaseIcon
              :name="selectedSectionId === section.id ? 'chevron-down' : 'chevron-right'"
              :size="16"
              class="text-text-hint"
            />
          </div>

          <div v-if="selectedSectionId === section.id" class="border-t border-border-subtle">
            <div class="p-2 bg-surface-hover flex justify-end">
              <button
                class="px-2 py-1 text-xs text-accent hover:bg-surface-hover rounded font-ui"
                @click="openAddSubsection(section.id)"
              >
                + Add Subsection
              </button>
            </div>

            <draggable
              :list="subsectionsBySection[section.id]"
              item-key="id"
              v-bind="dragOptions"
              class="p-2 space-y-2 min-h-[50px]"
              @end="() => onSubsectionDragEnd(section.id)"
            >
              <template #item="{ element: subsection }">
                <div
                  class="bg-bg-secondary rounded p-2 border border-border-subtle cursor-grab hover:border-accent transition-colors group"
                >
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <BaseIcon
                          name="grip-vertical"
                          :size="14"
                          class="text-text-hint cursor-grab"
                        />
                        <!-- prettier-ignore -->
                        <span
                          class="text-sm font-medium font-ui cursor-pointer hover:text-accent"
                          :class="
                            manuscriptStore.activeSubsectionId === subsection.id
                              ? 'text-accent'
                              : 'text-text-primary'
                          "
                          @click.stop="handleSubsectionClick(subsection)"
                          >{{ subsection.title || 'Untitled' }}</span
                        >
                      </div>
                      <div
                        v-if="subsection.summary"
                        class="mt-1 text-xs text-text-hint font-ui pl-5"
                      >
                        {{
                          subsection.summary.length > 80
                            ? subsection.summary.slice(0, 80) + '...'
                            : subsection.summary
                        }}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        class="px-2 py-1 text-xs text-text-hint hover:text-text-secondary font-ui"
                        title="Edit subsection"
                        @click="openEditSubsection(subsection)"
                      >
                        Edit
                      </button>
                      <button
                        class="px-2 py-1 text-xs text-danger hover:bg-surface-hover font-ui"
                        title="Delete subsection"
                        @click="deleteSubsection(subsection)"
                      >
                        <BaseIcon name="x" :size="12" />
                      </button>
                    </div>
                  </div>
                  <div class="mt-1 pl-5 text-2xs text-text-hint font-ui">
                    {{ getSubsectionWordCount(subsection) }} words
                  </div>
                </div>
              </template>
            </draggable>

            <div v-if="!subsectionsBySection[section.id]?.length" class="p-4 text-center">
              <p class="text-xs text-text-hint font-ui">
                Drag subsections here or click "Add Subsection"
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="subsection in allSubsections"
          :key="subsection.id"
          class="bg-bg-tertiary rounded p-3 border border-border-subtle hover:border-accent transition-colors cursor-pointer"
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
          <div class="font-medium text-text-primary font-ui">
            {{ subsection.title || 'Untitled' }}
          </div>
          <div v-if="subsection.summary" class="mt-1 text-xs text-text-hint font-ui">
            {{
              subsection.summary.length > 100
                ? subsection.summary.slice(0, 100) + '...'
                : subsection.summary
            }}
          </div>
        </div>
      </div>
    </div>

    <Modal :show="showSubsectionModal" max-width="max-w-lg" @close="showSubsectionModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingSubsection ? 'Edit Subsection' : 'New Subsection' }}
        </h3>

        <div v-if="!editingSubsection" class="mb-3 text-xs text-text-hint font-ui">
          Adding to:
          {{ sortedSections.find((s) => s.id === activeSectionId)?.title || 'Unknown Section' }}
        </div>

        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Subsection Title</label>
          <input
            v-model="newSubsection.title"
            type="text"
            placeholder="What happens in this subsection?"
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Summary / Beats</label>
          <textarea
            v-model="newSubsection.summary"
            rows="4"
            placeholder="Key beats and moments in this subsection..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent"
          ></textarea>
        </div>

        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Draft Content (optional)</label>
          <textarea
            v-model="newSubsection.content"
            rows="8"
            placeholder="Write the subsection here..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent"
          ></textarea>
        </div>

        <div class="flex gap-2">
          <button class="flex-1 py-2 btn-primary rounded-lg font-ui" @click="saveSubsection">
            {{ editingSubsection ? 'Save' : 'Add' }}
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showSubsectionModal = false"
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
