<script setup>
import { ref, computed, watch } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  existingEdge: {
    type: Object,
    default: null
  },
  sourceNode: {
    type: Object,
    default: null
  },
  targetNode: {
    type: Object,
    default: null
  },
  removableNode: {
    type: Object,
    default: null
  },
  characters: {
    type: Array,
    default: () => []
  },
  locations: {
    type: Array,
    default: () => []
  },
  plotThreads: {
    type: Array,
    default: () => []
  },
  groups: {
    type: Array,
    default: () => []
  },
  existingEdges: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'save', 'remove-node', 'save-group-edge'])

const charCharTypes = [
  { value: 'ally', label: 'Ally', description: 'Allied with each other' },
  { value: 'enemy', label: 'Enemy', description: 'Hostile toward each other' },
  { value: 'family', label: 'Family', description: 'Related to each other' },
  { value: 'romantic', label: 'Romantic', description: 'Romantic relationship' },
  { value: 'mentor', label: 'Mentor', description: 'One guides the other' },
  { value: 'rival', label: 'Rival', description: 'Competing with each other' },
  { value: 'neutral', label: 'Neutral', description: 'No strong relationship' }
]

const crossEntityTypes = [
  { value: 'appears_in', label: 'Appears In', description: 'Character is at this location' },
  { value: 'involved_in', label: 'Involved In', description: 'Character participates in plot' },
  { value: 'located_at', label: 'Located At', description: 'Plot occurs at location' },
  { value: 'connects_to', label: 'Connects To', description: 'General connection' }
]

const groupToGroupTypes = [
  { value: 'allied_with', label: 'Allied With', description: 'Groups work together' },
  { value: 'opposed_to', label: 'Opposed To', description: 'Groups are in conflict' },
  { value: 'part_of', label: 'Part Of', description: 'One group belongs to another' },
  { value: 'controls', label: 'Controls', description: 'One group controls another' },
  { value: 'competes_with', label: 'Competes With', description: 'Groups compete for resources' },
  { value: 'neutral', label: 'Neutral', description: 'No direct relationship' }
]

const sourceId = ref('')
const sourceType = ref('')
const targetId = ref('')
const targetType = ref('')
const relationshipType = ref('connects_to')
const description = ref('')

const allEntities = computed(() => {
  const entities = []

  for (const char of props.characters) {
    entities.push({
      id: char.id,
      type: 'character',
      label: char.name,
      sublabel: char.role
    })
  }

  for (const loc of props.locations) {
    entities.push({
      id: loc.id,
      type: 'location',
      label: loc.name,
      sublabel: loc.description?.slice(0, 30)
    })
  }

  for (const thread of props.plotThreads) {
    entities.push({
      id: thread.id,
      type: 'plotThread',
      label: thread.title,
      sublabel: thread.status
    })
  }

  return entities
})

const isCharToChar = computed(() => {
  const sourceEntity = allEntities.value.find(
    (e) => e.id === sourceId.value && e.type === sourceType.value
  )
  const targetEntity = allEntities.value.find(
    (e) => e.id === targetId.value && e.type === targetType.value
  )
  return sourceEntity?.type === 'character' && targetEntity?.type === 'character'
})

const isGroupToGroup = computed(() => {
  return sourceType.value === 'group' && targetType.value === 'group'
})

const relationshipTypes = computed(() => {
  if (isGroupToGroup.value) return groupToGroupTypes
  return isCharToChar.value ? charCharTypes : crossEntityTypes
})

const relationshipLabel = computed(() => {
  if (isGroupToGroup.value) return 'Group Relationship'
  return isCharToChar.value ? 'Relationship Type' : 'Connection Type'
})

const targetOptions = computed(() => {
  if (!sourceId.value || !sourceType.value) return []

  if (sourceType.value === 'group') {
    return (props.groups || []).filter((g) => g.id !== sourceId.value)
  }

  return allEntities.value.filter((e) => {
    if (e.id === sourceId.value && e.type === sourceType.value) return false
    if (targetType.value && e.type !== targetType.value) return false
    return true
  })
})

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      if (props.existingEdge) {
        sourceId.value = props.existingEdge.sourceId
        sourceType.value = props.existingEdge.sourceType
        targetId.value = props.existingEdge.targetId
        targetType.value = props.existingEdge.targetType
        relationshipType.value = props.existingEdge.relationshipType
        description.value = props.existingEdge.description || ''
      } else if (props.sourceNode) {
        const [prefix, id] = props.sourceNode.id.split('-')
        if (prefix === 'group') {
          sourceType.value = 'group'
          sourceId.value = props.sourceNode.id
        } else {
          const PREFIX_MAP = { char: 'character', loc: 'location' }
          sourceType.value = PREFIX_MAP[prefix] || 'plotThread'
          sourceId.value = id
        }

        if (props.targetNode) {
          targetType.value = 'group'
          targetId.value = props.targetNode.id
        } else {
          targetId.value = ''
          targetType.value = ''
        }
        relationshipType.value = 'connects_to'
        description.value = ''
      } else {
        sourceId.value = ''
        sourceType.value = ''
        targetId.value = ''
        targetType.value = ''
        relationshipType.value = 'connects_to'
        description.value = ''
      }
    }
  }
)

watch([sourceId, targetId, sourceType], () => {
  const charCharTypeValues = charCharTypes.map((t) => t.value)
  const groupTypeValues = groupToGroupTypes.map((t) => t.value)

  if (isGroupToGroup.value && !groupTypeValues.includes(relationshipType.value)) {
    relationshipType.value = 'allied_with'
  } else if (isCharToChar.value && !charCharTypeValues.includes(relationshipType.value)) {
    relationshipType.value = 'ally'
  } else if (
    !isCharToChar.value &&
    !isGroupToGroup.value &&
    charCharTypeValues.includes(relationshipType.value)
  ) {
    relationshipType.value = 'connects_to'
  }
})

function handleSourceChange() {
  const entity = allEntities.value.find(
    (e) => e.id === sourceId.value && e.type === sourceType.value
  )
  if (entity) {
    targetId.value = ''
    targetType.value = sourceType.value === 'group' ? 'group' : ''
  }
}

function handleTargetChange() {
  const entity = allEntities.value.find((e) => e.id === targetId.value)
  if (entity) {
    targetType.value = entity.type
  }
}

function handleGroupTargetChange(groupId) {
  targetId.value = groupId
  targetType.value = 'group'
}

const isValid = computed(() => {
  return sourceId.value && targetId.value && relationshipType.value
})

function handleSave() {
  if (!isValid.value) {
    return
  }

  if (isGroupToGroup.value) {
    const groupEdgeData = {
      sourceGroupId: sourceId.value,
      targetGroupId: targetId.value,
      relationshipType: relationshipType.value,
      description: description.value
    }
    emit('save-group-edge', groupEdgeData)
  } else {
    const connectionData = {
      sourceId: sourceId.value,
      sourceType: sourceType.value,
      targetId: targetId.value,
      targetType: targetType.value,
      relationshipType: relationshipType.value,
      description: description.value
    }
    emit('save', connectionData)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/50"
        @click.self="emit('close')"
      >
        <div
          class="bg-bg-tertiary rounded-xl border border-border-subtle shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto"
        >
          <div class="p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-semibold text-text-primary">
                {{ existingEdge ? 'Edit Connection' : 'Add Connection' }}
              </h2>
              <button class="text-text-hint hover:text-text-primary" @click="emit('close')">
                <BaseIcon name="x" :size="20" />
              </button>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs text-text-hint font-ui mb-1.5">From</label>
                <div class="flex gap-2">
                  <select
                    v-model="sourceType"
                    class="flex-1 px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm font-ui"
                    @change="handleSourceChange"
                  >
                    <option value="">Type</option>
                    <option value="character">Character</option>
                    <option value="location">Location</option>
                    <option value="plotThread">Plot Thread</option>
                    <option value="group">Group</option>
                  </select>
                  <select
                    v-if="sourceType !== 'group'"
                    v-model="sourceId"
                    class="flex-[2] px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm font-ui"
                    :disabled="!sourceType"
                    @change="handleSourceChange"
                  >
                    <option value="">Select...</option>
                    <option
                      v-for="entity in allEntities.filter((e) => e.type === sourceType)"
                      :key="`${entity.type}-${entity.id}`"
                      :value="entity.id"
                    >
                      {{ entity.label }}
                    </option>
                  </select>
                  <select
                    v-else
                    v-model="sourceId"
                    class="flex-[2] px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm font-ui"
                    :disabled="!sourceType"
                    @change="handleSourceChange"
                  >
                    <option value="">Select...</option>
                    <option v-for="group in groups" :key="group.id" :value="group.id">
                      {{ group.name || 'Unnamed Group' }}
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs text-text-hint font-ui mb-1.5">To</label>
                <div class="flex gap-2">
                  <select
                    v-model="targetType"
                    :disabled="sourceType === 'group'"
                    class="flex-1 px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm font-ui"
                  >
                    <option value="">Type</option>
                    <option v-if="sourceType !== 'group'" value="character">Character</option>
                    <option v-if="sourceType !== 'group'" value="location">Location</option>
                    <option v-if="sourceType !== 'group'" value="plotThread">Plot Thread</option>
                    <option value="group">Group</option>
                  </select>
                  <select
                    v-if="targetType !== 'group'"
                    v-model="targetId"
                    class="flex-[2] px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm font-ui"
                    :disabled="!sourceId"
                    @change="handleTargetChange"
                  >
                    <option value="">Select...</option>
                    <option
                      v-for="entity in targetOptions"
                      :key="`${entity.type}-${entity.id}`"
                      :value="entity.id"
                    >
                      {{ entity.label }}
                    </option>
                  </select>
                  <select
                    v-else
                    v-model="targetId"
                    class="flex-[2] px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm font-ui"
                    :disabled="!sourceId"
                    @change="() => handleGroupTargetChange(targetId)"
                  >
                    <option value="">Select...</option>
                    <option v-for="group in groups" :key="group.id" :value="group.id">
                      {{ group.name || 'Unnamed Group' }}
                    </option>
                  </select>
                </div>
              </div>

              <div v-if="sourceId && targetId">
                <label class="block text-xs text-text-hint font-ui mb-1.5">
                  {{ relationshipLabel }}
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="rel in relationshipTypes"
                    :key="rel.value"
                    :class="[
                      'p-2 text-left border rounded-lg transition-colors',
                      relationshipType === rel.value
                        ? 'border-accent bg-accent/10 text-text-primary'
                        : 'border-border-subtle hover:border-accent/50'
                    ]"
                    @click="relationshipType = rel.value"
                  >
                    <div class="text-sm font-medium font-ui">{{ rel.label }}</div>
                    <div class="text-2xs text-text-hint">{{ rel.description }}</div>
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-xs text-text-hint font-ui mb-1.5">Notes (optional)</label>
                <textarea
                  v-model="description"
                  rows="2"
                  class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm font-ui resize-none"
                  placeholder="Add notes about this connection..."
                ></textarea>
              </div>
            </div>

            <div v-if="removableNode" class="mt-6 pt-4 border-t border-border-subtle">
              <button
                class="w-full py-2 bg-bg-secondary text-danger rounded-lg font-medium hover:bg-surface-hover font-ui"
                @click="emit('remove-node', removableNode)"
              >
                Remove from canvas
              </button>
            </div>
            <div class="flex gap-3 mt-4">
              <button
                class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                :disabled="!isValid"
                class="btn-primary flex-1 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-ui"
                @click="handleSave"
              >
                {{ existingEdge ? 'Save Changes' : 'Add Connection' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
select {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

select option {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
