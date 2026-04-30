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
    projectStore.saveManuscriptDebounced()
    await snapshotStore.saveNewSnapshot(
      projectStore.currentProjectId,
      null,
      projectStore.manuscriptContent,
      'manuscript auto-save'
    )
    setTimeout(() => { isSaving.value = false }, 1500)
  }
}, 10000)

const editor = useEditor({
  content: projectStore.manuscriptContent || '',
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

watch(() => projectStore.manuscriptContent, (newContent) => {
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
  <div class="h-full flex flex-col bg-manuscript relative">
    <button
      v-if="isRunning"
      @click="handleExitFlow"
      class="absolute top-4 right-4 z-10 text-xs text-text-hint hover:text-text-secondary font-ui transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1"
    >
      Exit Flow
    </button>
    <div 
      :class="[
        'flex-1 overflow-y-auto',
        isDesaturated ? 'desaturated' : ''
      ]"
    >
      <div 
        class="editor-wrapper max-w-[680px] mx-auto px-8 py-12"
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
      class="absolute bottom-2 right-4 text-[10px] text-text-hint font-ui flex items-center gap-1"
    >
      <BaseIcon name="loader-2" :size="12" class="animate-spin" />
      Saving...
    </div>

    <FlowNudge v-if="isNudging" @dismiss="handleDismissNudge" />
  </div>
</template>

<style>
.tiptap-editor .ProseMirror {
  outline: none;
  min-height: 60vh;
}

.tiptap-editor .ProseMirror p {
  margin-bottom: 1em;
}

.tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #9e9080;
  pointer-events: none;
  height: 0;
}
</style>
