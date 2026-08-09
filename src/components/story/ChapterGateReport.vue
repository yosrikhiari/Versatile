<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { t } from '../../composables/useChapterI18n'

/**
 * What the chapter acceptance gate found, shown next to the finished chapter.
 *
 * The gate reports; it does not delete. Blocking findings mean "this is not a
 * chapter" — missing prose, metadata that failed everywhere, looping text,
 * contradictions the audit could not resolve — but the prose is committed
 * either way, so this panel exists to say precisely what the run could not
 * deliver rather than to stand in for the result.
 */
defineOptions({ name: 'ChapterGateReport' })

const props = defineProps({
  report: { type: Object, default: null }
})

const blocking = computed(() => props.report?.findings?.filter((f) => f.severity === 'block') || [])
const warnings = computed(() => props.report?.findings?.filter((f) => f.severity === 'warn') || [])
</script>

<template>
  <div
    v-if="report"
    data-test="chapter-gate-report"
    class="mx-4 mt-3 rounded-lg border p-3 space-y-1.5"
    :class="
      report.passed ? 'border-border-subtle bg-bg-secondary' : 'border-danger bg-bg-secondary'
    "
  >
    <div class="flex items-center gap-2">
      <BaseIcon
        :name="report.passed ? 'check-circle' : 'alert-triangle'"
        :size="14"
        :class="report.passed ? 'text-success' : 'text-danger'"
      />
      <span class="text-xs font-semibold font-ui text-text-primary">
        {{ report.passed ? t('chapter.gatePassed') : t('chapter.gateBlocked') }}
      </span>
    </div>

    <p class="text-2xs text-text-hint font-ui tabular-nums">
      {{ report.metrics.sceneCount }} scene(s) ·
      {{ report.metrics.uniqueWords.toLocaleString() }} unique words ·
      {{ Math.round(report.metrics.wordRatio * 100) }}% of target
    </p>

    <ul v-if="blocking.length" class="space-y-1">
      <li v-for="f in blocking" :key="f.code" class="text-2xs text-danger font-ui leading-relaxed">
        {{ f.message }}
      </li>
    </ul>

    <ul v-if="warnings.length" class="space-y-1">
      <li
        v-for="f in warnings"
        :key="f.code"
        class="text-2xs text-text-secondary font-ui leading-relaxed"
      >
        {{ f.message }}
      </li>
    </ul>
  </div>
</template>
