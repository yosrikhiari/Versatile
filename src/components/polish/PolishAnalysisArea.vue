<script setup>
import { computed } from 'vue'
import PolishAnnotation from './PolishAnnotation.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  isAnalyzing: { type: Boolean, default: false },
  selectedParagraphIndex: { type: Number, default: null },
  annotations: { type: Array, default: () => [] },
  error: { type: String, default: null },
  projectId: { type: String, default: null }
})

const emit = defineEmits(['accept', 'reject', 'flag'])

const currentAnnotations = computed(() => {
  if (props.selectedParagraphIndex === null) return []
  return props.annotations.filter(
    (a) => a.paragraphIndex === props.selectedParagraphIndex && a.status === 'pending'
  )
})

const overallNote = computed(() => {
  if (currentAnnotations.value.length > 0) {
    return currentAnnotations.value[0].overallNote
  }
  return null
})

function acceptAnnotation(id) {
  emit('accept', id)
}

function rejectAnnotation(id) {
  emit('reject', id)
}

function flagAnnotation(id) {
  emit('flag', id)
}
</script>

<template>
  <div class="flex-[3] p-4 overflow-y-auto border-r border-border-subtle">
    <div v-if="selectedParagraphIndex === null" class="text-center py-8">
      <p class="text-sm italic text-text-hint">Click any paragraph in the editor to analyze it</p>
    </div>

    <div v-else-if="isAnalyzing" class="flex flex-col items-center justify-center py-8 gap-4">
      <div class="flex items-center gap-2 text-text-secondary">
        <BaseIcon name="loader-2" :size="16" class="animate-spin" />
        <span>Analyzing...</span>
      </div>
      <div class="w-full max-w-sm space-y-2">
        <div class="h-3 bg-surface-hover rounded w-3/4 animate-pulse"></div>
        <div class="h-3 bg-surface-hover rounded w-full animate-pulse"></div>
        <div class="h-3 bg-surface-hover rounded w-5/6 animate-pulse"></div>
      </div>
    </div>

    <div v-else-if="currentAnnotations.length === 0 && !error" class="text-center py-8">
      <p class="text-sm italic text-text-hint">No issues found — this paragraph looks clean</p>
    </div>

    <div
      v-else-if="error"
      class="p-3 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-danger font-ui"
    >
      {{ error }}
    </div>

    <div v-else class="space-y-4">
      <div
        v-if="overallNote"
        class="bg-bg-secondary border-l-2 border-accent rounded-r-lg p-3 text-sm text-text-secondary italic"
      >
        {{ overallNote }}
      </div>

      <TransitionGroup name="fade-stagger" tag="div" class="space-y-4">
        <PolishAnnotation
          v-for="annotation in currentAnnotations"
          :key="annotation.id"
          :annotation="annotation"
          @accept="acceptAnnotation"
          @reject="rejectAnnotation"
          @flag="flagAnnotation"
        />
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.fade-stagger-enter-active {
  animation: fadeIn 0.4s ease-out both;
}

.fade-stagger-leave-active {
  transition: all 0.3s;
}

.fade-stagger-enter-from,
.fade-stagger-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
