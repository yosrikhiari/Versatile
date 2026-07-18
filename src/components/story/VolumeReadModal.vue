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
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
    @click.self="emit('close')"
  >
    <div
      class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto m-4 scrollbar-thin"
    >
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold text-text-primary font-ui">Generated Story</h2>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-secondary text-warning font-medium whitespace-nowrap"
            >Unsaved Preview</span
          >
        </div>
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

      <p class="mt-4 text-[11px] text-text-hint text-center italic">
        Preview only — use <strong>Save to Manuscript</strong> to persist these scenes.
      </p>
    </div>
  </div>
</template>
