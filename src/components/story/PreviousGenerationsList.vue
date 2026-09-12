<script setup>
import BaseIcon from '../shared/BaseIcon.vue'

// Read-only list of a project's prior generation runs. Extracted from
// StoryGeneratorPanel; the panel passes its `previousGenerations`.
defineProps({
  generations: { type: Array, default: () => [] }
})

// qualityScore is stored as 0 both when a run was never evaluated and when
// it was evaluated with zero issues (see useVolumeStoryGenerator commit),
// so a bare 0 cannot be read as a real score — it renders as unscored.
function hasRecordedScore(gen) {
  return typeof gen?.qualityScore === 'number' && gen.qualityScore !== 0
}
</script>

<template>
  <div v-if="generations.length > 0" class="border-t border-border-subtle pt-4 mt-4">
    <h3 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
      Previous Generations
    </h3>
    <div class="space-y-1.5">
      <div
        v-for="(gen, i) in generations"
        :key="gen.id || i"
        class="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-tertiary border border-border-subtle text-xs"
      >
        <BaseIcon name="file-text" :size="14" class="text-text-hint shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-text-primary truncate">{{ gen.title }}</p>
          <p class="text-text-hint text-2xs font-ui">
            {{ new Date(gen.generatedAt).toLocaleDateString() }}
            <span v-if="gen.totalWords"> · {{ gen.totalWords }} words</span>
            <span v-if="hasRecordedScore(gen)"> · score {{ gen.qualityScore }}</span>
            <span v-else> · no score recorded</span>
          </p>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="border-t border-border-subtle pt-4 mt-4">
    <h3 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
      Previous Generations
    </h3>
    <p class="text-xs text-text-hint">No previous generations yet</p>
  </div>
</template>
