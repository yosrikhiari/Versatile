<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useFlowSession } from '../../composables/useFlowSession'
import { useFlowSave } from '../../composables/useFlowSave'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { AutoDialogue } from '../../extensions/AutoDialogue'
import FlowTimer from './FlowTimer.vue'
import FlowNudge from './FlowNudge.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import EmptyState from '../shared/EmptyState.vue'

const CONTENT_WARN_THRESHOLD = 50_000
const CONTENT_CRITICAL_THRESHOLD = 200_000

const flow = useFlowSession()

const emit = defineEmits(['paragraph-click', 'open-settings', 'exit-flow'])

function handleExitFlow() {
  emit('exit-flow')
}

const projectStore = useProjectStore()
const manuscriptStore = useManuscriptStore()

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({
      heading: false,
      horizontalRule: false,
      codeBlock: false,
      blockquote: false,
      dropcursor: false,
      gapCursor: false
    }),
    Highlight.configure({
      multicolor: false
    }),
    AutoDialogue
  ],
  editorProps: {
    attributes: {
      class: 'editor-content focus:outline-none'
    }
  },
  onUpdate: ({ editor }) => {
    const textContent = editor.state.doc.textContent
    contentSize.value = textContent.length
    scheduleSave()
    flow.handleKeystroke()
  },
  onSelectionUpdate: () => {
    flow.handleKeystroke()
  }
})

const { isSaving, scheduleSave, flushSave } = useFlowSave(editor)

const activeContent = computed(() => {
  if (manuscriptStore.activeSubsectionId) {
    return manuscriptStore.activeSubsection?.content || ''
  }
  if (manuscriptStore.activeSectionId) {
    return manuscriptStore.activeSection?.content || ''
  }
  return projectStore.documentContent
})

const contentSize = ref(0)
const contentSizeWarning = computed(() => {
  const size = contentSize.value
  if (size >= CONTENT_CRITICAL_THRESHOLD) return 'critical'
  if (size >= CONTENT_WARN_THRESHOLD) return 'warn'
  return 'ok'
})

const dismissEmptyState = ref(false)
const isEmptyContent = computed(() => {
  if (dismissEmptyState.value) return false
  if (manuscriptStore.activeSubsectionId || manuscriptStore.activeSectionId) return false
  const content = projectStore.documentContent
  return !content || content === '<p></p>' || content.trim() === ''
})

function handleStartWriting() {
  dismissEmptyState.value = true
  nextTick(() => {
    editor.value?.commands.focus()
  })
}

const hasShownFlowHint = ref(false)
const flowHintVisible = ref(false)
const scrollContainer = ref(null)

function handleKeydown(event) {
  if (flow.isRunning.value && event.key === 'Backspace') {
    event.preventDefault()
    if (!hasShownFlowHint.value) {
      hasShownFlowHint.value = true
      flowHintVisible.value = true
      setTimeout(() => {
        flowHintVisible.value = false
      }, 1500)
    }
    return
  }
  if (event.key === 'Backspace') {
    flow.handleBackspace(event)
  }
  flow.handleKeystroke()
}

function handleDismissNudge() {
  flow.dismissNudge()
}

function handleClick(_event) {
  if (!editor.value) return

  const { from } = editor.value.state.selection
  const $pos = editor.value.state.doc.resolve(from)
  const node = $pos.parent

  if (node && node.type.name === 'paragraph') {
    const text = node.textContent
    if (text && text.trim()) {
      let idx = 0
      editor.value.state.doc.descendants((p) => {
        if (p === node) return false
        if (p.isBlock && p.type.name === 'paragraph') idx++
      })
      emit('paragraph-click', text, idx)
    }
  }
}

watch(activeContent, (newContent) => {
  if (editor.value?.getHTML() !== newContent) {
    const savedScroll = scrollContainer.value?.scrollTop ?? 0
    editor.value.commands.setContent(newContent || '')
    requestAnimationFrame(() => {
      if (scrollContainer.value) {
        scrollContainer.value.scrollTop = savedScroll
      }
    })
  }
})

onBeforeUnmount(() => {
  flushSave()
  if (editor.value) {
    editor.value.destroy()
  }
})

function insertAtCursor(text) {
  if (!editor.value) return
  const { anchor } = editor.value.state.selection
  editor.value.commands.insertContentAt(anchor, text)
}

defineExpose({
  editor,
  insertAtCursor
})
</script>

<template>
  <div class="h-full flex flex-col bg-manuscript relative overflow-hidden">
    <button
      v-if="flow.isRunning.value"
      class="absolute top-4 right-4 z-10 text-xs text-text-hint hover:text-text-secondary font-ui transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent rounded-lg px-2.5 py-1.5 btn-ghost"
      @click="handleExitFlow"
    >
      Exit Flow
    </button>

    <div
      v-if="contentSizeWarning !== 'ok'"
      class="flex-shrink-0 px-6 py-2 text-xs font-ui border-b"
      :class="
        contentSizeWarning === 'critical'
          ? 'bg-bg-secondary text-danger border-border-subtle'
          : 'bg-bg-secondary text-warning border-border-subtle'
      "
    >
      <span class="flex items-center gap-2">
        <BaseIcon
          :name="contentSizeWarning === 'critical' ? 'alert-triangle' : 'alert-circle'"
          :size="14"
        />
        <span>
          This section is <strong>{{ (contentSize.value / 1000).toFixed(0) }}K</strong> characters.
          {{
            contentSizeWarning === 'critical'
              ? 'Editor performance may degrade. Consider splitting into subsections.'
              : 'Consider splitting into smaller subsections for better performance.'
          }}
        </span>
      </span>
    </div>

    <div
      ref="scrollContainer"
      :class="['flex-1 overflow-y-auto scrollbar-thin', flow.isDesaturated ? 'desaturated' : '']"
    >
      <EmptyState
        v-if="isEmptyContent"
        icon="edit-3"
        title="Start writing"
        description="Create a chapter from the sidebar, or jump right in."
        action-label="Start writing"
        @action="handleStartWriting"
      />
      <div
        v-else
        class="editor-wrapper max-w-[760px] mx-auto px-8 py-16 relative z-1"
        @keydown="handleKeydown"
        @click="handleClick"
      >
        <EditorContent v-if="editor" :editor="editor" class="tiptap-editor" />
      </div>
    </div>

    <FlowTimer v-if="flow.isRunning.value" @open-settings="emit('open-settings')" />

    <div
      v-if="isSaving"
      class="absolute bottom-3 right-4 text-2xs text-text-hint font-ui flex items-center gap-1.5"
    >
      <BaseIcon name="loader-2" :size="10" class="animate-spin" />
      <span class="tracking-wide">Saving...</span>
    </div>

    <FlowNudge v-if="flow.isNudging.value" @dismiss="handleDismissNudge" />

    <Transition name="flow-hint">
      <div
        v-if="flowHintVisible"
        class="absolute top-8 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-bg-tertiary border border-border-subtle text-text-secondary text-xs font-ui shadow-warm-md pointer-events-none"
      >
        Flow mode — keep writing forward.
      </div>
    </Transition>
  </div>
</template>

<style>
.dialogue-text {
  color: var(--vers-accent-primary);
  background: rgba(var(--vers-accent-primary-rgb), 0.08);
  border-radius: 2px;
  padding: 0 1px;
}
</style>

<style scoped>
.flow-hint-enter-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}
.flow-hint-leave-active {
  transition:
    opacity 0.4s ease-in,
    transform 0.4s ease-in;
}
.flow-hint-enter-from {
  opacity: 0;
  transform: translate(-50%, -4px);
}
.flow-hint-leave-to {
  opacity: 0;
  transform: translate(-50%, -4px);
}
</style>
