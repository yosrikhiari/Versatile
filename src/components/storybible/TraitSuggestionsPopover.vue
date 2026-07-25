<script setup>
import { ref } from 'vue'
import { useClickOutside } from '../../composables/useClickOutside'

const traitModel = defineModel({ type: Array, default: () => [] })

defineProps({
  placeholder: { type: String, default: 'Add trait...' },
  isSuggesting: Boolean,
  suggestions: { type: Array, default: () => [] },
  showSuggestions: Boolean
})

const emit = defineEmits(['suggest', 'add-suggestion', 'close'])

const popoverRef = ref(null)
useClickOutside(popoverRef, () => {
  emit('close')
})
</script>

<template>
  <div>
    <div class="flex items-center gap-1">
      <TagInput v-model="traitModel" :placeholder="placeholder" />
      <button
        class="p-1.5 rounded hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="isSuggesting"
        title="Suggest traits"
        @click="emit('suggest')"
      >
        <BaseIcon v-if="isSuggesting" name="loader-2" :size="16" class="animate-spin text-accent" />
        <BaseIcon v-else name="sparkles" :size="16" class="text-accent" />
      </button>
    </div>
    <div
      v-if="showSuggestions && suggestions.length"
      ref="popoverRef"
      class="flex flex-wrap gap-1.5 p-2 bg-bg-secondary border border-border-subtle rounded-lg mt-1"
    >
      <button
        v-for="t in suggestions"
        :key="t"
        class="text-xs px-2 py-1 bg-accent/10 text-accent rounded-full hover:bg-accent/20 transition-colors"
        @click="emit('add-suggestion', t)"
      >
        + {{ t }}
      </button>
    </div>
  </div>
</template>
