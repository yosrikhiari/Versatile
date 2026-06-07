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

function isActive(t) {
  return props.tone ? props.tone.split(',').includes(t) : false
}

function toggleTone(t) {
  const current = props.tone ? props.tone.split(',') : []
  if (current.includes(t)) {
    emit('update:tone', current.filter(x => x !== t).join(','))
  } else if (current.length < 2) {
    emit('update:tone', [...current, t].join(','))
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Textarea (Visually Dominant) -->
    <div class="relative">
      <div class="absolute -left-3 top-2 bottom-2 w-[3px] bg-accent/20 rounded-full"></div>
      <label class="block text-[11px] font-spark tracking-wide text-text-hint mb-3 ml-1">~ The Idea ~</label>
      <textarea
        :value="idea"
        maxlength="400"
        rows="5"
        class="w-full px-3 py-2 bg-transparent border border-border-subtle/30 rounded-sm text-base resize-none focus:outline-none focus:border-accent/50 focus:bg-surface-hover/30 text-text-primary font-body placeholder:text-text-hint/40 placeholder:italic transition-all duration-300"
        placeholder="A shadow crosses the moon..."
        @input="emit('update:idea', $event.target.value)"
      ></textarea>
    </div>

    <div class="flex flex-col gap-6 pt-2 border-t border-border-subtle/20">
      <!-- Tone (Emotional Registers) -->
      <div>
        <label class="block text-[9px] uppercase tracking-widest text-text-hint font-ui mb-3">Emotional Registers (Max 2)</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in tones"
            :key="t.value"
            class="relative px-3 py-1.5 text-[11px] font-ui transition-all duration-300 group overflow-hidden rounded"
            :class="isActive(t.value) ? 'text-accent' : 'text-text-secondary hover:text-text-primary'"
            @click="toggleTone(t.value)"
          >
            <div class="absolute inset-0 border border-current opacity-20 rounded transition-opacity" :class="isActive(t.value) ? 'opacity-40' : ''"></div>
            <div class="absolute inset-0 bg-current opacity-0 transition-opacity duration-300" :class="isActive(t.value) ? 'opacity-10' : 'group-hover:opacity-5'"></div>
            <span class="relative z-10">{{ t.label }}</span>
          </button>
        </div>
      </div>

      <!-- Length -->
      <div>
        <label class="block text-[9px] uppercase tracking-widest text-text-hint font-ui mb-3">Target Length</label>
        <div class="flex gap-5">
          <label v-for="len in lengths" :key="len.value" class="flex items-center gap-2 cursor-pointer group">
            <div class="w-3 h-3 rounded-full border border-text-hint/50 flex items-center justify-center transition-all duration-300"
                 :class="targetLength === len.value ? 'border-accent' : 'group-hover:border-text-secondary'">
              <div v-if="targetLength === len.value" class="w-1.5 h-1.5 bg-accent rounded-full transition-all"></div>
            </div>
            <span class="text-[11px] font-ui transition-colors duration-300 tracking-wide"
                  :class="targetLength === len.value ? 'text-accent' : 'text-text-secondary group-hover:text-text-primary'">
              {{ len.label }}
            </span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
