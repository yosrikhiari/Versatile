<script setup>
import { ref, onErrorCaptured, provide } from 'vue'
import BaseIcon from './BaseIcon.vue'

const props = defineProps({
  fallbackTitle: {
    type: String,
    default: 'Something went wrong'
  },
  fallbackDescription: {
    type: String,
    default: 'An unexpected error occurred. Please try again.'
  }
})

const emit = defineEmits(['error'])
const hasError = ref(false)

onErrorCaptured((err) => {
  hasError.value = true
  emit('error', err)
  return false
})

function captureAsyncError(err) {
  hasError.value = true
  emit('error', err)
}

provide('captureAsyncError', captureAsyncError)

function reset() {
  hasError.value = false
}
</script>

<template>
  <slot v-if="!hasError" />
  <div v-else class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div class="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-5">
      <BaseIcon name="alert-triangle" :size="24" class="text-danger" />
    </div>
    <h3 class="text-sm font-ui font-medium text-text-primary mb-1.5">{{ fallbackTitle }}</h3>
    <p class="text-xs text-text-hint max-w-xs leading-relaxed mb-5">{{ fallbackDescription }}</p>
    <button
      class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-11px font-ui font-medium transition-all duration-200 cursor-pointer"
      @click="reset"
    >
      <BaseIcon name="refresh-cw" :size="12" />
      Try again
    </button>
  </div>
</template>
