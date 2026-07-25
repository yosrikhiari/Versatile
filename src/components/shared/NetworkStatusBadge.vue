<script setup>
import { computed } from 'vue'
import { useNetworkStatus } from '../../composables/useNetworkStatus'
import BaseIcon from './BaseIcon.vue'

const { isOnline, state, pendingCount, hasPending } = useNetworkStatus()

// Only render when there is something worth surfacing: offline, syncing,
// an error, or queued changes. Steady "online + nothing pending" stays silent.
const visible = computed(
  () => !isOnline.value || state.value === 'syncing' || state.value === 'error' || hasPending.value
)

const display = computed(() => {
  if (!isOnline.value) {
    return {
      icon: 'cloud-off',
      label: pendingCount.value > 0 ? `Offline · ${pendingCount.value} unsynced` : 'Offline',
      tone: 'text-warning',
      spin: false
    }
  }
  if (state.value === 'error') {
    return { icon: 'cloud-alert', label: 'Sync error', tone: 'text-danger', spin: false }
  }
  if (state.value === 'syncing') {
    return { icon: 'refresh-cw', label: 'Syncing…', tone: 'text-text-hint', spin: true }
  }
  // online + idle but pending changes queued
  return {
    icon: 'cloud-upload',
    label: `${pendingCount.value} to sync`,
    tone: 'text-text-hint',
    spin: false
  }
})
</script>

<template>
  <Transition name="anim-fade">
    <div
      v-if="visible"
      class="flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs font-ui tabular-nums"
      :class="display.tone"
      role="status"
      :aria-label="display.label"
      :title="display.label"
    >
      <BaseIcon :name="display.icon" :size="12" :class="{ 'animate-spin': display.spin }" />
      <span class="hidden md:inline">{{ display.label }}</span>
    </div>
  </Transition>
</template>
