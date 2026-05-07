<script setup>
const props = defineProps({
  idea: String,
  tone: String,
  targetLength: String
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
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="block text-[11px] uppercase tracking-widest text-text-hint font-ui mb-2">Your chapter idea</label>
      <textarea
        :value="idea"
        maxlength="200"
        rows="3"
        class="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 bg-bg-tertiary text-text-primary font-ui placeholder:text-text-hint"
        placeholder="What happens in this chapter?"
        @input="emit('update:idea', $event.target.value)"
      ></textarea>
    </div>

    <div>
      <label class="block text-[11px] uppercase tracking-widest text-text-hint font-ui mb-2">Tone</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="t in tones"
          :key="t.value"
          :class="[
            'px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent',
            tone === t.value
              ? 'bg-accent text-white'
              : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
          @click="emit('update:tone', t.value)"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <div>
      <label class="block text-[11px] uppercase tracking-widest text-text-hint font-ui mb-2">Length</label>
      <div class="flex gap-2">
        <button
          v-for="len in lengths"
          :key="len.value"
          :class="[
            'flex-1 px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent',
            targetLength === len.value
              ? 'bg-accent text-white'
              : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
          ]"
          @click="emit('update:targetLength', len.value)"
        >
          {{ len.label }}
        </button>
      </div>
    </div>
  </div>
</template>
