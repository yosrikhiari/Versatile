<script setup>
import { ref, computed, watch } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: Boolean,
  suggestions: {
    type: Array,
    default: () => []
  },
  groups: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'apply'])

const checkedSuggestions = ref(new Set())
const checkedGroups = ref(new Set())

watch(() => props.show, (newVal) => {
  if (newVal) {
    checkedSuggestions.value = new Set(props.suggestions.map((_, i) => i))
    checkedGroups.value = new Set(props.groups.map((_, i) => i))
  }
})

function toggleSuggestion(index) {
  const newSet = new Set(checkedSuggestions.value)
  if (newSet.has(index)) {
    newSet.delete(index)
  } else {
    newSet.add(index)
  }
  checkedSuggestions.value = newSet
}

function toggleGroup(index) {
  const newSet = new Set(checkedGroups.value)
  if (newSet.has(index)) {
    newSet.delete(index)
  } else {
    newSet.add(index)
  }
  checkedGroups.value = newSet
}

function selectAll() {
  checkedSuggestions.value = new Set(props.suggestions.map((_, i) => i))
  checkedGroups.value = new Set(props.groups.map((_, i) => i))
}

function selectNone() {
  checkedSuggestions.value = new Set()
  checkedGroups.value = new Set()
}

function getRelationshipIcon(type) {
  switch (type) {
    case 'appears_in': return 'map-pin'
    case 'involved_in': return 'zap'
    case 'located_at': return 'map-pin'
    case 'ally': return 'heart'
    case 'enemy': return 'sword'
    case 'family': return 'users'
    case 'romantic': return 'heart'
    case 'mentor': return 'graduation-cap'
    case 'rival': return 'crosshair'
    default: return 'link'
  }
}

function getTypeColor(type) {
  switch (type) {
    case 'character': return 'var(--vers-entity-character)'
    case 'location': return 'var(--vers-entity-location)'
    case 'plotThread': return 'var(--vers-entity-plotThread)'
    case 'character_group': return 'var(--vers-entity-character)'
    case 'location_group': return 'var(--vers-entity-location)'
    default: return 'var(--vers-default-fallback)'
  }
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'bg-green-500/20 text-green-400'
  if (confidence >= 0.65) return 'bg-accent/20 text-accent'
  return 'bg-bg-tertiary text-text-hint'
}

const canApply = computed(() => checkedSuggestions.value.size > 0 || checkedGroups.value.size > 0)

const totalSelected = computed(() => checkedSuggestions.value.size + checkedGroups.value.size)

function handleApply() {
  const suggestionsLen = props.suggestions.length
  const allChecked = [
    ...checkedSuggestions.value,
    ...[...checkedGroups.value].map(i => i + suggestionsLen)
  ]
  emit('apply', allChecked)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="emit('close')"
      >
        <div class="bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
            <div class="flex items-center gap-2">
              <BaseIcon name="sparkles" :size="18" class="text-accent" />
              <h2 class="font-medium text-text-primary">Apply Suggestions</h2>
            </div>
            <button
              class="p-1 text-text-hint hover:text-text-primary rounded hover:bg-surface-hover transition-colors"
              @click="emit('close')"
            >
              <BaseIcon name="x" :size="18" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div v-if="groups.length > 0" class="p-4 border-b border-border-subtle">
              <h3 class="text-sm font-medium text-text-primary mb-3">Groups ({{ groups.length }})</h3>
              <div class="space-y-2">
                <div 
                  v-for="(group, index) in groups" 
                  :key="'g-' + index"
                  class="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
                  @click="toggleGroup(index)"
                >
                  <input 
                    type="checkbox" 
                    :checked="checkedGroups.has(index)"
                    class="mt-1 w-4 h-4 rounded border-border-subtle text-accent focus:ring-accent bg-bg-secondary"
                    @click.stop="toggleGroup(index)"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span 
                        class="px-2 py-0.5 text-xs rounded-full text-white"
                        :style="{ backgroundColor: getTypeColor(group.type) }"
                      >
                        {{ group.type || 'group' }}
                      </span>
                      <span class="text-text-primary font-medium">{{ group.name }}</span>
                    </div>
                    <p v-if="group.rationale" class="text-xs text-text-muted mt-1">
                      {{ group.rationale }}
                    </p>
                    <div v-if="group.members" class="flex items-center gap-1 mt-2 flex-wrap">
                      <span 
                        v-for="member in group.members" 
                        :key="member.id"
                        class="px-2 py-0.5 text-xs rounded-full bg-bg-secondary text-text-secondary"
                      >
                        {{ member.type }}: {{ member.id }}
                      </span>
                    </div>
                  </div>
                  <span 
                    class="px-2 py-1 text-xs rounded-full whitespace-nowrap"
                    :class="getConfidenceClass(group.confidence)"
                  >
                    {{ Math.round((group.confidence || 0) * 100) }}%
                  </span>
                </div>
              </div>
            </div>

            <div v-if="suggestions.length > 0" class="p-4">
              <h3 class="text-sm font-medium text-text-primary mb-3">Connections ({{ suggestions.length }})</h3>
              <div class="space-y-2">
                <div 
                  v-for="(suggestion, index) in suggestions" 
                  :key="'s-' + index"
                  class="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
                  @click="toggleSuggestion(index)"
                >
                  <input 
                    type="checkbox" 
                    :checked="checkedSuggestions.has(index)"
                    class="mt-1 w-4 h-4 rounded border-border-subtle text-accent focus:ring-accent bg-bg-secondary"
                    @click.stop="toggleSuggestion(index)"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span 
                        class="px-2 py-0.5 text-xs rounded-full text-white"
                        :style="{ backgroundColor: getTypeColor(suggestion.sourceType) }"
                      >
                        {{ suggestion.sourceType }}
                      </span>
                      <span class="text-text-primary font-medium">{{ suggestion.sourceLabel }}</span>
                      <BaseIcon :name="getRelationshipIcon(suggestion.relationshipType)" :size="14" class="text-text-hint" />
                      <span 
                        class="px-2 py-0.5 text-xs rounded-full text-white"
                        :style="{ backgroundColor: getTypeColor(suggestion.targetType) }"
                      >
                        {{ suggestion.targetType }}
                      </span>
                      <span class="text-text-primary font-medium">{{ suggestion.targetLabel }}</span>
                    </div>
                    <p v-if="suggestion.rationale" class="text-xs text-text-muted mt-1">
                      {{ suggestion.rationale }}
                    </p>
                  </div>
                  <span 
                    class="px-2 py-1 text-xs rounded-full whitespace-nowrap"
                    :class="getConfidenceClass(suggestion.confidence)"
                  >
                    {{ Math.round(suggestion.confidence * 100) }}%
                  </span>
                </div>
              </div>
            </div>

            <div v-if="suggestions.length === 0 && groups.length === 0" class="p-8 text-center text-text-hint">
              No suggestions found with current settings
            </div>
          </div>

          <div class="p-4 border-t border-border-subtle flex justify-between items-center shrink-0">
            <div class="flex gap-2">
              <button 
                class="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded font-medium transition-colors"
                @click="selectAll"
              >
                Select All
              </button>
              <button 
                class="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded font-medium transition-colors"
                @click="selectNone"
              >
                Clear All
              </button>
            </div>
            <div class="flex gap-3">
              <button 
                class="px-4 py-2 text-text-secondary hover:text-text-primary rounded-lg font-medium transition-colors"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button 
                :disabled="!canApply"
                class="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleApply"
              >
                Apply ({{ totalSelected }})
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>