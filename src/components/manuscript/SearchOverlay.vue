<script setup>
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  editor: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const searchQuery = ref('')
const currentMatchIndex = ref(0)
const totalMatches = ref(0)
const inputRef = ref(null)
const isSearching = ref(false)

const matches = computed(() => {
  if (!props.editor || !searchQuery.value.trim()) return []
  return findAllMatches(props.editor, searchQuery.value)
})

function findAllMatches(editor, query) {
  const results = []
  const doc = editor.state.doc
  const searchText = query.toLowerCase()
  
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase()
      let index = 0
      while ((index = text.indexOf(searchText, index)) !== -1) {
        const from = pos + index
        results.push({ from, to: from + query.length })
        index++
      }
    }
  })
  
  return results
}

function clearHighlights() {
  if (!props.editor) return
  const { state } = props.editor
  const { tr } = state
  
  state.doc.descendants((node, pos) => {
    if (node.marks && node.marks.some(m => m.type.name === 'highlight')) {
      tr.removeMark(pos, pos + node.nodeSize, props.editor.schema.marks.highlight)
    }
  })
  
  props.editor.dispatch(tr)
}

function highlightMatches() {
  if (!props.editor || matches.value.length === 0) return
  
  clearHighlights()
  
  const { state } = props.editor
  const { tr } = state
  const markType = props.editor.schema.marks.highlight
  
  if (!markType) {
    console.warn('Highlight mark not available')
    return
  }
  
  matches.value.forEach(match => {
    tr.addMark(match.from, match.to, markType.create())
  })
  
  props.editor.dispatch(tr)
}

function goToMatch(index) {
  if (!props.editor || matches.value.length === 0) return
  
  currentMatchIndex.value = index
  const match = matches.value[index]
  
  props.editor.dispatch(
    props.editor.state.tr.setSelection(
      props.editor.state.selection.constructor.near(
        props.editor.state.doc.resolve(match.from)
      )
    )
  )
  
  props.editor.commands.scrollIntoView()
}

function handlePrev() {
  if (matches.value.length === 0) return
  const newIndex = currentMatchIndex.value > 0 
    ? currentMatchIndex.value - 1 
    : matches.value.length - 1
  goToMatch(newIndex)
}

function handleNext() {
  if (matches.value.length === 0) return
  const newIndex = currentMatchIndex.value < matches.value.length - 1 
    ? currentMatchIndex.value + 1 
    : 0
  goToMatch(newIndex)
}

function handleClose() {
  clearHighlights()
  emit('close')
}

watch(searchQuery, async () => {
  await nextTick()
  totalMatches.value = matches.value.length
  currentMatchIndex.value = 0
  
  if (matches.value.length > 0) {
    highlightMatches()
    goToMatch(0)
  } else {
    clearHighlights()
  }
})

function handleKeydown(e) {
  if (e.key === 'Escape') {
    handleClose()
  } else if (e.key === 'Enter') {
    if (e.shiftKey) {
      handlePrev()
    } else {
      handleNext()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    handlePrev()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    handleNext()
  }
}

onMounted(() => {
  nextTick(() => {
    inputRef.value?.focus()
  })
})
</script>

<template>
  <div 
    class="fixed top-0 left-0 right-0 z-50 bg-bg-secondary border-b border-border-subtle px-4 py-2 flex items-center gap-3"
    @keydown="handleKeydown"
  >
    <div class="flex items-center gap-2 flex-1">
      <BaseIcon name="search" :size="16" class="text-text-hint" />
      <input
        ref="inputRef"
        v-model="searchQuery"
        type="text"
        placeholder="Search manuscript..."
        class="flex-1 bg-transparent text-text-primary text-sm focus:outline-none placeholder:text-text-hint"
      />
    </div>
    
    <div class="flex items-center gap-2 text-xs text-text-muted">
      <span v-if="matches.length > 0">
        {{ currentMatchIndex + 1 }} of {{ matches.length }}
      </span>
      <span v-else-if="searchQuery">No results</span>
    </div>
    
    <div class="flex items-center gap-1">
      <button 
        :disabled="matches.length === 0"
        class="p-1 hover:bg-bg-tertiary rounded disabled:opacity-50"
        title="Previous (Shift+Enter)"
        @click="handlePrev"
      >
        <BaseIcon name="chevron-up" :size="14" />
      </button>
      <button 
        :disabled="matches.length === 0"
        class="p-1 hover:bg-bg-tertiary rounded disabled:opacity-50"
        title="Next (Enter)"
        @click="handleNext"
      >
        <BaseIcon name="chevron-down" :size="14" />
      </button>
    </div>
    
    <button 
      class="p-1 hover:bg-bg-tertiary rounded"
      title="Close (Esc)"
      @click="handleClose"
    >
      <BaseIcon name="x" :size="16" />
    </button>
  </div>
</template>

<style scoped>
:deep(.ProseMirror mark) {
  background-color: rgba(59, 130, 246, 0.4);
  padding: 0 2px;
  border-radius: 2px;
}
</style>