<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useActivityLog } from '../../composables/useActivityLog'
import BaseIcon from './BaseIcon.vue'

const log = useActivityLog()

const now = ref(Date.now())
let timer = null

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const expandedTasks = ref(new Set())
const expandedPhases = ref(new Set())

function toggleTask(taskId) {
  if (expandedTasks.value.has(taskId)) expandedTasks.value.delete(taskId)
  else expandedTasks.value.add(taskId)
}

function togglePhase(key) {
  if (expandedPhases.value.has(key)) expandedPhases.value.delete(key)
  else expandedPhases.value.add(key)
}

function formatElapsed(startedAt) {
  const ms = now.value - startedAt
  if (ms < 1000) return '<1s'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  if (min < 60) return `${min}m ${s}s`
  const hr = Math.floor(min / 60)
  const m = min % 60
  return `${hr}h ${m}m`
}

function statusBadgeClass(status) {
  switch (status) {
    case 'running': return 'text-accent border-accent/30 bg-accent/10'
    case 'done': return 'text-success border-success/30 bg-success/10'
    case 'failed': return 'text-danger border-danger/30 bg-danger/10'
    case 'queued': return 'text-text-secondary border-border-subtle bg-bg-secondary'
    default: return 'text-text-secondary border-border-subtle bg-bg-secondary'
  }
}

function statusIcon(status) {
  switch (status) {
    case 'running': return 'loader'
    case 'done': return 'check-circle'
    case 'failed': return 'alert-circle'
    case 'queued': return 'clock'
    default: return 'circle'
  }
}

const hasActive = computed(() => log.activeTasks.value.length > 0)
const hasCompleted = computed(() => log.completedTasks.value.length > 0)
</script>

<template>
  <Transition name="drawer-slide">
    <div
      v-if="log.drawerOpen.value"
      class="fixed inset-0 z-[90]"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/30 backdrop-blur-sm"
        @click="log.drawerOpen.value = false"
      />

      <!-- Drawer panel -->
      <div
        class="absolute top-0 right-0 bottom-0 w-[420px] max-w-[90vw] bg-bg-primary border-l border-border-subtle shadow-2xl flex flex-col overflow-hidden"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-bg-secondary/50">
          <div class="flex items-center gap-2">
            <BaseIcon name="activity" :size="18" class="text-accent" />
            <h2 class="text-sm font-display text-text-primary font-medium">Activity</h2>
            <span v-if="hasActive" class="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">{{ log.activeTasks.value.length }} active</span>
          </div>
          <button
            class="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-bg-tertiary"
            @click="log.drawerOpen.value = false"
          >
            <BaseIcon name="x" :size="16" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <!-- Active tasks -->
          <div v-if="hasActive" class="space-y-3">
            <h3 class="text-xs font-ui font-medium text-text-secondary uppercase tracking-wider">Running</h3>
            <div
              v-for="task in log.activeTasks.value"
              :key="task.id"
              class="rounded-xl border border-border-subtle bg-bg-tertiary overflow-hidden"
            >
              <!-- Task header -->
              <button
                class="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-secondary/50 transition-colors text-left"
                @click="toggleTask(task.id)"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <BaseIcon
                    :name="task.type === 'generation' ? 'bot' : task.type === 'critic' ? 'scroll-text' : 'activity'"
                    :size="16"
                    class="flex-shrink-0 text-accent"
                  />
                  <div class="min-w-0">
                    <div class="text-sm text-text-primary truncate">{{ task.name }}</div>
                    <div class="text-xs text-text-secondary truncate">
                      {{ task.progress.label || task.phases.find(p => p.status === 'running')?.name || '' }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span class="text-xs text-text-secondary font-mono">{{ formatElapsed(task.startedAt) }}</span>
                  <BaseIcon :name="expandedTasks.has(task.id) ? 'chevron-down' : 'chevron-up'" :size="14" class="text-text-secondary" />
                </div>
              </button>

              <!-- Expanded phases -->
              <div v-if="expandedTasks.has(task.id)" class="border-t border-border-subtle divide-y divide-border-subtle/50">
                <div
                  v-for="(phase, pi) in task.phases"
                  :key="pi"
                  class=""
                >
                  <!-- Phase header -->
                  <button
                    class="w-full flex items-center justify-between px-4 py-2 hover:bg-bg-secondary/30 transition-colors text-left"
                    @click="togglePhase(`${task.id}-${pi}`)"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <BaseIcon :name="statusIcon(phase.status)" :size="12" :class="phase.status === 'running' ? 'text-accent animate-spin' : phase.status === 'done' ? 'text-success' : phase.status === 'failed' ? 'text-danger' : 'text-text-secondary'" />
                      <span class="text-xs text-text-primary truncate">{{ phase.name }}</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span
                        class="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider"
                        :class="statusBadgeClass(phase.status)"
                      >{{ phase.status }}</span>
                      <span class="text-xs text-text-secondary font-mono w-14 text-right">{{
                        phase.status === 'running'
                          ? formatElapsed(phase.startedAt)
                          : phase.elapsedMs
                            ? `${Math.round(phase.elapsedMs / 1000)}s`
                            : formatElapsed(phase.startedAt)
                      }}</span>
                      <BaseIcon :name="expandedPhases.has(`${task.id}-${pi}`) ? 'chevron-down' : 'chevron-up'" :size="12" class="text-text-secondary" />
                    </div>
                  </button>

                  <!-- Streaming thought panel -->
                  <Transition name="fade">
                    <div
                      v-if="expandedPhases.has(`${task.id}-${pi}`) && phase.thought"
                      class="px-4 pb-3"
                    >
                      <pre
                        class="text-[11px] font-mono text-text-secondary bg-bg-secondary rounded-lg p-3 max-h-[200px] overflow-y-auto leading-relaxed whitespace-pre-wrap break-all"
                      >{{ phase.thought }}</pre>
                    </div>
                  </Transition>
                </div>
              </div>

              <!-- Collapsed progress summary -->
              <div v-if="!expandedTasks.has(task.id) && task.progress.total > 0 && task.progress.current > 0" class="px-4 pb-3">
                <div class="w-full h-1 rounded-full bg-bg-secondary overflow-hidden">
                  <div
                    class="h-full rounded-full bg-accent transition-all duration-500"
                    :style="{ width: `${Math.round((task.progress.current / task.progress.total) * 100)}%` }"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Completed tasks -->
          <div v-if="hasCompleted" class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-ui font-medium text-text-secondary uppercase tracking-wider">Session Log</h3>
              <button
                class="text-[10px] text-text-secondary hover:text-danger transition-colors"
                @click="log.clearCompleted()"
              >Clear all</button>
            </div>
            <div
              v-for="task in log.completedTasks.value"
              :key="task.id"
              class="rounded-xl border border-border-subtle bg-bg-secondary/30 overflow-hidden"
            >
              <button
                class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-bg-secondary/50 transition-colors text-left"
                @click="toggleTask(task.id)"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <BaseIcon
                    :name="task.status === 'done' ? 'check-circle' : 'alert-circle'"
                    :size="14"
                    :class="task.status === 'done' ? 'text-success' : 'text-danger'"
                  />
                  <span class="text-sm text-text-primary truncate">{{ task.name }}</span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span class="text-xs text-text-secondary font-mono">{{ task.completedAt ? formatElapsed(task.startedAt) + ' total' : '' }}</span>
                  <BaseIcon :name="expandedTasks.has(task.id) ? 'chevron-down' : 'chevron-up'" :size="14" class="text-text-secondary" />
                </div>
              </button>

              <div v-if="expandedTasks.has(task.id) && task.error" class="px-4 pb-3">
                <div class="text-xs text-danger bg-danger/10 rounded-lg p-2">{{ task.error }}</div>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-if="!hasActive && !hasCompleted" class="flex flex-col items-center justify-center py-16 text-text-secondary">
            <BaseIcon name="activity" :size="32" class="opacity-30 mb-3" />
            <p class="text-sm">No activity yet</p>
            <p class="text-xs mt-1">Generation, editing, and analysis tasks appear here</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-slide-enter-from > div:last-child,
.drawer-slide-leave-to > div:last-child {
  transform: translateX(100%);
}
.drawer-slide-enter-from > div:first-child,
.drawer-slide-leave-to > div:first-child {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
