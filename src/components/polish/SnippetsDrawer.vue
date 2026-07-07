<script setup>
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
    <h3 class="text-11px uppercase tracking-widest text-text-hint font-ui mb-3">Snippets</h3>

    <div v-if="sortedSnippets.length === 0" class="text-center py-4">
      <p class="text-sm italic text-text-hint">Overused words will appear here as you write</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-text-hint text-xs font-ui">
            <th class="pb-2">Word</th>
            <th class="pb-2 text-center">#</th>
            <th class="pb-2"></th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="row" appear>
          <tr
            v-for="snippet in sortedSnippets"
            :key="snippet.id"
            class="border-t border-border-subtle/50"
          >
            <td class="py-2 text-text-secondary font-ui">{{ snippet.word }}</td>
            <td class="py-2 text-center text-text-hint font-mono text-xs">{{ snippet.count }}</td>
            <td class="py-2 text-right">
              <button
                class="text-text-hint hover:text-danger text-xs focus:outline-none focus:ring-2 focus:ring-accent rounded"
                @click="emit('remove', snippet.id)"
              >
                ×
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>
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
