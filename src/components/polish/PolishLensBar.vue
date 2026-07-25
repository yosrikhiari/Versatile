<script setup>
defineProps({
  activeLenses: { type: Object, default: () => ({}) },
  lensIssueCounts: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['toggle'])

const lensOptions = [
  { key: 'weakVerbs', label: 'Weak Verbs' },
  { key: 'repetition', label: 'Repetition' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'clarity', label: 'Clarity Issues' }
]
</script>

<template>
  <div class="flex gap-2">
    <button
      v-for="lens in lensOptions"
      :key="lens.key"
      :class="[
        'px-2 py-1 text-xs rounded-full transition-colors font-ui relative focus:outline-none focus:ring-2 focus:ring-accent',
        activeLenses[lens.key]
          ? 'bg-surface-hover text-accent'
          : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
      ]"
      @click="emit('toggle', lens.key)"
    >
      {{ lens.label }}
      <span v-if="lensIssueCounts[lens.key] > 0 && activeLenses[lens.key]" class="ml-1 opacity-75">
        {{ lensIssueCounts[lens.key] }}
      </span>
    </button>
  </div>
</template>
