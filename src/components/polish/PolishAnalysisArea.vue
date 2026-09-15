<script setup>
import { computed } from 'vue'
import PolishAnnotation from './PolishAnnotation.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseAlert from '../ui/BaseAlert.vue'

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
  <div
    class="flex-1 min-w-0 px-4 py-3 overflow-y-auto scrollbar-thin border-r border-border-subtle"
  >
    <p
      v-if="selectedParagraphIndex === null"
      class="py-8 text-center font-ui text-xs text-text-hint leading-5"
    >
      Click a paragraph in the editor, then Analyze.
    </p>

    <div v-else-if="isAnalyzing" class="py-4 space-y-3" role="status">
      <div class="flex items-center gap-2 font-ui text-xs text-text-hint">
        <BaseIcon name="loader-2" :size="14" class="animate-spin text-accent" />
        Reading the paragraph…
      </div>
      <div class="max-w-sm space-y-2 animate-pulse" aria-hidden="true">
        <div class="h-3 bg-bg-tertiary rounded w-3/4"></div>
        <div class="h-3 bg-bg-tertiary rounded w-full"></div>
        <div class="h-3 bg-bg-tertiary rounded w-5/6"></div>
      </div>
    </div>

    <BaseAlert v-else-if="error" variant="danger">{{ error }}</BaseAlert>

    <p
      v-else-if="currentAnnotations.length === 0"
      class="py-8 text-center font-ui text-xs text-text-hint leading-5"
    >
      Nothing to fix here — this paragraph reads clean under the active lenses.
    </p>

    <div v-else>
      <p
        v-if="overallNote"
        class="mb-3 font-ui text-sm text-text-secondary leading-5 border-l-2 border-border-subtle pl-3"
      >
        {{ overallNote }}
      </p>

      <TransitionGroup name="fade-stagger" tag="div" class="divide-y divide-border-subtle">
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
