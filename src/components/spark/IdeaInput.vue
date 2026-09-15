<script setup>
import BaseChip from '../ui/BaseChip.vue'
import BaseSegmented from '../ui/BaseSegmented.vue'
const props = defineProps({
  idea: {
    type: String,
    default: ''
  },
  tone: {
    type: String,
    default: ''
  },
  targetLength: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:idea', 'update:tone', 'update:targetLength'])

const tones = [
  { value: 'tense', label: 'Tense' },
  { value: 'melancholic', label: 'Melancholic' },
  { value: 'hopeful', label: 'Hopeful' },
  { value: 'confrontational', label: 'Confrontational' },
  { value: 'mysterious', label: 'Mysterious' }
]

const lengths = [
  { value: 'short', label: 'Short (~500w)' },
  { value: 'full', label: 'Full (~2000w)' }
]

function isActive(t) {
  return props.tone ? props.tone.split(',').includes(t) : false
}

function toggleTone(t) {
  const current = props.tone ? props.tone.split(',') : []
  if (current.includes(t)) {
    emit('update:tone', current.filter((x) => x !== t).join(','))
  } else if (current.length < 2) {
    emit('update:tone', [...current, t].join(','))
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <label for="spark-idea" class="label-micro text-text-hint block mb-1.5">The idea</label>
      <textarea
        id="spark-idea"
        :value="idea"
        maxlength="400"
        rows="4"
        class="w-full px-3 py-2.5 bg-bg-tertiary border border-border-subtle rounded-md text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-text-primary font-ui placeholder:text-text-hint transition-colors duration-150"
        placeholder="A shadow crosses the moon…"
        @input="emit('update:idea', $event.target.value)"
      ></textarea>
    </div>

    <div class="flex flex-wrap items-start gap-x-6 gap-y-4">
      <div class="min-w-0">
        <div class="label-micro text-text-hint mb-1.5">
          Register <span class="normal-case tracking-normal font-normal">· up to two</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <BaseChip
            v-for="t in tones"
            :key="t.value"
            variant="filter"
            size="sm"
            :active="isActive(t.value)"
            @click="toggleTone(t.value)"
          >
            {{ t.label }}
          </BaseChip>
        </div>
      </div>

      <div>
        <div class="label-micro text-text-hint mb-1.5">Length</div>
        <BaseSegmented
          :model-value="targetLength"
          :options="lengths"
          size="sm"
          aria-label="Target length"
          @update:model-value="emit('update:targetLength', $event)"
        />
      </div>
    </div>
  </div>
</template>
