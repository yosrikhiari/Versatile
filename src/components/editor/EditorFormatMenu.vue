<script setup>
import { computed, ref, watch } from 'vue'
import { BubbleMenu } from '@tiptap/vue-3'
import BaseIcon from '../shared/BaseIcon.vue'
import AppTooltip from '../shared/AppTooltip.vue'

/**
 * Formatting controls for the current selection.
 *
 * The manuscript sits directly on the canvas with no chrome, so a permanent
 * toolbar would cost the writing surface a strip of height it never gets back.
 * These marks were reachable only by keyboard shortcut before — discoverable
 * if you already knew they existed.
 *
 * Scope is deliberately the four marks a novel actually uses. Alignment, lists
 * and images belong to documents, not to prose.
 */
const props = defineProps({
  editor: { type: Object, default: null }
})

const MARKS = [
  { name: 'bold', icon: 'bold', label: 'Bold', shortcut: 'Ctrl+B' },
  { name: 'italic', icon: 'italic', label: 'Italic', shortcut: 'Ctrl+I' },
  { name: 'strike', icon: 'strikethrough', label: 'Strikethrough', shortcut: 'Ctrl+Shift+S' },
  { name: 'highlight', icon: 'highlighter', label: 'Highlight', shortcut: 'Ctrl+Shift+H' }
]

const COMMAND = {
  bold: (chain) => chain.toggleBold(),
  italic: (chain) => chain.toggleItalic(),
  strike: (chain) => chain.toggleStrike(),
  highlight: (chain) => chain.toggleHighlight()
}

/**
 * `editor.isActive()` is a plain method call on a ProseMirror instance — reading
 * it registers no reactive dependency, so the buttons rendered their state once
 * and then never again: applying bold updated the document but left the control
 * showing "off". Ticking a counter on every transaction gives the computed
 * something to depend on.
 */
const transactionCount = ref(0)

watch(
  () => props.editor,
  (editor, _previous, onCleanup) => {
    if (!editor) return
    const bump = () => {
      transactionCount.value += 1
    }
    editor.on('transaction', bump)
    onCleanup(() => editor.off('transaction', bump))
  },
  { immediate: true }
)

const activeMarks = computed(() => {
  void transactionCount.value
  const editor = props.editor
  return Object.fromEntries(MARKS.map((m) => [m.name, editor?.isActive(m.name) ?? false]))
})

function isActive(name) {
  return activeMarks.value[name] ?? false
}

function toggle(name) {
  if (!props.editor) return
  COMMAND[name](props.editor.chain().focus()).run()
}

/**
 * Suppress the menu on a collapsed caret and inside code, so it only appears
 * when there is actually a range of prose to act on.
 */
function shouldShow({ editor, from, to }) {
  if (!editor?.isEditable) return false
  if (from === to) return false
  return !editor.isActive('codeBlock')
}
</script>

<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :should-show="shouldShow"
    :tippy-options="{ duration: 120, placement: 'top' }"
  >
    <div
      class="flex items-center gap-0.5 rounded-lg border border-border-strong bg-bg-elevated p-1"
      role="toolbar"
      aria-label="Format selection"
    >
      <AppTooltip v-for="mark in MARKS" :key="mark.name" :text="`${mark.label} · ${mark.shortcut}`">
        <button
          type="button"
          :aria-label="mark.label"
          :aria-pressed="isActive(mark.name) ? 'true' : 'false'"
          :class="[
            'grid h-7 w-7 place-items-center rounded-md transition-colors duration-150',
            isActive(mark.name)
              ? 'bg-accent/15 text-accent'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          ]"
          @click="toggle(mark.name)"
        >
          <BaseIcon :name="mark.icon" :size="15" />
        </button>
      </AppTooltip>
    </div>
  </BubbleMenu>
</template>
