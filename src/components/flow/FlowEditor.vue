<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useSnapshotStore } from '../../stores/snapshotStore'
import { useDebounceFn } from '@vueuse/core'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import FlowTimer from './FlowTimer.vue'
import FlowNudge from './FlowNudge.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  isDesaturated: Boolean,
  isRunning: Boolean,
  isNudging: Boolean,
  remaining: Number,
  sessionWordCount: Number,
  sessionGoal: Number,
  sessionProgress: Number,
  dailyWordCount: Number,
  dailyGoal: Number,
  dailyProgress: Number
})

const emit = defineEmits(['keystroke', 'backspace', 'paragraph-click', 'open-settings', 'dismiss-nudge', 'exit-flow'])

function handleExitFlow() {
  emit('exit-flow')
}

const projectStore = useProjectStore()
const snapshotStore = useSnapshotStore()
const isSaving = ref(false)

const debouncedSave = useDebounceFn(async () => {
  if (projectStore.currentProjectId) {
    isSaving.value = true
    projectStore.saveDocumentDebounced()
    await snapshotStore.saveNewSnapshot(
      projectStore.currentProjectId,
      null,
      projectStore.documentContent,
      'manuscript auto-save'
    )
    setTimeout(() => { isSaving.value = false }, 1500)
  }
}, 10000)

const editor = useEditor({
  content: projectStore.documentContent || '',
  extensions: [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
      codeBlock: false,
      blockquote: false,
      dropcursor: false,
      gapCursor: false,
    }),
    Highlight.configure({
      multicolor: false
    })
  ],
  editorProps: {
    attributes: {
      class: 'editor-content focus:outline-none'
    }
  },
  onUpdate: ({ editor }) => {
    const content = editor.getText()
    projectStore.updateContent(content)
    debouncedSave()
    emit('keystroke')
  },
  onSelectionUpdate: ({ editor }) => {
    emit('keystroke')
  }
})

function handleKeydown(event) {
  if (props.isRunning && event.key === 'Backspace') {
    event.preventDefault()
    return
  }
  if (event.key === 'Backspace') {
    emit('backspace', event)
  }
  emit('keystroke')
}

function handleDismissNudge() {
  emit('dismiss-nudge')
}

function handleClick(event) {
  if (!editor.value) return
  
  const { from, to } = editor.value.state.selection
  const $pos = editor.value.state.doc.resolve(from)
  
  let nodePos = from
  let node = $pos.parent
  
  if (node) {
    const childIndex = $pos.index()
    const paragraphs = []
    
    editor.value.state.doc.descendants((p, pos) => {
      if (p.isBlock && p.type.name === 'paragraph') {
        paragraphs.push({ node: p, pos })
      }
    })
    
    const paragraphIndex = paragraphs.findIndex(p => p.pos >= nodePos)
    
    if (paragraphIndex !== -1) {
      const text = paragraphs[paragraphIndex].node.textContent
      if (text && text.trim()) {
        emit('paragraph-click', text, paragraphIndex)
      }
    }
  }
}

watch(() => projectStore.documentContent, (newContent) => {
  if (editor.value && editor.value.getText() !== newContent) {
    editor.value.commands.setContent(newContent || '')
  }
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
  }
})

defineExpose({
  editor
})
</script>

<template>
  <div class="h-full flex flex-col bg-manuscript relative editor-glow">
    <button
      v-if="isRunning"
      class="absolute top-4 right-4 z-10 text-xs text-text-hint/60 hover:text-text-secondary font-ui transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent rounded-lg px-2.5 py-1.5 btn-ghost"
      @click="handleExitFlow"
    >
      Exit Flow
    </button>
    <div 
      :class="[
        'flex-1 overflow-y-auto scrollbar-thin',
        isDesaturated ? 'desaturated' : ''
      ]"
    >
      <div 
        class="editor-wrapper max-w-[680px] mx-auto px-8 py-16 relative z-1"
        @keydown="handleKeydown"
        @click="handleClick"
      >
        <EditorContent 
          v-if="editor" 
          :editor="editor" 
          class="tiptap-editor"
        />
      </div>
    </div>

    <FlowTimer
      v-if="isRunning"
      :remaining="remaining"
      :session-word-count="sessionWordCount"
      :session-goal="sessionGoal"
      :session-progress="sessionProgress"
      :daily-word-count="dailyWordCount"
      :daily-goal="dailyGoal"
      :daily-progress="dailyProgress"
      @open-settings="emit('open-settings')"
    />

    <div 
      v-if="isSaving"
      class="absolute bottom-3 right-4 text-[10px] text-text-hint/50 font-ui flex items-center gap-1.5"
    >
      <BaseIcon name="loader-2" :size="10" class="animate-spin" />
      <span class="tracking-wide">Saving...</span>
    </div>

    <FlowNudge v-if="isNudging" @dismiss="handleDismissNudge" />
  </div>
</template>


