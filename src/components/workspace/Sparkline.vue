<script setup>
import { computed } from 'vue'

/**
 * Manuscript growth for one project — a single series, so no legend: the row it
 * sits in names it.
 *
 * Deliberately unlabelled and unaxed. At this size the only readable question is
 * "is this manuscript growing, stalled, or shrinking"; adding ticks would make
 * it a bad chart rather than a good glyph. The accessible name carries the
 * numbers for anyone who cannot read the shape.
 */
const props = defineProps({
  /** Manuscript total on each recorded day, oldest first. */
  points: { type: Array, default: () => [] },
  width: { type: Number, default: 72 },
  height: { type: Number, default: 20 }
})

const PADDING = 2

const path = computed(() => {
  const values = props.points
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const innerW = props.width - PADDING * 2
  const innerH = props.height - PADDING * 2

  return values
    .map((v, i) => {
      const x = PADDING + (i / (values.length - 1)) * innerW
      const y = PADDING + innerH - ((v - min) / span) * innerH
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
})

const label = computed(() => {
  const values = props.points
  if (values.length < 2) return 'Not enough history to chart'
  const delta = values[values.length - 1] - values[0]
  const direction = delta > 0 ? 'grew' : delta < 0 ? 'shrank' : 'held steady'
  return `Manuscript ${direction} by ${Math.abs(delta).toLocaleString()} words over ${values.length} recorded days`
})
</script>

<template>
  <svg
    v-if="path"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    fill="none"
    role="img"
    :aria-label="label"
    class="shrink-0 overflow-visible"
  >
    <path
      :d="path"
      stroke="var(--vers-accent-primary)"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <span v-else class="sr-only">{{ label }}</span>
</template>
