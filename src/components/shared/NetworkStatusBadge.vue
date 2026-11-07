<script setup>
import { computed } from 'vue'
import { useNetworkStatus } from '../../composables/useNetworkStatus'
import BaseIcon from './BaseIcon.vue'

const emit = defineEmits(['activate'])
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
    <button
      v-if="visible"
      type="button"
      class="flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs font-ui tabular-nums transition-colors hover:bg-bg-tertiary/60 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      :class="display.tone"
      :aria-label="`${display.label}. Open sync settings`"
      :title="`${display.label} — Open sync settings`"
      @click="emit('activate')"
    >
      <BaseIcon :name="display.icon" :size="12" :class="{ 'animate-spin': display.spin }" />
      <span class="hidden md:inline">{{ display.label }}</span>
    </button>
  </Transition>
</template>
