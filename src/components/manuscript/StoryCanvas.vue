<script setup>
import { ref, computed, onMounted } from 'vue'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useProjectStore } from '../../stores/projectStore'
import { useDraggableList, DRAG_OPTIONS } from '../../composables/useDraggableList'
import Modal from '../shared/Modal.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import draggable from 'vuedraggable'

const manuscriptStore = useManuscriptStore()
const projectStore = useProjectStore()
const { startDrag, endDrag } = useDraggableList()

const selectedElement = ref(null)
const showAddModal = ref(false)
const newElementTitle = ref('')
const newElementType = ref('chapter')

const elementTypes = [
  { value: 'section', label: 'Section', color: '#6366f1', iconName: 'book-open' },
  { value: 'character', label: 'Character', color: '#ec4899', iconName: 'user' },
  { value: 'location', label: 'Location', color: '#10b981', iconName: 'map-pin' },
  { value: 'plotpoint', label: 'Plot Point', color: '#f59e0b', iconName: 'zap' },
  { value: 'note', label: 'Note', color: '#8b5cf6', iconName: 'file-text' }
]

const storyDragOptions = {
  ...DRAG_OPTIONS,
  group: 'story-elements'
}

const canvasDragOptions = {
  ...DRAG_OPTIONS,
  group: { name: 'canvas', pull: 'clone', put: false }
}

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '12px',
  padding: '16px'
}))

function getElementIconName(type) {
  return elementTypes.find(t => t.value === type)?.iconName || 'file'
}

function getElementColor(type) {
  return elementTypes.find(t => t.value === type)?.color || '#6366f1'
}

function selectElement(element) {
  selectedElement.value = element
}

function addNewElement() {
  if (!newElementTitle.value.trim()) return
  
  const types = ['chapter', 'character', 'location', 'plotpoint', 'note']
  const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6']
  const randomType = types[Math.floor(Math.random() * types.length)]
  const randomColor = colors[Math.floor(Math.random() * colors.length)]
  
  manuscriptStore.addStoryElementData(projectStore.currentProjectId, {
    type: newElementType.value,
    title: newElementTitle.value,
    x: Math.random() * 100,
    y: Math.random() * 100,
    width: 200,
    height: 100,
    data: { color: randomColor }
  })
  
  newElementTitle.value = ''
  showAddModal.value = false
}

function updateElementPosition(element, index) {
  manuscriptStore.updateStoryElementData(element.id, {
    ...element,
    order: index
  })
}

function deleteElement(element) {
  if (confirm('Delete this element?')) {
    manuscriptStore.deleteStoryElementData(element.id, projectStore.currentProjectId)
    if (selectedElement.value?.id === element.id) {
      selectedElement.value = null
    }
  }
}

function getSectionsAsElements() {
  return manuscriptStore.sortedSections.map(s => ({
    id: `section-${s.id}`,
    type: 'section',
    title: s.title || `Section ${s.order + 1}`,
    data: { sectionId: s.id, status: s.status }
  }))
}

onMounted(() => {
  if (projectStore.currentProjectId) {
    manuscriptStore.loadManuscript(projectStore.currentProjectId)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
      <span class="font-spark text-accent tracking-wide">Story Canvas</span>
      <div class="flex gap-2">
        <button
          class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
          @click="showAddModal = true"
        >
          + Add Element
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <div class="mb-4 flex gap-2 flex-wrap">
        <button
          v-for="type in elementTypes"
          :key="type.value"
          :class="[
            'px-3 py-1 text-xs rounded-full border font-ui',
            newElementType === type.value
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border-subtle text-text-hint hover:border-text-hint'
          ]"
          :style="newElementType === type.value ? { borderColor: type.color } : {}"
          @click="newElementType = type.value"
        >
          {{ type.icon }} {{ type.label }}
        </button>
      </div>

      <div class="mb-4 p-3 bg-surface-hover rounded-lg">
        <div class="text-xs text-text-hint font-ui mb-2">Quick Add from Document</div>
        <draggable
          :list="manuscriptStore.sortedSections"
          item-key="id"
          v-bind="canvasDragOptions"
          :clone="(el) => ({ id: `section-${el.id}`, type: 'section', title: el.title || `Section ${el.order + 1}`, data: { sectionId: el.id } })"
          class="flex gap-2 flex-wrap"
        >
          <template #item="{ element }">
            <div
              class="px-3 py-2 bg-bg-tertiary rounded border border-border-subtle text-sm font-ui cursor-grab hover:border-accent/50"
            >
              📖 {{ element.title || `Section ${element.order + 1}` }}
            </div>
          </template>
        </draggable>
      </div>

      <div class="text-xs text-text-hint font-ui mb-3">Drag elements to reorder</div>

      <draggable
        :list="manuscriptStore.storyElements"
        item-key="id"
        v-bind="storyDragOptions"
        :style="gridStyle"
        class="min-h-[200px]"
      >
        <template #item="{ element }">
          <div
            :class="[
              'p-3 rounded-lg border-2 cursor-pointer transition-all',
              selectedElement?.id === element.id
                ? 'border-accent shadow-lg scale-[1.02]'
                : 'border-border-subtle hover:border-accent/50'
            ]"
            :style="{ borderLeftColor: getElementColor(element.type), borderLeftWidth: '4px' }"
            @click="selectElement(element)"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2">
                <BaseIcon :name="getElementIconName(element.type)" :size="18" :style="{ color: getElementColor(element.type) }" />
                <span class="font-semibold text-sm text-text-primary font-ui">{{ element.title }}</span>
              </div>
              <button
                class="text-text-hint hover:text-danger"
                title="Delete element"
                @click.stop="deleteElement(element)"
              >
                <BaseIcon name="x" :size="14" />
              </button>
            </div>
            <div class="mt-2 text-xs text-text-hint capitalize font-ui">
              {{ element.type === 'section' ? 'section' : element.type }}
            </div>
          </div>
        </template>
      </draggable>

      <div v-if="manuscriptStore.storyElements.length === 0" class="text-center py-12">
        <p class="text-text-hint font-ui text-sm">No elements yet. Add elements or drag chapters from above.</p>
      </div>
    </div>

    <Modal :show="showAddModal" @close="showAddModal = false">
      <div class="p-6">
        <h3 class="text-lg font-semibold text-text-primary mb-4 font-ui">Add Story Element</h3>
        <input
          v-model="newElementTitle"
          type="text"
          placeholder="Element title..."
          class="w-full px-3 py-2 border border-border-subtle rounded-lg mb-4 bg-bg-secondary text-text-primary font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
          @keyup.enter="addNewElement"
        />
        <div class="flex gap-2 mb-4">
          <button
            v-for="type in elementTypes"
            :key="type.value"
            :class="[
              'flex-1 px-2 py-1 text-xs rounded border font-ui',
              newElementType === type.value
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-subtle text-text-hint'
            ]"
            @click="newElementType = type.value"
          >
            {{ type.icon }}
          </button>
        </div>
        <div class="flex gap-2">
          <button
            :disabled="!newElementTitle.trim()"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 font-ui"
            @click="addNewElement"
          >
            Add
          </button>
          <button
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
            @click="showAddModal = false"
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
  border-radius: 8px;
}
.drag {
  opacity: 0.9;
  transform: rotate(2deg);
}
</style>