<script setup>
import BaseSection from '../ui/BaseSection.vue'
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
  <BaseSection
    title="Previous generations"
    :meta="generations.length ? String(generations.length) : ''"
    dense
  >
    <p v-if="generations.length === 0" class="font-ui text-xs text-text-hint">
      Finished runs are listed here with their word count and score.
    </p>
    <ul v-else class="divide-y divide-border-subtle -mx-1">
      <li
        v-for="(gen, i) in generations"
        :key="gen.id || i"
        class="flex items-center gap-3 px-1 py-2.5"
      >
        <BaseIcon name="file-text" :size="14" class="text-text-hint shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="font-ui text-sm text-text-primary truncate">{{ gen.title }}</p>
          <p class="font-ui text-2xs text-text-hint tabular-nums">
            {{ new Date(gen.generatedAt).toLocaleDateString() }}
            <span v-if="gen.totalWords"> · {{ gen.totalWords.toLocaleString() }} words</span>
            <!-- qualityScore is minus the continuity issue count (see the
                 generator's commit); "score -4" meant nothing to a writer. -->
            <span v-if="hasRecordedScore(gen) && gen.qualityScore < 0">
              · {{ -gen.qualityScore }} continuity
              {{ gen.qualityScore === -1 ? 'issue' : 'issues' }}
            </span>
            <span v-else-if="hasRecordedScore(gen)"> · score {{ gen.qualityScore }}</span>
            <span v-else> · not scored</span>
          </p>
        </div>
      </li>
    </ul>
  </BaseSection>
</template>
