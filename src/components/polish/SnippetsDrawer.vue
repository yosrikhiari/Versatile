<script setup>
import { computed } from 'vue'

const props = defineProps({
  snippets: Array
})

const emit = defineEmits(['remove'])

const sortedSnippets = computed(() => {
  return [...props.snippets].sort((a, b) => b.count - a.count)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <h3 class="text-[11px] uppercase tracking-widest text-text-hint font-ui mb-3">Snippets</h3>
    
    <div v-if="sortedSnippets.length === 0" class="text-center py-4">
      <p class="text-sm italic text-text-hint font-body">Overused words will appear here as you write</p>
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
        <tbody>
          <tr v-for="snippet in sortedSnippets" :key="snippet.id" class="border-t border-border-subtle/50">
            <td class="py-2 text-text-secondary font-ui">{{ snippet.word }}</td>
            <td class="py-2 text-center text-text-hint font-mono text-xs">{{ snippet.count }}</td>
            <td class="py-2 text-right">
              <button
                @click="emit('remove', snippet.id)"
                class="text-text-hint hover:text-danger text-xs focus:outline-none focus:ring-2 focus:ring-accent rounded"
              >
                ×
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
