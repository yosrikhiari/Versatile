<script setup>
import { ref, computed, watch } from 'vue'
import { useVolumeStore } from '../../stores/volumeStore'
import { useVolumeStoryNetworkStore } from '../../stores/volumeStoryNetworkStore'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  entityType: {
    type: String,
    required: true,
    validator: (v) => ['character', 'location', 'plotThread'].includes(v)
  },
  entityId: {
    type: Number,
    required: true
  },
  entityName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:assigned', 'close'])

const volumeStore = useVolumeStore()
const networkStore = useVolumeStoryNetworkStore()

const loading = ref(false)
const searchQuery = ref('')

const filteredVolumes = computed(() => {
  if (!searchQuery.value) {
    return volumeStore.volumes
  }
  return volumeStore.volumes.filter((v) =>
    v.title.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

const assignedVolumeIds = ref([])

async function loadAssignedVolumes() {
  const ids = await networkStore.getEntityVolumes?.(props.entityType, props.entityId)
  assignedVolumeIds.value = ids || []
}

async function toggleVolume(volumeId) {
  loading.value = true
  try {
    if (assignedVolumeIds.value.includes(volumeId)) {
      await networkStore.removeEntityFromVolume(props.entityType, props.entityId, volumeId)
      assignedVolumeIds.value = assignedVolumeIds.value.filter((id) => id !== volumeId)
    } else {
      await networkStore.assignEntityToVolume(props.entityType, props.entityId, volumeId, false)
      assignedVolumeIds.value.push(volumeId)
    }
    emit('update:assigned', assignedVolumeIds.value)
  } catch (error) {
    console.error('Failed to toggle volume assignment:', error)
  } finally {
    loading.value = false
  }
}

async function removeFromAllVolumes() {
  loading.value = true
  try {
    await networkStore.removeEntityFromAllVolumes(props.entityType, props.entityId)
    assignedVolumeIds.value = []
    emit('update:assigned', [])
  } catch (error) {
    console.error('Failed to remove from all volumes:', error)
  } finally {
    loading.value = false
  }
}

watch(() => props.entityId, loadAssignedVolumes, { immediate: true })
</script>

<template>
  <div class="bg-bg-tertiary border border-border-subtle rounded-lg overflow-hidden">
    <div class="p-3 border-b border-border-subtle bg-bg-secondary">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-text-primary">Assign "{{ entityName }}" to Volumes</h3>
        <button
          class="text-text-hint hover:text-text-primary transition-colors"
          @click="$emit('close')"
        >
          <BaseIcon name="x" :size="16" />
        </button>
      </div>
    </div>

    <div class="p-3 border-b border-border-subtle">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search volumes..."
        class="w-full px-3 py-1.5 text-sm bg-bg-secondary border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>

    <div class="max-h-64 overflow-y-auto p-2 space-y-1">
      <div
        v-for="volume in filteredVolumes"
        :key="volume.id"
        class="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors"
        :class="{
          'bg-accent/10 border border-accent/30': assignedVolumeIds.includes(volume.id),
          'hover:bg-surface-hover': !loading
        }"
        @click="!loading && toggleVolume(volume.id)"
      >
        <div
          class="w-3 h-3 rounded-full flex-shrink-0"
          :style="{ backgroundColor: volume.color }"
        />
        <span class="text-sm text-text-primary flex-1 truncate">{{ volume.title }}</span>
        <BaseIcon
          v-if="assignedVolumeIds.includes(volume.id)"
          name="check"
          :size="14"
          class="text-accent flex-shrink-0"
        />
      </div>

      <div v-if="filteredVolumes.length === 0" class="text-center py-4 text-sm text-text-hint">
        No volumes found
      </div>
    </div>

    <div class="p-3 border-t border-border-subtle flex items-center justify-between">
      <span class="text-xs text-text-hint"> Assigned: {{ assignedVolumeIds.length }} </span>
      <div class="flex gap-1">
        <button
          :disabled="loading || assignedVolumeIds.length === 0"
          class="text-xs px-2 py-1 text-danger hover:bg-danger/10 rounded disabled:opacity-50"
          @click="removeFromAllVolumes"
        >
          Remove from all
        </button>
        <button
          class="text-xs px-2 py-1 bg-accent text-accent-foreground rounded"
          @click="$emit('close')"
        >
          Done
        </button>
      </div>
    </div>

    <div v-if="loading" class="absolute inset-0 bg-black/20 flex items-center justify-center">
      <BaseIcon name="loader-2" :size="20" class="animate-spin text-accent" />
    </div>
  </div>
</template>
