<script setup>
import { computed } from 'vue'

const props = defineProps({
  active: Boolean,
  label: String,
  isRunning: Boolean,
  shortcut: String
})

const emit = defineEmits(['click'])

const displayLabel = computed(() => {
  if (props.label === 'Flow' && props.isRunning) {
    return 'End Session'
  }
  return props.label
})

const sectionFont = computed(() => {
  const fonts = {
    'Spark': 'font-spark',
    'Flow': 'font-flow italic',
    'Polish': 'font-polish',
    'Revise': 'font-revise',
    'Story Bible': 'font-storybible',
  }
  return fonts[props.label] || 'font-ui'
})
</script>

<template>
  <button
    :class="[
      'px-4 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent',
       active 
         ? 'bg-gradient-to-b from-accent to-[#c09a5e] text-bg-primary shadow-warm-sm btn-elevated' 
         : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary btn-ghost'
    ]"
    :title="shortcut ? `${label} (${shortcut})` : label"
    @click="emit('click')"
    @keydown.enter="emit('click')"
  >
    <span :class="sectionFont">{{ displayLabel }}</span>
  </button>
</template>
