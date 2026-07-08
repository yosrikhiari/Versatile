<script setup>
import BaseIcon from '../shared/BaseIcon.vue'

// Modal that reads the fully generated story. Extracted from StoryGeneratorPanel;
// the panel controls visibility and passes the written scenes.
defineProps({
  scenes: { type: Array, default: () => [] }
})
const emit = defineEmits(['close'])
</script>

<template>
  <div
    v-if="scenes.length > 0"
    class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
    @click.self="emit('close')"
  >
    <div
      class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto m-4 scrollbar-thin"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-text-primary font-ui">Generated Story</h2>
        <button
          class="text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded"
          @click="emit('close')"
        >
          <BaseIcon name="x" :size="20" />
        </button>
      </div>
      <div class="space-y-6">
        <div v-for="(scene, i) in scenes" :key="i" class="space-y-2">
          <h3 class="text-sm font-semibold text-accent font-ui">
            Scene {{ i + 1 }}: {{ scene.title }}
          </h3>
          <div class="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
            {{ scene.prose }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
