<script setup>
import { computed, onMounted } from 'vue'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useProjectStore } from '../../stores/projectStore'
import draggable from 'vuedraggable'
import BaseIcon from '../shared/BaseIcon.vue'
import EmptyState from '../shared/EmptyState.vue'

const storyBibleStore = useStoryBibleStore()
const projectStore = useProjectStore()

const dragOptions = {
  animation: 200,
  ghostClass: 'ghost',
  dragClass: 'drag',
  axis: 'x'
}

const statusColors = {
  open: 'var(--vers-status-open)',
  in_progress: 'var(--vers-status-in_progress)',
  resolved: 'var(--vers-status-resolved)',
  closed: 'var(--vers-status-closed)'
}

const statusLabels = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed'
}

const sortedThreads = computed(() => {
  return [...storyBibleStore.plotThreads].sort(
    (a, b) => (a.timelineOrder ?? 999) - (b.timelineOrder ?? 999)
  )
})

function onEnd() {
  const orderedIds = sortedThreads.value.map((t) => t.id)
  storyBibleStore.reorderPlotThreads(orderedIds)
}

onMounted(() => {
  if (projectStore.currentProjectId) {
    storyBibleStore.loadAll(projectStore.currentProjectId).then(() => {
      const hasTimelineOrder = storyBibleStore.plotThreads.some((t) => t.timelineOrder != null)
      if (!hasTimelineOrder && storyBibleStore.plotThreads.length > 0) {
        const ids = storyBibleStore.plotThreads.map((t) => t.id)
        storyBibleStore.reorderPlotThreads(ids)
      }
    })
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-secondary overflow-hidden">
    <div class="p-4 border-b border-border-subtle">
      <h2 class="text-lg font-semibold text-text-primary font-ui">Timeline</h2>
      <p class="text-xs text-text-hint mt-1">Drag plot threads to arrange story order</p>
    </div>

    <EmptyState
      v-if="sortedThreads.length === 0"
      icon="layout"
      title="No plot threads yet"
      description="Add threads in the Story Bible to start building your timeline."
      class="flex-1"
    />

    <div v-else class="flex-1 min-h-0 overflow-x-auto scrollbar-thin p-6">
      <div class="relative min-w-max">
        <div class="absolute top-8 left-8 right-8 h-px bg-border-subtle"></div>
        <div class="absolute top-8 left-0 w-4 h-px bg-border-subtle"></div>
        <div class="absolute top-8 right-0 w-4 h-px bg-border-subtle"></div>

        <draggable
          v-model="sortedThreads"
          item-key="id"
          v-bind="dragOptions"
          class="flex gap-4 items-start pt-4"
          @end="onEnd"
        >
          <template #item="{ element: thread }">
            <div class="min-w-[160px] max-w-[180px] relative flex flex-col items-center">
              <div
                class="w-3 h-3 rounded-full mb-2 z-10 ring-2 ring-bg-secondary"
                :style="{
                  backgroundColor: statusColors[thread.status] || 'var(--vers-status-resolved)'
                }"
              ></div>
              <div
                class="w-full bg-bg-tertiary rounded-lg border border-border-subtle overflow-hidden cursor-grab active:cursor-grabbing hover:border-accent/30 transition-colors"
              >
                <div class="p-2.5 border-b border-border-subtle/50">
                  <div class="flex items-start gap-1.5">
                    <BaseIcon
                      name="grip-vertical"
                      :size="14"
                      class="text-text-hint mt-0.5 shrink-0"
                    />
                    <h3
                      class="text-xs font-medium text-text-primary leading-snug line-clamp-2 min-h-[2em]"
                    >
                      {{ thread.title }}
                    </h3>
                  </div>
                </div>
                <div class="px-2.5 py-1.5 flex items-center gap-1.5">
                  <span
                    class="w-1.5 h-1.5 rounded-full shrink-0"
                    :style="{
                      backgroundColor: statusColors[thread.status] || 'var(--vers-status-resolved)'
                    }"
                  ></span>
                  <span class="text-2xs text-text-secondary font-ui">{{
                    statusLabels[thread.status] || thread.status
                  }}</span>
                  <span
                    v-if="thread.notes"
                    class="text-2xs text-text-hint truncate ml-auto max-w-[60px]"
                    >{{ thread.notes }}</span
                  >
                </div>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <div v-if="sortedThreads.length > 0" class="p-3 border-t border-border-subtle text-center">
      <span class="text-xs text-text-hint"
        >{{ sortedThreads.length }} thread{{ sortedThreads.length !== 1 ? 's' : '' }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.ghost {
  @apply opacity-30;
  transition: opacity 0.15s;
}
.drag {
  @apply opacity-90;
}
</style>
