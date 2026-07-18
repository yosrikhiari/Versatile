<script setup>
import { ref, computed, onMounted, watch, inject, nextTick } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVolumeStore } from '../../stores/volumeStore'
import {
  useSectionSchemaManager,
  SECTION_STATUSES
} from '../../composables/useSectionSchemaManager'
import { useDraggableList, DRAG_OPTIONS } from '../../composables/useDraggableList'
import { useNotifications } from '../../composables/useNotifications'

import Modal from '../shared/Modal.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import draggable from 'vuedraggable'
import SnapshotHistoryDrawer from './SnapshotHistoryDrawer.vue'
import TagInput from '../shared/TagInput.vue'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const volumeStore = useVolumeStore()
const { showConfirm } = useNotifications()
const { endDrag } = useDraggableList()

const {
  showSubsectionModal,
  newSubsection,
  editingSubsection,
  getStatusLabel,
  getSectionWordCount,
  openAddSubsection,
  openEditSubsection,
  saveSubsection,
  deleteSubsection
} = useSectionSchemaManager()

const showSectionModal = ref(false)
const editingSection = ref(null)
const newSection = ref({ title: '', summary: '', status: 'planning', tags: [] })

const showSnapshotDrawer = ref(false)
const snapshotSectionId = ref(null)
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
  return sortedSections.value.filter(
    (c) => c.tags && c.tags.some((t) => tagFilter.value.includes(t))
  )
})

function toggleTagFilter(tag) {
  if (tagFilter.value.includes(tag)) {
    tagFilter.value = tagFilter.value.filter((t) => t !== tag)
  } else {
    tagFilter.value = [...tagFilter.value, tag]
  }
}

const sortedSections = computed(() => manuscriptStore.sortedSections)
const subsectionsBySection = computed(() => manuscriptStore.subsectionsBySection)

const showVolumeModal = ref(false)
const editingVolume = ref(null)
const newVolume = ref({ title: '', description: '', color: '' })
const assignMode = ref(false)
const assignVolumeId = ref(null)
const expandedVolumes = ref(new Set())

const totalWordCount = computed(() => {
  let total = 0
  for (const section of sortedSections.value) {
    total += getSectionWordCount(section.id)
  }
  return total
})

const totalSubsectionCount = computed(() => {
  return Object.values(subsectionsBySection.value).reduce((sum, subs) => sum + subs.length, 0)
})

const sectionDragOptions = {
  ...DRAG_OPTIONS,
  group: 'sections'
}

const subsectionDragOptions = {
  ...DRAG_OPTIONS,
  group: 'subsections'
}

// The active section for expand/collapse
const activeSectionExpanded = ref(null)
const navigateTarget = inject('consistencyNavigateTarget', ref(null))

watch(navigateTarget, (target) => {
  if (!target) return
  activeSectionExpanded.value = target
  manuscriptStore.setActiveSection(target)
  nextTick(() => {
    document
      .getElementById('section-' + target)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
})

function openAddSection() {
  editingSection.value = null
  newSection.value = { title: '', summary: '', status: 'planning', tags: [] }
  showSectionModal.value = true
}

function openEditSection(section) {
  editingSection.value = section
  newSection.value = {
    title: section.title || '',
    summary: section.summary || '',
    status: section.status || 'planning',
    tags: section.tags ? [...section.tags] : []
  }
  showSectionModal.value = true
}

function saveSection() {
  if (!newSection.value.title.trim()) return

  if (editingSection.value) {
    manuscriptStore.updateSectionData(
      editingSection.value.id,
      newSection.value,
      projectStore.currentProjectId
    )
  } else {
    manuscriptStore.addSectionData(projectStore.currentProjectId, newSection.value)
  }

  showSectionModal.value = false
}

async function deleteSection(section) {
  if (
    await showConfirm(
      'Delete Section',
      `Delete "${section.title || 'Section ' + (section.order + 1)}"? This will also delete all subsections in this section.`,
      'Delete',
      'danger'
    )
  ) {
    manuscriptStore.deleteSectionData(section.id, projectStore.currentProjectId)
  }
}

function updateSectionOrder() {
  endDrag()
  const ids = sortedSections.value.map((s) => s.id)
  manuscriptStore.reorderSectionsData(ids, projectStore.currentProjectId)
}

function selectSection(sectionId) {
  activeSectionExpanded.value = activeSectionExpanded.value === sectionId ? null : sectionId
  if (manuscriptStore.activeSectionId === sectionId) {
    manuscriptStore.setActiveSection(null)
  } else {
    manuscriptStore.setActiveSection(sectionId)
  }
  manuscriptStore.setActiveSubsection(null)
}

function updateSubsectionOrder(sectionId) {
  endDrag()
  const subsectionIds = subsectionsBySection.value[sectionId]?.map((s) => s.id) || []
  manuscriptStore.reorderSubsectionsData(subsectionIds, projectStore.currentProjectId)
}

onMounted(() => {
  if (projectStore.currentProjectId) {
    manuscriptStore.loadManuscript(projectStore.currentProjectId)
    volumeStore.loadVolumes(projectStore.currentProjectId)
  }
})

watch(
  () => projectStore.currentProjectId,
  (newId) => {
    if (newId) {
      manuscriptStore.loadManuscript(newId)
      volumeStore.loadVolumes(newId)
    }
  }
)

function openSectionSnapshot(section) {
  snapshotSectionId.value = section.id
  showSnapshotDrawer.value = true
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
    color: volume.color || 'var(--vers-default-fallback)'
  }
  showVolumeModal.value = true
}

function saveVolume() {
  if (!newVolume.value.title.trim()) return

  if (editingVolume.value) {
    volumeStore.updateVolumeData(
      editingVolume.value.id,
      newVolume.value,
      projectStore.currentProjectId
    )
  } else {
    volumeStore.createVolume(projectStore.currentProjectId, newVolume.value)
  }

  showVolumeModal.value = false
}

async function deleteVolume(volume) {
  if (
    await showConfirm(
      'Delete Volume',
      `Delete "${volume.title}"? Sections will be unassigned from this volume.`,
      'Delete',
      'danger'
    )
  ) {
    volumeStore.deleteVolumeData(volume.id, projectStore.currentProjectId)
    manuscriptStore.loadManuscript(projectStore.currentProjectId)
  }
}

function toggleVolumeExpand(volumeId) {
  const set = new Set(expandedVolumes.value)
  if (set.has(volumeId)) {
    set.delete(volumeId)
  } else {
    set.add(volumeId)
  }
  expandedVolumes.value = set
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

async function assignSectionToVolume(sectionId) {
  if (!assignVolumeId.value || !projectStore.currentProjectId) return
  await volumeStore.assignSection(sectionId, assignVolumeId.value, projectStore.currentProjectId)
  manuscriptStore.updateSectionData(
    sectionId,
    { volumeId: assignVolumeId.value },
    projectStore.currentProjectId
  )
  assignMode.value = false
  assignVolumeId.value = null
}

function removeFromVolume(section) {
  volumeStore.removeSection(section.id, projectStore.currentProjectId)
  manuscriptStore.updateSectionData(section.id, { volumeId: null }, projectStore.currentProjectId)
}

function getSectionsInVolume(volumeId) {
  return sortedSections.value.filter((s) => s.volumeId === volumeId)
}

function getVolumeForSection(section) {
  if (!section.volumeId) return null
  return volumeStore.volumes.find((v) => v.id === section.volumeId) || null
}

function handleSubsectionClick(subsection) {
  manuscriptStore.setActiveSubsection(subsection.id)
  manuscriptStore.setActiveSection(subsection.sectionId)
}

function handleSnapshotDrawerClose() {
  showSnapshotDrawer.value = false
  snapshotSectionId.value = null
}

function handleSnapshotRestored(content) {
  if (snapshotSectionId.value !== null) {
    manuscriptStore.updateSectionData(
      snapshotSectionId.value,
      { content },
      projectStore.currentProjectId
    )
  }
  showSnapshotDrawer.value = false
  snapshotSectionId.value = null
}
</script>

<template>
  <div class="h-full flex flex-col bg-bg-primary overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
      <span class="font-ui text-accent tracking-wide">Section Manager</span>
      <button
        class="bg-bg-info text-text-info rounded-md text-xs px-3 py-1 font-medium hover:opacity-90"
        @click="openAddSection"
      >
        + Add Section
      </button>
    </div>

    <div
      v-if="allTags.length > 0"
      class="flex items-center gap-1.5 px-4 py-1.5 border-b border-border-subtle overflow-x-auto shrink-0"
    >
      <span class="text-xs text-text-hint font-ui shrink-0">Filter:</span>
      <button
        v-for="tag in allTags"
        :key="tag"
        :class="[
          'px-2 py-0.5 text-xs rounded-full font-ui shrink-0',
          tagFilter.includes(tag)
            ? 'btn-primary'
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

    <div
      class="flex items-center justify-between px-4 pt-2.5 pb-2 border-b border-border-subtle shrink-0"
    >
      <span class="text-xs font-medium text-text-secondary uppercase tracking-wider">Volumes</span>
      <button
        class="text-xs px-2.5 py-0.5 bg-transparent text-text-secondary border border-border-subtle rounded-md hover:bg-surface-hover"
        @click="openAddVolume"
      >
        + Add
      </button>
    </div>

    <div
      v-if="volumeStore.volumes.length > 0"
      class="px-3 pt-2 pb-1.5 border-b border-border-subtle space-y-1.5 shrink-0"
    >
      <div
        v-for="volume in volumeStore.volumes"
        :key="volume.id"
        class="bg-bg-secondary rounded-md overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-2.5 py-2 cursor-pointer"
          @click="toggleVolumeExpand(volume.id)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <BaseIcon
              :name="expandedVolumes.has(volume.id) ? 'chevron-down' : 'chevron-right'"
              :size="14"
              class="text-text-hint flex-shrink-0"
            />
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :style="{ background: volume.color || 'var(--vers-default-fallback)' }"
            ></span>
            <span class="text-sm font-medium text-text-primary">{{ volume.title }}</span>
            <span
              class="text-xs text-text-hint bg-bg-primary border border-border-subtle rounded-full px-2 py-0.5 whitespace-nowrap"
            >
              {{ getSectionsInVolume(volume.id).length }} sections
            </span>
          </div>
          <div class="flex items-center gap-0.5" @click.stop>
            <button
              class="p-1 text-text-hint hover:text-text-secondary rounded"
              title="Assign sections"
              :class="assignMode && assignVolumeId === volume.id ? 'bg-surface-hover text-accent' : ''"
              @click="toggleAssignMode(volume.id)"
            >
              <BaseIcon name="folder-plus" :size="14" />
            </button>
            <button
              class="p-1 text-text-hint hover:text-text-secondary rounded"
              title="Edit volume"
              @click="openEditVolume(volume)"
            >
              <BaseIcon name="pencil" :size="14" />
            </button>
            <button
              class="p-1 text-text-hint hover:text-danger rounded"
              title="Delete volume"
              @click="deleteVolume(volume)"
            >
              <BaseIcon name="trash-2" :size="14" />
            </button>
          </div>
        </div>

        <div
          v-if="expandedVolumes.has(volume.id)"
          class="border-t border-border-subtle px-3 py-2 space-y-1.5"
        >
          <div
            v-for="section in getSectionsInVolume(volume.id)"
            :key="section.id"
            class="flex items-center justify-between bg-bg-primary rounded px-2.5 py-1.5"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-sm text-text-primary font-medium">{{
                section.title || `Section ${section.order + 1}`
              }}</span>
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full bg-bg-secondary text-text-secondary"
                >{{ getStatusLabel(section.status) }}</span
              >
            </div>
            <button
              class="p-1 text-text-hint hover:text-danger rounded"
              title="Remove section from volume"
              @click="removeFromVolume(section)"
            >
              <BaseIcon name="x" :size="12" />
            </button>
          </div>
          <div v-if="getSectionsInVolume(volume.id).length === 0" class="text-center py-2">
            <p class="text-xs text-text-hint">No sections assigned</p>
          </div>
        </div>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 pt-3 pb-2">
      <p class="text-xs font-medium text-text-hint uppercase tracking-wider mx-1 mb-2">Sections</p>

      <div
        v-if="filteredSections.length === 0 && sortedSections.length > 0"
        class="text-center py-8"
      >
        <p class="text-text-hint font-ui text-sm mb-4">No sections match the selected tags.</p>
        <button
          class="px-4 py-2 btn-primary rounded-lg font-ui"
          @click="tagFilter = []"
        >
          Clear Filters
        </button>
      </div>
      <div v-else-if="filteredSections.length === 0" class="text-center py-8">
        <p class="text-text-hint font-ui text-sm mb-4">
          No sections yet. Start planning your document!
        </p>
        <button
          class="px-4 py-2 btn-primary rounded-lg font-ui"
          @click="openAddSection"
        >
          Add First Section
        </button>
      </div>

      <draggable
        :list="filteredSections"
        item-key="id"
        v-bind="sectionDragOptions"
        class="space-y-2"
        @end="updateSectionOrder"
      >
        <template #item="{ element: section }">
          <div
            :id="'section-' + section.id"
            :class="[
              'border border-border-subtle rounded-lg overflow-hidden',
              assignMode ? 'ring-2 ring-accent cursor-pointer' : ''
            ]"
          >
            <div
              :class="[
                'flex items-center gap-2.5 p-3 bg-bg-primary transition-colors',
                assignMode ? 'hover:bg-surface-hover' : 'hover:bg-surface-hover cursor-pointer',
                manuscriptStore.activeSectionId === section.id ? 'border-l-2 border-accent' : ''
              ]"
              @click="assignMode ? assignSectionToVolume(section.id) : selectSection(section.id)"
            >
              <BaseIcon
                name="grip-vertical"
                :size="14"
                class="text-text-hint flex-shrink-0 cursor-grab"
              />
              <span
                class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                :style="{
                  background: getVolumeForSection(section)?.color || 'var(--vers-default-other)'
                }"
              ></span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-text-primary">{{
                    section.title || `Section ${section.order + 1}`
                  }}</span>
                  <span
                    class="text-xs font-medium px-2 py-0.5 rounded-full bg-bg-secondary text-text-secondary"
                    >{{ getStatusLabel(section.status) }}</span
                  >
                </div>
                <div class="flex items-center gap-3 mt-0.5">
                  <span class="text-xs text-text-hint flex items-center gap-1">
                    <BaseIcon name="align-left" :size="12" class="flex-shrink-0" />
                    {{ getSectionWordCount(section.id) }} words
                  </span>
                  <span class="text-xs text-text-hint flex items-center gap-1">
                    <BaseIcon name="list" :size="12" class="flex-shrink-0" />
                    {{ subsectionsBySection[section.id]?.length || 0 }} subsections
                  </span>
                </div>
              </div>
              <BaseIcon
                :name="activeSectionExpanded === section.id ? 'chevron-down' : 'chevron-right'"
                :size="14"
                class="text-text-hint flex-shrink-0"
              />
            </div>

            <div
              v-if="activeSectionExpanded === section.id"
              class="border-t border-border-subtle bg-bg-secondary p-3"
            >
              <div class="flex flex-col gap-1.5 mb-2.5">
                <!-- Row 1: action buttons -->
                <div class="flex items-center gap-1">
                  <button
                    class="text-xs px-2.5 py-1 bg-bg-info text-text-info rounded-md font-medium hover:opacity-90"
                    @click="openAddSubsection(section.id)"
                  >
                    + Subsection
                  </button>
                  <button
                    class="text-xs px-2.5 py-1 bg-bg-primary text-text-secondary border border-border-subtle rounded-md hover:bg-surface-hover"
                    @click="openEditSection(section)"
                  >
                    Edit
                  </button>
                  <button
                    class="text-xs px-2.5 py-1 bg-bg-primary text-text-secondary border border-border-subtle rounded-md hover:bg-surface-hover"
                    @click="openSectionSnapshot(section)"
                  >
                    History
                  </button>
                  <button
                    v-if="section.volumeId"
                    class="text-xs px-2.5 py-1 bg-bg-primary text-text-secondary border border-border-subtle rounded-md hover:bg-surface-hover"
                    @click="removeFromVolume(section)"
                  >
                    Unassign
                  </button>
                </div>
                <!-- Row 2: destructive action, full width -->
                <button
                  class="w-full text-xs px-2.5 py-1 bg-bg-primary text-danger border border-border-subtle rounded-md hover:bg-surface-hover text-center"
                  @click="deleteSection(section)"
                >
                  Delete
                </button>
              </div>

              <draggable
                :list="subsectionsBySection[section.id]"
                item-key="id"
                v-bind="subsectionDragOptions"
                class="space-y-1.5 min-h-[40px]"
                @end="() => updateSubsectionOrder(section.id)"
              >
                <template #item="{ element: subsection }">
                  <div
                    class="flex items-center gap-2 px-2.5 py-2 bg-bg-primary border border-border-subtle rounded-md"
                  >
                    <BaseIcon
                      name="grip-vertical"
                      :size="13"
                      class="text-text-hint flex-shrink-0 cursor-grab"
                    />
                    <!-- prettier-ignore -->
                    <span
                      class="text-xs font-medium flex-1 min-w-0 cursor-pointer hover:text-accent"
                      :class="
                        manuscriptStore.activeSubsectionId === subsection.id
                          ? 'text-accent'
                          : 'text-text-primary'
                      "
                      @click="handleSubsectionClick(subsection)"
                      >{{ subsection.title || 'Untitled Subsection' }}</span
                    >
                    <button
                      class="bg-transparent border-none text-xs text-text-secondary cursor-pointer px-1.5 py-0.5 hover:text-text-primary"
                      @click="openEditSubsection(subsection)"
                    >
                      Edit
                    </button>
                    <button
                      class="bg-transparent border-none text-xs text-danger cursor-pointer px-1.5 py-0.5 hover:opacity-80"
                      title="Delete subsection"
                      @click="deleteSubsection(subsection)"
                    >
                      <BaseIcon name="x" :size="12" />
                    </button>
                  </div>
                </template>
              </draggable>

              <div v-if="!subsectionsBySection[section.id]?.length" class="text-center py-3">
                <p class="text-xs text-text-hint">
                  No subsections yet. Break down this section into subsections.
                </p>
              </div>
            </div>
          </div>
        </template>
      </draggable>

      <div
        v-if="sortedSections.length > 0"
        class="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between"
      >
        <span class="text-xs text-text-hint"
          >Total: {{ totalWordCount.toLocaleString() }} words</span
        >
        <span class="text-xs text-text-hint"
          >{{ sortedSections.length }} sections &middot;
          {{ totalSubsectionCount }} subsections</span
        >
      </div>
    </div>

    <Modal :show="showSectionModal" @close="showSectionModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingSection ? 'Edit Section' : 'Add Section' }}
        </h3>
        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Title</label>
          <input
            v-model="newSection.title"
            type="text"
            placeholder="Section title..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Summary</label>
          <textarea
            v-model="newSection.summary"
            rows="3"
            placeholder="Brief summary of what happens in this section..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent"
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
                newSection.status === status.value
                  ? 'text-white'
                  : 'border-border-subtle text-text-hint'
              ]"
              :style="newSection.status === status.value ? { backgroundColor: status.color } : {}"
              @click="newSection.status = status.value"
            >
              {{ status.label }}
            </button>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Tags</label>
          <TagInput v-model="newSection.tags" placeholder="Add tags, press Enter" />
        </div>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2 btn-primary rounded-lg font-ui"
            @click="saveSection"
          >
            {{ editingSection ? 'Save' : 'Add' }}
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showSectionModal = false"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>

    <Modal :show="showSubsectionModal" @close="showSubsectionModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">
          {{ editingSubsection ? 'Edit Subsection' : 'New Subsection' }}
        </h3>
        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Subsection Title</label>
          <input
            v-model="newSubsection.title"
            type="text"
            placeholder="Scene title..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Summary / Beats</label>
          <textarea
            v-model="newSubsection.summary"
            rows="4"
            placeholder="Key moments, beats, or summary of this scene..."
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent"
          ></textarea>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-text-hint font-ui mb-1">Tags</label>
          <TagInput v-model="newSubsection.tags" placeholder="Add tags, press Enter" />
        </div>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2 btn-primary rounded-lg font-ui"
            @click="saveSubsection"
          >
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

    <!-- prettier-ignore -->
    <SnapshotHistoryDrawer
      :show="showSnapshotDrawer"
      :chapter-id="snapshotSectionId"
      @close="handleSnapshotDrawerClose()"
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
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div class="mb-3">
          <label class="block text-xs text-text-hint font-ui mb-1">Description</label>
          <textarea
            v-model="newVolume.description"
            rows="2"
            placeholder="What is this volume about?"
            class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary font-ui resize-none focus:outline-none focus:ring-2 focus:ring-accent"
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
                newVolume.color === color ? 'border-text-primary scale-110' : 'border-transparent'
              ]"
              :style="{ backgroundColor: color }"
              @click="newVolume.color = color"
            ></button>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            class="flex-1 py-2 btn-primary rounded-lg font-ui"
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
