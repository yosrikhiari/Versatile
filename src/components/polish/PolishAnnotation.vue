<script setup>
import { computed, ref } from 'vue'
import BaseButton from '../ui/BaseButton.vue'

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
  <article class="py-3">
    <p class="label-micro text-text-hint mb-1.5">{{ typeLabel }}</p>

    <template v-if="showDiff && hasSuggestion && isIdentical">
      <p class="font-ui text-xs text-warning">The suggestion is identical to the original.</p>
    </template>
    <template v-else-if="hasSuggestion">
      <p class="font-manuscript text-sm text-text-hint line-through leading-6">
        {{ annotation.original }}
      </p>
      <p class="font-manuscript text-sm text-text-primary leading-6">{{ annotation.suggestion }}</p>
    </template>

    <p v-if="annotation.reason" class="mt-1.5 font-ui text-xs text-text-hint leading-4">
      {{ annotation.reason }}
    </p>

    <div class="mt-2.5 flex items-center gap-1">
      <template v-if="showDiff && hasSuggestion && isIdentical">
        <BaseButton variant="ghost" size="sm" @click="handleDismiss">Dismiss</BaseButton>
      </template>
      <template v-else>
        <BaseButton variant="secondary" size="sm" icon="check" @click="handleAccept">
          {{ showDiff ? 'Confirm' : 'Accept' }}
        </BaseButton>
        <BaseButton v-if="showDiff" variant="ghost" size="sm" @click="handleCancel"
          >Cancel</BaseButton
        >
        <template v-else>
          <BaseButton
            variant="ghost"
            size="sm"
            icon="clock"
            title="Decide later"
            @click="emit('flag', annotation.id)"
          >
            Later
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            icon="x"
            title="Reject"
            @click="emit('reject', annotation.id)"
          >
            Reject
          </BaseButton>
        </template>
      </template>
    </div>
  </article>
</template>
