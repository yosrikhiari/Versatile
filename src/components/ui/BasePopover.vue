<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Anchored popover for rich menus — an account card, a detail preview, a set of
 * actions too structured for a plain dropdown list.
 *
 * The panel teleports to `<body>` and positions from the trigger's viewport
 * rect, because the usual anchors here (the sidebar, panel headers) are
 * `overflow: hidden` and would otherwise clip it.
 */
const props = defineProps({
  placement: {
    type: String,
    default: 'top',
    validator: (v) => ['top', 'bottom', 'right', 'left'].includes(v)
  },
  align: {
    type: String,
    default: 'start',
    validator: (v) => ['start', 'end'].includes(v)
  },
  /** Gap between trigger and panel, in px. */
  offset: { type: Number, default: 8 },
  width: { type: Number, default: 260 },
  /** Accessible name for the panel. */
  label: { type: String, default: 'More options' },
  /** Layout classes for the trigger wrapper, which must render a real box. */
  triggerClass: { type: String, default: '' }
})

const emit = defineEmits(['open', 'close'])

const isOpen = ref(false)
const triggerEl = ref(null)
const panelEl = ref(null)
const position = ref({ top: 0, left: 0 })

const MARGIN = 8

function computePosition() {
  const trigger = triggerEl.value
  if (!trigger) return

  const r = trigger.getBoundingClientRect()
  const panelHeight = panelEl.value?.offsetHeight ?? 0
  const w = props.width

  let top
  let left

  if (props.placement === 'top') {
    top = r.top - panelHeight - props.offset
    left = props.align === 'end' ? r.right - w : r.left
  } else if (props.placement === 'bottom') {
    top = r.bottom + props.offset
    left = props.align === 'end' ? r.right - w : r.left
  } else if (props.placement === 'right') {
    top = props.align === 'end' ? r.bottom - panelHeight : r.top
    left = r.right + props.offset
  } else {
    top = props.align === 'end' ? r.bottom - panelHeight : r.top
    left = r.left - w - props.offset
  }

  // Keep the panel on screen rather than letting it run off an edge.
  left = Math.min(Math.max(MARGIN, left), window.innerWidth - w - MARGIN)
  top = Math.min(Math.max(MARGIN, top), window.innerHeight - panelHeight - MARGIN)

  position.value = { top, left }
}

async function open() {
  isOpen.value = true
  emit('open')
  // Two frames: one to mount the panel, one so its measured height is real.
  await nextTick()
  computePosition()
  await nextTick()
  computePosition()
  window.addEventListener('scroll', computePosition, true)
  window.addEventListener('resize', computePosition)
}

function close({ restoreFocus = false } = {}) {
  if (!isOpen.value) return
  isOpen.value = false
  emit('close')
  window.removeEventListener('scroll', computePosition, true)
  window.removeEventListener('resize', computePosition)
  // `triggerEl` is the wrapper, which takes no focus — hand it back to the
  // control inside, or dismissing with Escape drops focus to <body>.
  if (restoreFocus) {
    const focusable = triggerEl.value?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusable?.focus()
  }
}

function toggle() {
  isOpen.value ? close() : open()
}

function onDocumentPointerDown(event) {
  if (!isOpen.value) return
  if (triggerEl.value?.contains(event.target)) return
  if (panelEl.value?.contains(event.target)) return
  close()
}

function onKeydown(event) {
  if (event.key === 'Escape' && isOpen.value) {
    event.stopPropagation()
    close({ restoreFocus: true })
  }
}

watch(isOpen, (nowOpen) => {
  const method = nowOpen ? 'addEventListener' : 'removeEventListener'
  // `pointerdown` rather than `click`, so a press that starts outside dismisses
  // immediately instead of waiting for a mouseup the user may never deliver.
  document[method]('pointerdown', onDocumentPointerDown)
  document[method]('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', computePosition, true)
  window.removeEventListener('resize', computePosition)
})

const panelStyle = computed(() => ({
  top: `${position.value.top}px`,
  left: `${position.value.left}px`,
  width: `${props.width}px`
}))

defineExpose({ close })
</script>

<template>
  <!--
    A real box, not `display: contents` — the panel is positioned from this
    element's `getBoundingClientRect()`, and a contents box measures 0×0.
  -->
  <div ref="triggerEl" :class="triggerClass">
    <slot name="trigger" :open="isOpen" :toggle="toggle" />
  </div>

  <Teleport to="body">
    <Transition name="anim-fade-up">
      <div
        v-if="isOpen"
        ref="panelEl"
        role="dialog"
        :aria-label="label"
        class="fixed z-[80] overflow-hidden rounded-xl border border-border-strong bg-bg-elevated"
        :style="panelStyle"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </Teleport>
</template>
