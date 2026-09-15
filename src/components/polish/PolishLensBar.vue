<script setup>
import BaseChip from '../ui/BaseChip.vue'
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
  <div class="flex flex-wrap gap-1.5" role="group" aria-label="Lenses">
    <BaseChip
      v-for="lens in lensOptions"
      :key="lens.key"
      variant="filter"
      size="sm"
      :active="!!activeLenses[lens.key]"
      @click="emit('toggle', lens.key)"
    >
      {{ lens.label
      }}<span
        v-if="lensIssueCounts[lens.key] > 0 && activeLenses[lens.key]"
        class="ml-1 tabular-nums opacity-70"
      >
        {{ lensIssueCounts[lens.key] }}
      </span>
    </BaseChip>
  </div>
</template>
