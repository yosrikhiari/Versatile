<script setup>
import BaseIcon from '../shared/BaseIcon.vue'
import { computed } from 'vue'

const props = defineProps({
  snippets: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['remove'])

const sortedSnippets = computed(() => {
  return [...props.snippets].sort((a, b) => b.count - a.count)
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <h3 class="label-micro text-text-hint mb-2">Overused words</h3>

    <p v-if="sortedSnippets.length === 0" class="font-ui text-xs text-text-hint leading-5">
      Words you lean on will collect here as you write.
    </p>

    <ul v-else class="flex-1 overflow-y-auto scrollbar-thin -mx-1 divide-y divide-border-subtle">
      <li
        v-for="snippet in sortedSnippets"
        :key="snippet.id"
        class="group flex items-center gap-2 px-1 py-1.5"
      >
        <span class="flex-1 min-w-0 truncate font-manuscript text-sm text-text-secondary">{{
          snippet.word
        }}</span>
        <span class="font-ui text-xs text-text-hint tabular-nums">{{ snippet.count }}</span>
        <button
          type="button"
          class="rounded p-0.5 text-text-hint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          :aria-label="`Remove ${snippet.word}`"
          @click="emit('remove', snippet.id)"
        >
          <BaseIcon name="x" :size="12" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.row-enter-active {
  animation: rowIn 0.3s ease-out both;
}

.row-leave-active {
  transition: all 0.2s;
}

.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

@keyframes rowIn {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
