<script setup>
import BaseIcon from '../shared/BaseIcon.vue'

// Modal showing the consistency auditor's character/location contradiction
// report. Extracted from StoryGeneratorPanel; the panel controls visibility and
// passes the report plus its precomputed total issue count.
defineProps({
  report: { type: Object, default: null },
  totalIssues: { type: Number, default: 0 }
})
const emit = defineEmits(['close'])
</script>

<template>
  <div
    v-if="report"
    class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
    @click.self="emit('close')"
  >
    <div
      class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto m-4 scrollbar-thin"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-text-primary font-ui">Consistency Report</h2>
        <button
          class="text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded"
          @click="emit('close')"
        >
          <BaseIcon name="x" :size="20" />
        </button>
      </div>

      <div v-if="report.characterIssues?.length > 0" class="mb-4">
        <h3 class="text-sm font-semibold text-text-primary font-ui mb-2">
          Character Contradictions
        </h3>
        <div
          v-for="(item, i) in report.characterIssues"
          :key="'char-' + i"
          class="mb-3 p-3 bg-yellow-950/10 border border-yellow-800/20 rounded-lg"
        >
          <p class="text-xs font-semibold text-yellow-400 font-ui mb-1">{{ item.character }}</p>
          <div
            v-for="(c, j) in item.contradictions"
            :key="j"
            class="text-xs text-text-secondary space-y-0.5 mb-1"
          >
            <p><span class="text-text-hint">[{{ c.type }}]</span> {{ c.description }}</p>
          </div>
        </div>
      </div>

      <div v-if="report.locationIssues?.length > 0">
        <h3 class="text-sm font-semibold text-text-primary font-ui mb-2">
          Location Contradictions
        </h3>
        <div
          v-for="(item, i) in report.locationIssues"
          :key="'loc-' + i"
          class="mb-3 p-3 bg-yellow-950/10 border border-yellow-800/20 rounded-lg"
        >
          <p class="text-xs font-semibold text-yellow-400 font-ui mb-1">{{ item.location }}</p>
          <div
            v-for="(c, j) in item.contradictions"
            :key="j"
            class="text-xs text-text-secondary space-y-0.5 mb-1"
          >
            <p><span class="text-text-hint">[{{ c.type }}]</span> {{ c.description }}</p>
          </div>
        </div>
      </div>

      <div v-if="totalIssues === 0" class="text-center py-4">
        <BaseIcon name="check-circle" :size="24" class="mx-auto text-green-400 mb-2" />
        <p class="text-sm text-green-400 font-ui">No contradictions found</p>
      </div>
    </div>
  </div>
</template>
