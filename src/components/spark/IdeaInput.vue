<script setup>
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
  <div class="space-y-5">
    <!-- The idea -->
    <div>
      <label class="block text-11px uppercase tracking-widest text-text-secondary font-ui mb-2"
        >The idea</label
      >
      <textarea
        :value="idea"
        maxlength="400"
        rows="5"
        class="w-full px-3 py-2.5 bg-bg-tertiary border border-border-subtle rounded-md text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-text-primary font-ui placeholder:text-text-hint transition-colors duration-150"
        placeholder="A shadow crosses the moon…"
        @input="emit('update:idea', $event.target.value)"
      ></textarea>
    </div>

    <div class="flex flex-col gap-5 pt-4 border-t border-border-subtle">
      <!-- Emotional registers -->
      <div>
        <label class="block text-11px uppercase tracking-widest text-text-secondary font-ui mb-2.5"
          >Emotional registers · max 2</label
        >
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in tones"
            :key="t.value"
            class="px-3 py-1.5 text-11px rounded-md border font-ui transition-[color,background-color,transform] duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            :class="
              isActive(t.value)
                ? 'border-accent/40 text-accent'
                : 'bg-bg-tertiary border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            "
            :style="
              isActive(t.value) ? { background: 'rgba(var(--vers-accent-primary-rgb),0.14)' } : {}
            "
            @click="toggleTone(t.value)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- Target length -->
      <div>
        <label class="block text-11px uppercase tracking-widest text-text-secondary font-ui mb-2.5"
          >Target length</label
        >
        <div
          class="inline-flex gap-0.5 p-0.5 bg-bg-tertiary border border-border-subtle rounded-lg"
        >
          <button
            v-for="len in lengths"
            :key="len.value"
            class="px-3.5 py-1.5 text-11px rounded-md font-ui transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            :class="
              targetLength === len.value
                ? 'text-accent'
                : 'text-text-secondary hover:text-text-primary'
            "
            :style="
              targetLength === len.value
                ? { background: 'rgba(var(--vers-accent-primary-rgb),0.16)' }
                : {}
            "
            @click="emit('update:targetLength', len.value)"
          >
            {{ len.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
