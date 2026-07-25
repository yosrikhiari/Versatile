<script setup>
import { watch, ref, nextTick, onBeforeUnmount } from 'vue'
import { createFocusTrap } from 'focus-trap'

const props = defineProps({
  isNudging: Boolean
})

const emit = defineEmits(['dismiss'])

const panelEl = ref(null)
const lastFocused = ref(null)
let trap = null

function dismiss() {
  emit('dismiss')
}

function activateTrap() {
  lastFocused.value = document.activeElement
  nextTick(() => {
    if (panelEl.value) {
      trap = createFocusTrap(panelEl.value, {
        initialFocus: false,
        escapeDeactivates: false
      })
      trap.activate()
    }
  })
}

function deactivateTrap() {
  if (trap) {
    trap.deactivate()
    trap = null
  }
  if (lastFocused.value && typeof lastFocused.value.focus === 'function') {
    lastFocused.value.focus()
  }
}

watch(
  () => props.isNudging,
  (nudging) => {
    if (nudging) {
      activateTrap()
    } else {
      deactivateTrap()
    }
  }
)

onBeforeUnmount(() => {
  deactivateTrap()
})
</script>

<template>
  <div v-if="isNudging" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <div
      ref="panelEl"
      role="dialog"
      aria-modal="true"
      aria-label="Flow reminder"
      aria-describedby="flow-nudge-message"
      class="bg-bg-tertiary rounded-xl shadow-xl p-8 max-w-md text-center border border-border-subtle"
    >
      <div class="text-4xl mb-4 font-ui text-accent">Flow</div>
      <h2 class="text-xl font-semibold text-text-primary mb-2">Keep moving</h2>
      <p id="flow-nudge-message" class="text-text-secondary mb-6">
        Your words are waiting. Don't edit — just write. You can fix it later.
      </p>
      <button
        class="px-6 py-2 btn-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
        @click="dismiss"
      >
        Got it
      </button>
    </div>
  </div>
</template>
