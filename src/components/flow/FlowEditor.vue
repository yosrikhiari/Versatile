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
import EditorFormatMenu from '../editor/EditorFormatMenu.vue'
import BaseAlert from '../ui/BaseAlert.vue'

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
  onUpdate: () => {
    // Serialising the document is O(size), so it is not done per keystroke.
    // The store, the size banner and the word count catch up after a short
    // idle gap; the save timer and flow tracking stay immediate.
    scheduleDocumentSync()
    scheduleSave()
    flow.handleKeystroke()
  },
  onSelectionUpdate: () => {
    flow.handleKeystroke()
  }
})

const { isSaving, scheduleSave, flushSave } = useFlowSave(editor)

/** Idle gap before the editor's text is pushed into the store. */
const DOCUMENT_SYNC_MS = 300
let documentSyncTimer = null
/** The HTML this editor last handed to the store — its own echo, not a change. */
let lastPushedHtml = null

/**
 * Push the editor's text into the store.
 *
 * When no section is open, `useFlowSave` persists via
 * `projectStore.saveDocumentNow()`, which writes `documentContent` — so the
 * store has to hold what is on screen or the save writes stale text. It is also
 * what recomputes `wordCount`.
 *
 * This ran on every keystroke and serialised the whole document twice each
 * time: once here, and once more in the `activeContent` watcher, which called
 * `getHTML()` again just to discover the change was its own. A long root
 * document made typing visibly lag.
 */
function syncDocumentToStore() {
  documentSyncTimer = null
  if (!editor.value) return
  const textContent = editor.value.state.doc.textContent
  contentSize.value = textContent.length
  if (!manuscriptStore.activeSubsectionId && !manuscriptStore.activeSectionId) {
    const html = editor.value.getHTML()
    lastPushedHtml = html
    projectStore.updateContent(html, textContent)
  }
}

function scheduleDocumentSync() {
  if (documentSyncTimer) clearTimeout(documentSyncTimer)
  documentSyncTimer = setTimeout(syncDocumentToStore, DOCUMENT_SYNC_MS)
}

/** Run a pending sync now — before a save or teardown reads the store. */
function flushDocumentSync() {
  if (documentSyncTimer) {
    clearTimeout(documentSyncTimer)
    syncDocumentToStore()
  }
}

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

// The banner used to interpolate `contentSize.value` directly in the template,
// where the ref is already unwrapped — `.value` on a Number is undefined, so it
// rendered "NaNK characters" every time the warning fired.
const contentSizeK = computed(() => Math.round(contentSize.value / 1000))

const dismissEmptyState = ref(false)
const terms = computed(() => projectStore.structureTerms)
const isEmptyContent = computed(() => {
  if (dismissEmptyState.value) return false
  if (manuscriptStore.activeSubsectionId || manuscriptStore.activeSectionId) return false
  const content = projectStore.documentContent
  return !content || content === '<p></p>' || content.trim() === ''
})

/**
 * A chapter row is open, its own body is empty, and its scenes hold prose. The
 * generator used to paper over this by copying the scenes into the body (and
 * doubling every word count); now the editor says where the text is and opens it.
 */
const scenesOfActiveSection = computed(() => {
  if (!manuscriptStore.activeSectionId || manuscriptStore.activeSubsectionId) return []
  return (manuscriptStore.subsectionsBySection[manuscriptStore.activeSectionId] || []).filter(
    (s) => (s.wordCount || 0) > 0 || (s.content && s.content !== '<p></p>')
  )
})
const chapterProseIsInScenes = computed(() => {
  if (dismissEmptyState.value || scenesOfActiveSection.value.length === 0) return false
  const body = manuscriptStore.activeSection?.content || ''
  return !body || body === '<p></p>' || body.trim() === ''
})
function openScene(scene) {
  manuscriptStore.setActiveSubsection(scene.id)
}

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
  // Our own push coming back around — nothing to load.
  if (newContent === lastPushedHtml) return
  lastPushedHtml = null
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
  // Each step is isolated: a throw here aborts the rest of the teardown, and a
  // half-unmounted editor left route changes needing a manual refresh.
  try {
    flushDocumentSync()
    flushSave()
  } catch (err) {
    console.error('[FlowEditor] flush on unmount failed:', err)
  }

  try {
    editor.value?.destroy()
  } catch (err) {
    console.error('[FlowEditor] editor teardown failed:', err)
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

    <BaseAlert
      v-if="contentSizeWarning !== 'ok'"
      :variant="contentSizeWarning === 'critical' ? 'danger' : 'warning'"
      flush
      class="flex-shrink-0"
    >
      This section is <strong>{{ contentSizeK }}K</strong> characters.
      {{
        contentSizeWarning === 'critical'
          ? 'Editor performance may degrade. Consider splitting into subsections.'
          : 'Consider splitting into smaller subsections for better performance.'
      }}
    </BaseAlert>

    <div
      ref="scrollContainer"
      :class="['flex-1 overflow-y-auto scrollbar-thin', flow.isDesaturated ? 'desaturated' : '']"
    >
      <EmptyState
        v-if="isEmptyContent"
        icon="edit-3"
        title="Start writing"
        :description="`Jump right in — you can file this text into a ${terms.sectionLc} later — or open ${terms.sections} in the sidebar to plan first.`"
        action-label="Start writing"
        @action="handleStartWriting"
      />
      <div v-else-if="chapterProseIsInScenes" class="max-w-[760px] mx-auto px-8 py-16">
        <EmptyState
          icon="book-marked"
          :title="`This ${terms.sectionLc} is written in ${terms.subsectionsLc}`"
          :description="
            scenesOfActiveSection.length === 1
              ? `Its one ${terms.subsectionLc} holds the prose. Open it to write, or start a ${terms.sectionLc} note here.`
              : `Its ${scenesOfActiveSection.length} ${terms.subsectionsLc} hold the prose. Open one to write, or start a ${terms.sectionLc} note here.`
          "
          action-label="Write a note here"
          @action="handleStartWriting"
        />
        <div class="mt-4 flex flex-col gap-1">
          <button
            v-for="scene in scenesOfActiveSection"
            :key="scene.id"
            class="flex items-center justify-between gap-3 px-3 py-2 rounded-sm border border-border-subtle bg-bg-secondary text-left text-sm font-ui text-text-primary hover:border-accent transition-colors"
            @click="openScene(scene)"
          >
            <span class="truncate">{{
              scene.title || `${terms.subsection} ${scene.order + 1}`
            }}</span>
            <span class="font-mono text-xs text-text-hint shrink-0"
              >{{ (scene.wordCount || 0).toLocaleString() }} words</span
            >
          </button>
        </div>
      </div>
      <div
        v-else
        class="editor-wrapper max-w-[760px] mx-auto px-8 py-16 relative z-1"
        @keydown="handleKeydown"
        @click="handleClick"
      >
        <EditorContent v-if="editor" :editor="editor" class="tiptap-editor" />
      </div>
    </div>

    <!-- Formatting appears only while a range is selected, so the writing
         surface keeps its full height the rest of the time. -->
    <EditorFormatMenu :editor="editor" />

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
  background: rgb(var(--vers-accent-primary-rgb) / 0.08);
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
