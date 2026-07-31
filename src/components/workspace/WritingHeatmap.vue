<script setup>
import { computed, ref } from 'vue'

/**
 * Calendar heatmap of words added per day.
 *
 * Sequential encoding: one hue, four monotone lightness steps (see the
 * `--vers-heat-*` tokens). Intensity is words *added*, so only positive days
 * carry a step — an untracked day and a day spent trimming both sit at the
 * neutral empty cell, and the tooltip says which it was rather than letting the
 * colour imply "nothing happened".
 *
 * Thresholds are quantile-based, not fixed: a writer doing 200 words a day and
 * one doing 3,000 should both see a full range rather than a flat wash.
 */
const props = defineProps({
  /** `DayCell[][]` — columns of weeks, each up to 7 days. */
  columns: { type: Array, required: true },
  weekdayLabels: { type: Array, default: () => ['Mon', '', 'Wed', '', 'Fri', '', ''] }
})

const hovered = ref(null)

const positives = computed(() =>
  props.columns
    .flat()
    .map((d) => d.net)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
)

/** Quartile cuts over the writer's own distribution. */
const cuts = computed(() => {
  const v = positives.value
  if (!v.length) return [1, 2, 3]
  const at = (q) => v[Math.min(v.length - 1, Math.floor(v.length * q))]
  return [at(0.25), at(0.5), at(0.75)]
})

function levelOf(day) {
  if (day.net <= 0) return 0
  const [q1, q2, q3] = cuts.value
  if (day.net <= q1) return 1
  if (day.net <= q2) return 2
  if (day.net <= q3) return 3
  return 4
}

function fillOf(day) {
  return `var(--vers-heat-${levelOf(day)})`
}

const LONG_DATE = { weekday: 'short', month: 'short', day: 'numeric' }

function describe(day) {
  const when = new Date(day.date).toLocaleDateString(undefined, LONG_DATE)
  if (day.net > 0) return `${when} — ${day.net.toLocaleString()} words`
  if (day.net < 0) return `${when} — trimmed ${Math.abs(day.net).toLocaleString()} words`
  if (day.tracked) return `${when} — open, nothing added`
  return `${when} — no writing`
}

/** Month labels sit above the first column that starts a new month. */
const monthMarks = computed(() => {
  const marks = []
  let last = null
  props.columns.forEach((week, index) => {
    const first = week[0]
    if (!first) return
    const month = new Date(first.date).toLocaleDateString(undefined, { month: 'short' })
    if (month !== last) {
      marks.push({ index, label: month })
      last = month
    }
  })
  return marks
})
</script>

<template>
  <figure class="m-0">
    <figcaption class="mb-2 flex items-baseline justify-between gap-3">
      <span class="label-micro text-text-hint">Words added per day</span>
      <span class="font-ui text-xs text-text-hint" aria-hidden="true">Last 26 weeks</span>
    </figcaption>

    <div class="flex gap-1.5 overflow-x-auto">
      <!-- Weekday gutter: every other row labelled, so the grid stays readable
           without a label on all seven. -->
      <div class="grid shrink-0 gap-[3px] pt-[18px]" style="grid-template-rows: repeat(7, 11px)">
        <span
          v-for="(label, i) in weekdayLabels"
          :key="i"
          class="font-ui text-[10px] leading-[11px] text-text-hint"
        >
          {{ label }}
        </span>
      </div>

      <div class="min-w-0">
        <div class="relative mb-1 h-[14px]">
          <span
            v-for="mark in monthMarks"
            :key="mark.index"
            class="absolute font-ui text-[10px] text-text-hint"
            :style="{ left: `${mark.index * 14}px` }"
          >
            {{ mark.label }}
          </span>
        </div>

        <div class="flex gap-[3px]">
          <div
            v-for="(week, wi) in columns"
            :key="wi"
            class="grid gap-[3px]"
            style="grid-template-rows: repeat(7, 11px)"
          >
            <div
              v-for="day in week"
              :key="day.date"
              class="h-[11px] w-[11px] rounded-[2px] transition-transform duration-150"
              :class="hovered?.date === day.date ? 'scale-125' : ''"
              :style="{ backgroundColor: fillOf(day) }"
              tabindex="0"
              role="img"
              :aria-label="describe(day)"
              @mouseenter="hovered = day"
              @mouseleave="hovered = null"
              @focus="hovered = day"
              @blur="hovered = null"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-2.5 flex items-center justify-between gap-3">
      <!-- The hovered day reads out here rather than in a floating tooltip: the
           grid is dense and small, and a tooltip would cover its neighbours. -->
      <p class="min-h-[1rem] font-ui text-xs text-text-secondary" aria-live="polite">
        {{ hovered ? describe(hovered) : '' }}
      </p>

      <div class="flex shrink-0 items-center gap-1.5 font-ui text-xs text-text-hint">
        <span>Less</span>
        <span
          v-for="level in [0, 1, 2, 3, 4]"
          :key="level"
          class="h-[11px] w-[11px] rounded-[2px]"
          :style="{ backgroundColor: `var(--vers-heat-${level})` }"
          aria-hidden="true"
        />
        <span>More</span>
      </div>
    </div>
  </figure>
</template>
