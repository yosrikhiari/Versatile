<script setup>
import { ref, computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

defineProps({
  changes: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['confirm'])

const localChanges = ref([])

const characterChanges = computed(() => localChanges.value.filter(c => c.type === 'character'))
const locationChanges = computed(() => localChanges.value.filter(c => c.type === 'location'))
const plotThreadChanges = computed(() => localChanges.value.filter(c => c.type === 'plotThread'))

const hasReferencedUnselected = computed(() => {
  return localChanges.value.some(c => c.referenced && !c._selected)
})

function toggleChange(index) {
  localChanges.value[index]._selected = !localChanges.value[index]._selected
}

function keepAll() {
  for (const c of localChanges.value) c._selected = true
}

function discardAll() {
  for (const c of localChanges.value) c._selected = false
}

function handleConfirm() {
  const accepted = localChanges.value.filter(c => c._selected)
  emit('confirm', accepted)
}
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg bg-bg-secondary border border-border-subtle p-4 space-y-2">
      <h3 class="text-sm font-semibold text-text-primary font-ui">Review New Entities</h3>
      <p class="text-xs text-text-hint font-body">
        The writer discovered the following entities during generation.
        <template v-if="changes.length > 0">
          Select which ones to add to your story bible.
        </template>
        <template v-else>
          No new entities were discovered.
        </template>
      </p>
    </div>

    <div v-if="localChanges.length > 0" class="flex gap-2">
      <button
        class="flex-1 py-1.5 text-xs bg-accent text-white rounded-md font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        @click="keepAll"
      >Keep All</button>
      <button
        class="flex-1 py-1.5 text-xs bg-bg-tertiary text-text-secondary rounded-md font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent"
        @click="discardAll"
      >Discard All</button>
    </div>

    <div v-if="hasReferencedUnselected" class="rounded-lg bg-yellow-950/10 border border-yellow-800/20 px-3 py-2">
      <p class="text-xs text-yellow-400 font-ui flex items-center gap-1">
        <BaseIcon name="alert-triangle" :size="12" />
        Some referenced entities are deselected — the story may reference entities not in your bible.
      </p>
    </div>

    <div v-if="characterChanges.length > 0" class="space-y-1.5">
      <h4 class="text-xs uppercase tracking-widest text-text-hint font-ui flex items-center gap-1">
        <BaseIcon name="users" :size="12" />
        Characters ({{ characterChanges.length }})
      </h4>
      <div
        v-for="(change, i) in characterChanges"
        :key="'char-' + i"
        class="rounded-lg bg-bg-secondary border border-border-subtle p-3 flex items-start gap-3"
      >
        <input
          type="checkbox"
          :checked="change._selected"
          class="mt-0.5 accent-accent"
          @change="toggleChange(localChanges.indexOf(change))"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-text-primary font-ui truncate">{{ change.entity.name }}</span>
            <span v-if="change.referenced" class="text-2xs text-accent font-ui shrink-0">Used in prose</span>
            <span v-else class="text-2xs text-text-hint font-ui shrink-0">Inferred</span>
          </div>
          <p v-if="change.entity.role" class="text-xs text-text-hint font-body">Role: {{ change.entity.role }}</p>
          <p v-if="change.entity.description" class="text-xs text-text-secondary font-body truncate">{{ change.entity.description }}</p>
        </div>
      </div>
    </div>

    <div v-if="locationChanges.length > 0" class="space-y-1.5">
      <h4 class="text-xs uppercase tracking-widest text-text-hint font-ui flex items-center gap-1">
        <BaseIcon name="map-pin" :size="12" />
        Locations ({{ locationChanges.length }})
      </h4>
      <div
        v-for="(change, i) in locationChanges"
        :key="'loc-' + i"
        class="rounded-lg bg-bg-secondary border border-border-subtle p-3 flex items-start gap-3"
      >
        <input
          type="checkbox"
          :checked="change._selected"
          class="mt-0.5 accent-accent"
          @change="toggleChange(localChanges.indexOf(change))"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-text-primary font-ui truncate">{{ change.entity.name }}</span>
            <span v-if="change.referenced" class="text-2xs text-accent font-ui shrink-0">Used in prose</span>
            <span v-else class="text-2xs text-text-hint font-ui shrink-0">Inferred</span>
          </div>
          <p v-if="change.entity.type" class="text-xs text-text-hint font-body">Type: {{ change.entity.type }}</p>
          <p v-if="change.entity.description" class="text-xs text-text-secondary font-body truncate">{{ change.entity.description }}</p>
        </div>
      </div>
    </div>

    <div v-if="plotThreadChanges.length > 0" class="space-y-1.5">
      <h4 class="text-xs uppercase tracking-widest text-text-hint font-ui flex items-center gap-1">
        <BaseIcon name="git-branch" :size="12" />
        Plot Threads ({{ plotThreadChanges.length }})
      </h4>
      <div
        v-for="(change, i) in plotThreadChanges"
        :key="'thread-' + i"
        class="rounded-lg bg-bg-secondary border border-border-subtle p-3 flex items-start gap-3"
      >
        <input
          type="checkbox"
          :checked="change._selected"
          class="mt-0.5 accent-accent"
          @change="toggleChange(localChanges.indexOf(change))"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-text-primary font-ui truncate">{{ change.entity.title }}</span>
            <span :class="['px-1.5 py-0.5 rounded text-2xs font-ui', change.entity.status === 'open' ? 'text-green-400 bg-green-950/30' : change.entity.status === 'resolved' ? 'text-gray-400 bg-gray-800/30' : 'text-yellow-400 bg-yellow-950/30']">{{ change.entity.status || 'open' }}</span>
            <span v-if="change.referenced" class="text-2xs text-accent font-ui shrink-0">Used</span>
          </div>
          <p v-if="change.entity.summary" class="text-xs text-text-secondary font-body truncate">{{ change.entity.summary }}</p>
        </div>
      </div>
    </div>

    <button
      v-if="localChanges.length > 0"
      class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
      :disabled="loading"
      @click="handleConfirm"
    >
      <span class="flex items-center justify-center gap-2">
        <BaseIcon name="check-circle" :size="16" />
        {{ loading ? 'Saving...' : 'Confirm & Add to Bible' }}
      </span>
    </button>
  </div>
</template>
