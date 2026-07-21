<script setup>
import { ref, computed } from 'vue'
import { useVolumeStore } from '../../stores/volumeStore'
import BaseIcon from '../shared/BaseIcon.vue'
import VolumeAssignmentPanel from '../volume/VolumeAssignmentPanel.vue'
import CharacterPortrait from './CharacterPortrait.vue'

const props = defineProps({
  entity: {
    type: Object,
    required: true
  },
  entityType: {
    type: String,
    required: true,
    validator: (v) => ['character', 'location', 'plotThread'].includes(v)
  },
  projectId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['update', 'delete', 'updated'])

const volumeStore = useVolumeStore()

const expanded = ref(false)
const showVolumeAssignment = ref(false)

const iconNames = {
  character: 'user',
  location: 'map-pin',
  plotThread: 'zap'
}

const assignedVolumes = computed(() => {
  return props.entity.volumeIds || []
})

function onVolumeAssignUpdate() {
  emit('update')
}

function onPortraitUpdated() {
  emit('updated')
}
</script>

<template>
  <div class="bg-bg-tertiary border border-border-subtle hover:border-accent-muted rounded-lg overflow-hidden transition-all duration-150">
    <div
      class="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-hover hover:-translate-y-[0.5px] active:scale-[0.99] transition-all duration-150"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <div v-if="entityType === 'character'" class="flex-shrink-0">
          <img
            v-if="entity.portrait"
            :src="entity.portrait"
            :alt="entity.name"
            class="w-8 h-8 rounded-full object-cover"
          />
          <BaseIcon v-else :name="iconNames[entityType]" :size="18" class="text-text-hint" />
        </div>
        <BaseIcon v-else :name="iconNames[entityType]" :size="18" class="text-text-hint" />
        <span class="font-medium text-text-primary">{{ entity.name }}</span>
        <div v-if="assignedVolumes.length > 0" class="flex gap-0.5 ml-1">
          <div
            v-for="volId in assignedVolumes.slice(0, 3)"
            :key="volId"
            class="w-4 h-4 rounded text-2xs flex items-center justify-center text-white font-bold"
            :style="{
              backgroundColor:
                volumeStore.volumes.find((v) => v.id === volId)?.color ||
                'var(--vers-default-fallback)'
            }"
            :title="volumeStore.volumes.find((v) => v.id === volId)?.title"
          >
            {{ volumeStore.volumes.find((v) => v.id === volId)?.title?.charAt(0) || '?' }}
          </div>
          <div
            v-if="assignedVolumes.length > 3"
            class="w-4 h-4 rounded text-2xs flex items-center justify-center bg-bg-secondary text-text-hint"
          >
            +{{ assignedVolumes.length - 3 }}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <span
          v-if="entityType === 'character' && entity.role"
          class="text-xs px-2 py-0.5 bg-bg-secondary text-text-secondary rounded"
        >
          {{ entity.role }}
        </span>
        <button
          class="p-0.5 hover:bg-surface-hover rounded transition-colors"
          title="Assign to volumes"
          @click.stop="showVolumeAssignment = !showVolumeAssignment"
        >
          <BaseIcon name="layers" :size="14" class="text-text-hint" />
        </button>
      </div>
    </div>

    <div v-if="showVolumeAssignment" class="absolute z-50" style="min-width: 280px">
      <VolumeAssignmentPanel
        :entity-type="entityType"
        :entity-id="entity.id"
        :entity-name="entity.name"
        @update:assigned="onVolumeAssignUpdate"
        @close="showVolumeAssignment = false"
      />
    </div>

    <div v-if="expanded" class="p-3 border-t border-border-subtle space-y-3">
      <div v-if="entity.notes" class="text-sm text-text-secondary">
        {{ entity.notes }}
      </div>
      <div v-if="entity.goal && entityType === 'character'" class="text-sm">
        <span class="text-text-hint">Goal:</span>
        <span class="text-text-primary ml-1">{{ entity.goal }}</span>
      </div>
      <div v-if="entity.description" class="text-sm">
        <span class="text-text-hint">Description:</span>
        <span class="text-text-primary ml-1">{{ entity.description }}</span>
      </div>
      <CharacterPortrait
        v-if="entityType === 'character'"
        :character="entity"
        :project-id="projectId"
        class="mt-2"
        @updated="onPortraitUpdated"
      />
      <div class="flex gap-2">
        <button class="text-xs text-danger hover:opacity-80" @click="$emit('delete', entity.id)">
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
