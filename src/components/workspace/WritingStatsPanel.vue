<script setup>
import { computed } from 'vue'
import WritingHeatmap from './WritingHeatmap.vue'

/**
 * Writing history summary for the project index.
 *
 * Figures are hairline-separated rather than boxed into cards: the workspace is
 * a manuscript index, and a row of shadowed KPI tiles would import a dashboard
 * idiom this app does not otherwise use. Numbers take tabular figures so the
 * column edges stay straight as they change.
 *
 * Everything shown is derived from recorded `dailyGoals` rows. There is no
 * projection, no filler, and no zero-filled placeholder grid — with no history
 * the panel says so and gets out of the way.
 */
const props = defineProps({
  columns: { type: Array, default: () => [] },
  wordsThisWeek: { type: Number, default: 0 },
  streaks: { type: Object, default: () => ({ current: 0, longest: 0 }) },
  activeDays: { type: Number, default: 0 },
  bestDay: { type: Object, default: null },
  bestWeekday: { type: Object, default: null },
  totalWordsWritten: { type: Number, default: 0 }
})

const hasHistory = computed(() => props.activeDays > 0)

const figures = computed(() => [
  { label: 'This week', value: props.wordsThisWeek.toLocaleString(), unit: 'words' },
  {
    label: 'Current streak',
    value: String(props.streaks.current),
    unit: props.streaks.current === 1 ? 'day' : 'days',
    note: props.streaks.longest > props.streaks.current ? `best ${props.streaks.longest}` : ''
  },
  {
    label: 'Days written',
    value: String(props.activeDays),
    unit: props.activeDays === 1 ? 'day' : 'days'
  },
  {
    label: 'Best day',
    value: props.bestDay ? props.bestDay.net.toLocaleString() : '—',
    unit: props.bestDay ? 'words' : '',
    note: props.bestDay
      ? new Date(props.bestDay.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        })
      : ''
  }
])
</script>

<template>
  <section aria-labelledby="writing-activity-heading" class="border-b border-border-subtle pb-8">
    <h2 id="writing-activity-heading" class="sr-only">Writing activity</h2>

    <p v-if="!hasHistory" class="font-ui text-sm text-text-hint">
      No writing recorded yet — your activity will chart itself here once you start drafting.
    </p>

    <template v-else>
      <dl class="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div v-for="figure in figures" :key="figure.label" class="min-w-0">
          <dt class="label-micro mb-1 text-text-hint">{{ figure.label }}</dt>
          <dd class="flex items-baseline gap-1.5">
            <span class="font-ui text-xl tabular-nums text-text-primary">{{ figure.value }}</span>
            <span v-if="figure.unit" class="font-ui text-xs text-text-hint">{{ figure.unit }}</span>
          </dd>
          <p v-if="figure.note" class="mt-0.5 font-ui text-xs text-text-hint">{{ figure.note }}</p>
        </div>
      </dl>

      <WritingHeatmap :columns="columns" />

      <p v-if="bestWeekday" class="mt-3 font-ui text-xs text-text-hint">
        You write most on
        <span class="text-text-secondary">{{ bestWeekday.name }}s</span> —
        {{ bestWeekday.words.toLocaleString() }} words all told.
      </p>
    </template>
  </section>
</template>
