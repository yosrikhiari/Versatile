<script setup>
import { ref, watch } from 'vue'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import { enhancePlotThread, enhanceSingleField } from '../../composables/useOllama'
import { useManuscriptContext } from '../../composables/useManuscriptContext'
import { useNotifications } from '../../composables/useNotifications'
import draggable from 'vuedraggable'
import BaseIcon from '../shared/BaseIcon.vue'
const props = defineProps({
  threads: {
    type: Array,
    default: () => []
  }
})

const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()
const { getSectionContext } = useManuscriptContext()
const { showConfirm } = useNotifications()

const expandedThreadId = ref(null)
const editingThread = ref(null)
const isGenerating = ref(null)
const generatingField = ref(null)
const contextSelector = ref('current')
const showExtractionDialog = ref(false)
const extractedEntities = ref({ characters: [], locations: [] })
const enhanceError = ref('')

const columns = [
  { status: 'open', label: 'Open' },
  { status: 'inprogress', label: 'In Progress' },
  { status: 'resolved', label: 'Resolved' }
]

const openThreads = ref([])
const inprogressThreads = ref([])
const resolvedThreads = ref([])

watch(() => props.threads, (newThreads) => {
  openThreads.value = newThreads.filter(t => t.status === 'open')
  inprogressThreads.value = newThreads.filter(t => t.status === 'inprogress')
  resolvedThreads.value = newThreads.filter(t => t.status === 'resolved')
}, { immediate: true, deep: true })

const threadsByColumn = {
  open: openThreads,
  inprogress: inprogressThreads,
  resolved: resolvedThreads
}

function getColumnThreads(status) {
  return threadsByColumn[status]?.value || []
}

const dragOptions = {
  animation: 150,
  group: { name: 'threads', pull: true, put: true },
  ghostClass: 'ghost',
  dragClass: 'drag'
}

function toggleExpand(thread) {
  if (expandedThreadId.value === thread.id) {
    expandedThreadId.value = null
    editingThread.value = null
  } else {
    expandedThreadId.value = thread.id
    editingThread.value = { ...thread }
  }
}

async function saveThread() {
  if (!projectStore.currentProjectId || !editingThread.value) return
  await storyBibleStore.updatePlotThreadData(
    editingThread.value.id,
    { title: editingThread.value.title, notes: editingThread.value.notes },
    projectStore.currentProjectId
  )
  expandedThreadId.value = null
  editingThread.value = null
}

async function deleteThread(thread) {
  if (!projectStore.currentProjectId) return
  if (await showConfirm('Delete Plot Thread', `Delete "${thread.title}"?`, 'Delete', 'danger')) {
    await storyBibleStore.deletePlotThreadData(thread.id, projectStore.currentProjectId)
  }
}

async function syncStatusChanges() {
  if (!projectStore.currentProjectId) return
  
  const updates = []
  
  for (const thread of openThreads.value) {
    if (thread.status !== 'open') {
      updates.push({ id: thread.id, status: 'open' })
    }
  }
  
  for (const thread of inprogressThreads.value) {
    if (thread.status !== 'inprogress') {
      updates.push({ id: thread.id, status: 'inprogress' })
    }
  }
  
  for (const thread of resolvedThreads.value) {
    if (thread.status !== 'resolved') {
      updates.push({ id: thread.id, status: 'resolved' })
    }
  }
  
  for (const update of updates) {
    await storyBibleStore.updatePlotThreadData(update.id, { status: update.status }, projectStore.currentProjectId)
  }
}

async function getContext() {
  if (contextSelector.value === 'none') return null
  return await getSectionContext(contextSelector.value, 'plotThread')
}

async function completeAllWithAI() {
  if (!projectStore.currentProjectId || !editingThread.value || isGenerating.value) return
  
  enhanceError.value = ''
  isGenerating.value = editingThread.value.id
  try {
    const context = await getContext()
    const result = await enhancePlotThread(editingThread.value, context)
    
    if (result) {
      editingThread.value = { ...editingThread.value, ...result }
      await storyBibleStore.updatePlotThreadData(
        editingThread.value.id,
        { title: editingThread.value.title, notes: editingThread.value.notes },
        projectStore.currentProjectId
      )
      
      parseEntitiesFromNotes(editingThread.value.notes)
      
      if (extractedEntities.value.characters.length > 0 || extractedEntities.value.locations.length > 0) {
        showExtractionDialog.value = true
      }
    }
  } catch (error) {
    enhanceError.value = error.message || 'Failed to enhance plot thread'
  } finally {
    isGenerating.value = null
  }
}

function parseEntitiesFromNotes(notes) {
  const characters = []
  const locations = []
  
  const charsMatch = notes?.match(/\[Characters:\s*([^\]]+)\]/)
  if (charsMatch && charsMatch[1]) {
    const names = charsMatch[1].split(/[,;]/).map(n => n.trim()).filter(n => n && n.length > 1 && n.toLowerCase() !== 'none')
    characters.push(...names)
  }
  
  const locsMatch = notes?.match(/\[Locations:\s*([^\]]+)\]/)
  if (locsMatch && locsMatch[1]) {
    const names = locsMatch[1].split(/[,;]/).map(n => n.trim()).filter(n => n && n.length > 1 && n.toLowerCase() !== 'none')
    locations.push(...names)
  }
  
  const existingChars = storyBibleStore.characters || []
  const existingLocs = storyBibleStore.locations || []
  
  extractedEntities.value = {
    characters: characters.map(name => {
      const existing = existingChars.find(c => c.name?.toLowerCase() === name.toLowerCase())
      return { name, isNew: !existing, id: existing?.id }
    }),
    locations: locations.map(name => {
      const existing = existingLocs.find(l => l.name?.toLowerCase() === name.toLowerCase())
      return { name, isNew: !existing, id: existing?.id }
    })
  }
}

async function completeFieldWithAI(fieldKey) {
  if (!editingThread.value || isGenerating.value || generatingField.value) return
  
  enhanceError.value = ''
  isGenerating.value = editingThread.value.id
  generatingField.value = fieldKey
  try {
    const context = await getContext()
    
    const result = await enhanceSingleField(
      'plotThread',
      fieldKey,
      editingThread.value[fieldKey] || '',
      editingThread.value,
      context
    )
    
    if (result) {
      editingThread.value[fieldKey] = result
      await storyBibleStore.updatePlotThreadData(
        editingThread.value.id,
        { title: editingThread.value.title, notes: editingThread.value.notes },
        projectStore.currentProjectId
      )
      
      if (fieldKey === 'notes') {
        parseEntitiesFromNotes(editingThread.value.notes)
        if (extractedEntities.value.characters.length > 0 || extractedEntities.value.locations.length > 0) {
          showExtractionDialog.value = true
        }
      }
    }
  } catch (error) {
    enhanceError.value = error.message || 'Failed to enhance field'
  } finally {
    isGenerating.value = null
    generatingField.value = null
  }
}

function scanForEntities() {
  if (!editingThread.value?.notes) {
    alert('Please add some notes to the plot thread first.')
    return
  }
  
  const notes = editingThread.value.notes
  const characters = []
  const locations = []
  
  const hasStructuredInput = /\[Characters:|\[Locations:/.test(notes)
  
  if (!hasStructuredInput) {
    alert('Scan only works with structured input.\n\nUse AI generation to automatically include characters and locations.\n\nOr manually add structured sections like:\n\n[Characters: Marcus, Elena]\n[Locations: The Tavern, The Forest]')
    return
  }
  
  const charsMatch = notes.match(/\[Characters:\s*([^\]]+)\]/)
  if (charsMatch && charsMatch[1]) {
    const names = charsMatch[1].split(/[,;]/).map(n => n.trim()).filter(n => n && n.length > 1 && n.toLowerCase() !== 'none')
    characters.push(...names)
  }
  
  const locsMatch = notes.match(/\[Locations:\s*([^\]]+)\]/)
  if (locsMatch && locsMatch[1]) {
    const names = locsMatch[1].split(/[,;]/).map(n => n.trim()).filter(n => n && n.length > 1 && n.toLowerCase() !== 'none')
    locations.push(...names)
  }
  
  if (characters.length === 0 && locations.length === 0) {
    alert('No valid characters or locations found in the structured blocks.\n\nMake sure your sections look like:\n[Characters: Marcus, Elena]\n[Locations: The Tavern]')
    return
  }
  
  const existingChars = storyBibleStore.characters || []
  const existingLocs = storyBibleStore.locations || []
  
  extractedEntities.value = {
    characters: characters.map(name => {
      const existing = existingChars.find(c => c.name?.toLowerCase() === name.toLowerCase())
      return { name, isNew: !existing, id: existing?.id }
    }),
    locations: locations.map(name => {
      const existing = existingLocs.find(l => l.name?.toLowerCase() === name.toLowerCase())
      return { name, isNew: !existing, id: existing?.id }
    })
  }
  
  showExtractionDialog.value = true
}


</script>

<template>
  <div class="space-y-4">
    <div 
      v-for="column in columns" 
      :key="column.status"
      class="rounded-lg p-3"
      :class="column.status === 'open' ? 'bg-bg-tertiary' : column.status === 'inprogress' ? 'bg-accent-muted/20' : 'bg-success/10'"
    >
      <div class="text-xs font-medium text-text-secondary mb-2 flex items-center justify-between">
        <span>{{ column.label }}</span>
        <span class="text-text-hint">({{ getColumnThreads(column.status).length }})</span>
      </div>
      
      <draggable
        :list="threadsByColumn[column.status].value"
        item-key="id"
        v-bind="dragOptions"
        class="space-y-2 min-h-[80px] rounded"
        @end="syncStatusChanges"
      >
        <template #item="{ element: thread }">
          <div 
            class="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden"
          >
            <div 
              class="p-2 cursor-pointer hover:bg-surface-hover transition-colors"
              :class="{ 'bg-surface-hover': expandedThreadId === thread.id }"
              @click="toggleExpand(thread)"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-text-primary truncate flex items-center gap-2">
                    <BaseIcon name="grip-vertical" :size="14" class="text-text-hint cursor-grab" />
                    {{ thread.title }}
                  </div>
                  <div v-if="thread.notes && expandedThreadId !== thread.id" class="text-[10px] text-text-hint truncate mt-0.5 ml-5">
                    {{ thread.notes }}
                  </div>
                </div>
                <BaseIcon :name="expandedThreadId === thread.id ? 'chevron-down' : 'chevron-right'" :size="14" class="text-text-hint ml-2" />
              </div>
            </div>

            <div v-if="expandedThreadId === thread.id" class="p-3 border-t border-border-subtle bg-bg-tertiary space-y-3">
              <div class="flex items-center gap-2">
                <button
                  :disabled="isGenerating === editingThread?.id"
                  class="flex items-center gap-1.5 px-2 py-1 text-xs bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors disabled:opacity-50"
                  @click.stop="completeAllWithAI"
                >
                  <BaseIcon v-if="isGenerating === editingThread?.id && !generatingField" name="loader-2" :size="10" class="animate-spin" />
                  <BaseIcon v-else name="sparkles" :size="10" />
                  Complete with AI
                </button>
                
                <select
                  v-model="contextSelector"
                  class="flex-1 px-2 py-1 text-xs bg-bg-secondary border border-border-subtle rounded text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  <option value="current">Current chapter</option>
                  <option value="last:3">Last 3 chapters</option>
                  <option value="last:5">Last 5 chapters</option>
                  <option value="all">All chapters</option>
                  <option value="none">No context</option>
                </select>
              </div>
              
              <div v-if="enhanceError" class="p-2 bg-danger/10 border border-danger/20 rounded text-xs text-danger">
                {{ enhanceError }}
              </div>
              
              <div class="relative">
                <div class="flex items-center justify-between mb-1">
                  <label class="text-[10px] uppercase tracking-wider text-text-hint">Title</label>
                  <button
                    :disabled="isGenerating === editingThread?.id"
                    :title="editingThread?.title ? 'Regenerate with AI' : 'Complete with AI'"
                    class="p-1 text-text-hint hover:text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
                    @click.stop="completeFieldWithAI('title')"
                  >
                    <BaseIcon 
                      :name="generatingField === 'title' ? 'loader-2' : 'sparkles'" 
                      :size="10" 
                      :class="{ 'animate-spin': generatingField === 'title' }"
                    />
                  </button>
                </div>
                <input
                  v-model="editingThread.title"
                  type="text"
                  class="w-full px-2 py-1 text-sm border border-border-subtle rounded bg-bg-secondary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              
              <div class="relative">
                <div class="flex items-center justify-between mb-1">
                  <label class="text-[10px] uppercase tracking-wider text-text-hint">Notes</label>
                  <div class="flex items-center gap-1">
                    <button
                      title="Extract entities (works with [Characters:] [Locations:] blocks)"
                      class="p-1 text-text-hint hover:text-accent hover:bg-accent/10 rounded transition-colors"
                      @click="scanForEntities"
                    >
                      <BaseIcon name="scan" :size="10" />
                    </button>
                    <button
                      :disabled="isGenerating === editingThread?.id"
                      :title="editingThread?.notes ? 'Regenerate with AI' : 'Complete with AI'"
                      class="p-1 text-text-hint hover:text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
                      @click.stop="completeFieldWithAI('notes')"
                    >
                      <BaseIcon 
                        :name="generatingField === 'notes' ? 'loader-2' : 'sparkles'" 
                        :size="10" 
                        :class="{ 'animate-spin': generatingField === 'notes' }"
                      />
                    </button>
                  </div>
                </div>
                <textarea
                  v-model="editingThread.notes"
                  rows="2"
                  class="w-full px-2 py-1 text-sm border border-border-subtle rounded bg-bg-secondary text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Add notes..."
                ></textarea>
              </div>
              
              <div class="flex gap-2">
                <button
                  class="flex-1 py-1 text-xs bg-accent text-white rounded hover:bg-accent/90 font-ui"
                  @click.stop="saveThread"
                >
                  Save
                </button>
                <button
                  class="px-3 py-1 text-xs text-danger hover:bg-danger/10 rounded font-ui"
                  @click.stop="deleteThread(thread)"
                >
                  Delete
                </button>
                <button
                  class="px-3 py-1 text-xs text-text-hint hover:bg-surface-hover rounded font-ui"
                  @click.stop="toggleExpand(thread)"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </template>

        <template #footer>
          <div 
            v-if="getColumnThreads(column.status).length === 0"
            class="border-2 border-dashed border-border-subtle rounded-lg p-4 text-center text-xs text-text-hint"
          >
            Drop threads here
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>

<EntityExtractionDialog
  :show="showExtractionDialog"
  :extracted-entities="extractedEntities"
  @close="showExtractionDialog = false"
  @create-entities="handleCreateEntities"
/>

<style scoped>
.ghost {
  opacity: 0.5;
  background: var(--vers-accent-primary);
  border-radius: 8px;
}
.drag {
  opacity: 0.9;
  transform: rotate(2deg);
}
</style>
