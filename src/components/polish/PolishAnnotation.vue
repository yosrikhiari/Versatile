<script setup>
import { computed, ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  annotation: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['accept', 'reject', 'flag'])

const showDiff = ref(false)

const hasSuggestion = computed(() => props.annotation.original && props.annotation.suggestion)

const isIdentical = computed(() => props.annotation.original === props.annotation.suggestion)

const typeColors = {
  weak_verb: 'bg-bg-secondary text-warning',
  repetition: 'bg-bg-secondary text-danger',
  pacing: 'bg-bg-secondary text-info',
  antecedent: 'bg-bg-secondary text-text-secondary'
}

const typeBadge = computed(
  () => typeColors[props.annotation.type] || 'bg-bg-tertiary text-text-hint'
)
const typeLabel = computed(() => {
  const labels = {
    weak_verb: 'Weak Verb',
    repetition: 'Repetition',
    pacing: 'Pacing',
    antecedent: 'Antecedent'
  }
  return labels[props.annotation.type] || props.annotation.type
})

function handleAccept() {
  if (!hasSuggestion.value) {
    emit('accept', props.annotation.id)
    return
  }
  if (isIdentical.value) {
    showDiff.value = true
    return
  }
  if (!showDiff.value) {
    showDiff.value = true
  } else {
    emit('accept', props.annotation.id)
    showDiff.value = false
  }
}

function handleCancel() {
  showDiff.value = false
}

function handleDismiss() {
  emit('reject', props.annotation.id)
}
</script>

<template>
  <div class="bg-bg-tertiary border border-border-subtle rounded-lg p-3">
    <div class="flex items-center gap-2 mb-2">
      <span :class="['px-2 py-0.5 text-xs rounded-full font-ui', typeBadge]">
        {{ typeLabel }}
      </span>
    </div>

    <div
      v-if="showDiff && hasSuggestion"
      class="mb-3 p-2 bg-bg-secondary rounded border border-border-subtle"
    >
      <template v-if="isIdentical">
        <p class="text-xs text-warning font-ui">Suggestion matches original text</p>
        <div class="mt-2">
          <button
            class="py-1 px-3 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-surface-hover font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleDismiss"
          >
            Dismiss
          </button>
        </div>
      </template>
      <template v-else>
        <p class="text-xs text-text-hint mb-1 font-ui">Original:</p>
        <p class="text-sm text-text-hint line-through">{{ annotation.original }}</p>
        <p class="text-xs text-accent mt-2 mb-1 font-ui">Replacement:</p>
        <p class="text-sm text-accent">{{ annotation.suggestion }}</p>
      </template>
    </div>

    <div v-else class="text-sm space-y-1">
      <p class="text-text-hint line-through">{{ annotation.original }}</p>
      <p class="text-accent">{{ annotation.suggestion }}</p>
    </div>

    <p v-if="annotation.reason" class="text-xs text-text-hint italic mt-2">
      {{ annotation.reason }}
    </p>

    <div class="flex gap-2 mt-3">
      <button
        class="flex-1 py-1 text-xs btn-primary rounded font-ui focus:outline-none focus:ring-2 focus:ring-accent"
        @click="handleAccept"
      >
        {{ showDiff ? 'Confirm' : 'Accept' }}
      </button>
      <template v-if="showDiff">
        <button
          class="py-1 px-3 text-xs bg-bg-secondary text-text-secondary rounded hover:bg-surface-hover font-ui focus:outline-none focus:ring-2 focus:ring-accent"
          @click="handleCancel"
        >
          Cancel
        </button>
      </template>
      <template v-else>
        <button
          class="p-1.5 text-text-hint hover:text-text-secondary font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded"
          title="Decide later"
          @click="emit('flag', annotation.id)"
        >
          <BaseIcon name="clock" :size="14" />
        </button>
        <button
          class="p-1.5 text-text-hint hover:text-danger font-ui focus:outline-none focus:ring-2 focus:ring-accent rounded"
          title="Reject"
          @click="emit('reject', annotation.id)"
        >
          <BaseIcon name="x" :size="14" />
        </button>
      </template>
    </div>
  </div>
</template>
