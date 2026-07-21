<script setup>
const props = defineProps({
  active: Boolean,
  label: {
    type: String,
    default: ''
  },
  isRunning: Boolean,
  shortcut: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['click'])

const displayLabel = computed(() => {
  if (props.label === 'Flow' && props.isRunning) {
    return 'End Session'
  }
  return props.label
})

const sectionFont = 'font-ui'
</script>

<template>
  <button
    :class="[
      'px-4 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent',
      active
        ? 'bg-accent text-bg-primary shadow-warm-sm btn-elevated active:scale-[0.98]'
        : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary btn-ghost active:scale-[0.98]'
    ]"
    :title="shortcut ? `${label} (${shortcut})` : label"
    @click="emit('click')"
    @keydown.enter="emit('click')"
  >
    <span :class="sectionFont">{{ displayLabel }}</span>
  </button>
</template>
