<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useActivityLog } from '../../composables/useActivityLog'
import BaseIcon from './BaseIcon.vue'

const log = useActivityLog()

const currentTaskIndex = ref(0)
let cycleTimer = null

const activeList = computed(() => log.activeTasks.value)

const currentToastTask = computed(() => {
  if (activeList.value.length === 0) return null
  const idx = Math.min(currentTaskIndex.value, activeList.value.length - 1)
  return activeList.value[idx]
})

const badgeCount = computed(() => {
  if (activeList.value.length <= 1) return 0
  return activeList.value.length
})

function getStepText(task) {
  if (!task) return ''
  const running = task.phases.find((p) => p.status === 'running')
  if (running) return running.name
  const last = task.phases[task.phases.length - 1]
  if (last && last.status === 'done') return `${last.name} done`
  return task.progress.label || task.name
}

function getTaskIcon(task) {
  if (!task) return 'circle'
  switch (task.type) {
    case 'generation':
      return 'bot'
    case 'bootstrap':
      return 'database'
    case 'critic':
      return 'scroll-text'
    case 'revisor':
      return 'pen-tool'
    case 'spark':
      return 'sparkles'
    default:
      return 'activity'
  }
}

function dismiss() {
  log.toastsVisible.value = false
}

function openDrawer() {
  log.drawerOpen.value = true
}

onMounted(() => {
  if (activeList.value.length > 1) {
    cycleTimer = setInterval(() => {
      const len = activeList.value.length
      if (len > 1) currentTaskIndex.value = (currentTaskIndex.value + 1) % len
    }, 4000)
  }
})

onUnmounted(() => {
  if (cycleTimer) clearInterval(cycleTimer)
})
</script>

<template>
  <Transition name="toast-slide">
    <div v-if="log.toastsVisible.value && currentToastTask" class="fixed bottom-24 right-6 z-[100]">
      <button
        class="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg border border-border-subtle bg-bg-tertiary/95 backdrop-blur-sm text-sm font-ui text-text-primary hover:bg-bg-tertiary transition-all cursor-pointer group relative"
        @click="openDrawer"
      >
        <!-- Spinner for running tasks -->
        <span class="relative flex-shrink-0">
          <BaseIcon
            :name="getTaskIcon(currentToastTask)"
            :size="16"
            class="text-accent animate-pulse"
          />
        </span>

        <!-- Task info -->
        <div class="flex flex-col items-start text-left min-w-0">
          <span class="text-xs text-text-secondary leading-tight">{{ currentToastTask.name }}</span>
          <span class="text-sm text-text-primary truncate max-w-[200px] leading-tight">{{
            getStepText(currentToastTask)
          }}</span>
        </div>

        <!-- Badge for multi-tasks -->
        <span
          v-if="badgeCount > 0"
          class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-2xs font-bold"
          >{{ badgeCount }}</span
        >

        <!-- Dismiss -->
        <button
          class="flex-shrink-0 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity ml-1"
          @click.stop="dismiss"
        >
          <BaseIcon name="x" :size="14" />
        </button>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}
</style>
