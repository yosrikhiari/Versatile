<script setup>
import { ref, computed, toRef } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: Boolean,
  suggestions: {
    type: [Array, Object],
    default: () => []
  },
  isAnalyzing: {
    type: [Boolean, Object],
    default: false
  },
  error: {
    type: [String, Object],
    default: ''
  }
})

const emit = defineEmits(['close', 'apply', 'apply-all'])

const suggestions = toRef(props, 'suggestions')
const isAnalyzing = toRef(props, 'isAnalyzing')
const error = toRef(props, 'error')

const selectedSuggestions = ref(new Set())

function toggleSuggestion(index) {
  if (selectedSuggestions.value.has(index)) {
    selectedSuggestions.value.delete(index)
  } else {
    selectedSuggestions.value.add(index)
  }
  selectedSuggestions.value = new Set(selectedSuggestions.value)
}

function selectAll() {
  selectedSuggestions.value = new Set(suggestions.value.map((_, i) => i))
}

function selectNone() {
  selectedSuggestions.value = new Set()
}

function getRelationshipIcon(type) {
  switch (type) {
    case 'appears_in':
      return 'map-pin'
    case 'involved_in':
      return 'zap'
    case 'located_at':
      return 'map-pin'
    default:
      return 'link'
  }
}

function getTypeColor(type) {
  switch (type) {
    case 'character':
      return 'var(--vers-entity-character)'
    case 'location':
      return 'var(--vers-entity-location)'
    case 'plotThread':
      return 'var(--vers-entity-plotThread)'
    default:
      return 'var(--vers-default-fallback)'
  }
}

function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'bg-success/20 text-success'
  if (confidence >= 0.6) return 'bg-accent/20 text-accent'
  return 'bg-bg-tertiary text-text-hint'
}

const canApply = computed(() => selectedSuggestions.value.size > 0)
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
          class="bg-bg-tertiary rounded-xl border border-border-subtle shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        >
          <div class="p-6 border-b border-border-subtle">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-semibold text-text-primary">Network Suggestions</h2>
                <p v-if="suggestions.length > 0" class="text-xs text-text-hint mt-1">
                  {{ suggestions.length }} suggestions found. Select which to apply.
                </p>
              </div>
              <button class="text-text-hint hover:text-text-primary" @click="emit('close')">
                <BaseIcon name="x" :size="20" />
              </button>
            </div>
          </div>

          <div v-if="isAnalyzing" class="flex-1 flex items-center justify-center p-8">
            <div class="text-center">
              <BaseIcon name="loader-2" :size="32" class="mx-auto text-accent animate-spin mb-4" />
              <p class="text-text-secondary">Analyzing your story elements...</p>
            </div>
          </div>

          <div v-else-if="error" class="flex-1 flex items-center justify-center p-8">
            <div class="text-center text-danger">
              <BaseIcon name="alert-circle" :size="32" class="mx-auto mb-4" />
              <p>{{ error }}</p>
            </div>
          </div>

          <div
            v-else-if="suggestions.length === 0"
            class="flex-1 flex items-center justify-center p-8"
          >
            <div class="text-center">
              <BaseIcon name="check-circle" :size="32" class="mx-auto text-success mb-4" />
              <p class="text-text-secondary">No new suggestions. Your network looks complete!</p>
            </div>
          </div>

          <div v-else class="flex-1 overflow-y-auto p-4 space-y-3">
            <div class="flex items-center justify-between mb-2">
              <div class="flex gap-2">
                <button class="text-xs text-accent hover:underline" @click="selectAll">
                  Select all
                </button>
                <button
                  class="text-xs text-text-hint hover:text-text-secondary"
                  @click="selectNone"
                >
                  Clear
                </button>
              </div>
              <span class="text-xs text-text-hint"> {{ selectedSuggestions.size }} selected </span>
            </div>

            <div
              v-for="(suggestion, index) in suggestions"
              :key="index"
              :class="[
                'p-4 rounded-lg border cursor-pointer transition-all',
                selectedSuggestions.has(index)
                  ? 'border-accent bg-accent/10'
                  : 'border-border-subtle hover:border-accent/50'
              ]"
              @click="toggleSuggestion(index)"
            >
              <div class="flex items-start gap-3">
                <div
                  :class="[
                    'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                    selectedSuggestions.has(index) ? 'border-accent bg-accent' : 'border-text-hint'
                  ]"
                >
                  <BaseIcon
                    v-if="selectedSuggestions.has(index)"
                    name="check"
                    :size="12"
                    class="text-white"
                  />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span
                      class="px-2 py-0.5 rounded text-2xs font-medium"
                      :style="{
                        backgroundColor: getTypeColor(suggestion.sourceType) + '30',
                        color: getTypeColor(suggestion.sourceType)
                      }"
                    >
                      {{ suggestion.sourceLabel }}
                    </span>
                    <BaseIcon
                      :name="getRelationshipIcon(suggestion.relationshipType)"
                      :size="12"
                      class="text-text-hint"
                    />
                    <span class="text-xs text-text-hint">{{
                      suggestion.relationshipType.replace('_', ' ')
                    }}</span>
                    <BaseIcon name="arrow-right" :size="12" class="text-text-hint" />
                    <span
                      class="px-2 py-0.5 rounded text-2xs font-medium"
                      :style="{
                        backgroundColor: getTypeColor(suggestion.targetType) + '30',
                        color: getTypeColor(suggestion.targetType)
                      }"
                    >
                      {{ suggestion.targetLabel }}
                    </span>
                  </div>

                  <p v-if="suggestion.rationale" class="text-xs text-text-hint mt-2">
                    {{ suggestion.rationale }}
                  </p>

                  <div class="flex items-center gap-2 mt-2">
                    <span
                      :class="[
                        'px-2 py-0.5 rounded text-2xs',
                        getConfidenceClass(suggestion.confidence)
                      ]"
                    >
                      {{ Math.round(suggestion.confidence * 100) }}% match
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="p-4 border-t border-border-subtle flex gap-3">
            <button
              class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              :disabled="!canApply"
              class="flex-1 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-ui"
              @click="emit('apply', Array.from(selectedSuggestions))"
            >
              Apply Selected ({{ selectedSuggestions.size }})
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
