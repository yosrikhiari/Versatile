<script setup>
const props = defineProps({
  isNudging: Boolean
})

const emit = defineEmits(['dismiss'])

function dismiss() {
  emit('dismiss')
}
</script>

<template>
  <div v-if="isNudging" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <div class="bg-bg-tertiary rounded-xl shadow-xl p-8 max-w-md text-center border border-border-subtle">
      <div class="text-4xl mb-4 font-flow italic text-accent">Flow</div>
      <h2 class="text-xl font-semibold text-text-primary mb-2">Keep moving</h2>
      <p class="text-text-secondary mb-6">
        Your words are waiting. Don't edit — just write. You can fix it later.
      </p>
      <button 
        @click="dismiss"
        class="px-6 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
      >
        Got it
      </button>
    </div>
  </div>
</template>
