<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import BaseIcon from '../shared/BaseIcon.vue'

const projectStore = useProjectStore()

const showRecap = ref(false)

const visible = ref(true)
let dismissTimeout = null
let keypressHandler = null

function formatDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function handleDismiss() {
  visible.value = false
  if (dismissTimeout) clearTimeout(dismissTimeout)
  if (keypressHandler) {
    window.removeEventListener('keypress', keypressHandler)
  }
}

onMounted(() => {
  const hasOldRecap = projectStore.lastSessionDate && projectStore.lastSessionWords > 0
  const hasNewRecap = projectStore.lastSessionRecap

  if (!hasOldRecap && !hasNewRecap) {
    visible.value = false
    return
  }

  showRecap.value = !!hasNewRecap

  dismissTimeout = setTimeout(() => {
    handleDismiss()
  }, 5000)

  keypressHandler = () => {
    handleDismiss()
  }
  window.addEventListener('keypress', keypressHandler)
})

onUnmounted(() => {
  if (dismissTimeout) clearTimeout(dismissTimeout)
  if (keypressHandler) {
    window.removeEventListener('keypress', keypressHandler)
  }
})
</script>

<template>
  <div
    v-if="visible"
    class="glass border-b border-border-subtle/30 px-4 py-2 flex items-center justify-between animate-fade-in"
  >
    <div class="flex items-center gap-2 text-sm text-text-secondary">
      <BaseIcon name="clock" :size="14" class="text-text-hint" />
      <span v-if="showRecap && projectStore.lastSessionRecap">
        {{ projectStore.lastSessionRecap }}
      </span>
      <span v-else-if="projectStore.lastSessionDate && projectStore.lastSessionWords > 0">
        Last session:
        <span class="text-text-hint">{{ formatDate(projectStore.lastSessionDate) }}</span> — you
        wrote
        <span class="text-accent font-medium"
          >{{ projectStore.lastSessionWords.toLocaleString() }} words</span
        >
      </span>
    </div>
    <button
      class="text-text-hint hover:text-text-secondary transition-colors"
      @click="handleDismiss"
    >
      <BaseIcon name="x" :size="14" />
    </button>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
</style>
