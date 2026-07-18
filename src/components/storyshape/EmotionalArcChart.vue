<script setup>
import { computed } from 'vue'

const emit = defineEmits(['hover', 'leave'])

const props = defineProps({
  data: { type: Array, default: () => [] },
  width: { type: Number, default: 400 },
  height: { type: Number, default: 160 },
  hoverIndex: { type: Number, default: null }
})

const padding = { top: 14, right: 10, bottom: 20, left: 10 }

const VALENCE_RANGE = 10

const plotArea = computed(() => ({
  w: props.width - padding.left - padding.right,
  h: props.height - padding.top - padding.bottom
}))

const valencePath = computed(() => {
  if (!props.data || props.data.length < 2) return ''
  const { w, h } = plotArea.value
  const midY = padding.top + h / 2
  return props.data
    .map((d, i) => {
      const x = padding.left + (i / (props.data.length - 1)) * w
      const y = midY - (d.netValence / (VALENCE_RANGE / 2)) * (h / 2)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')
})

const intensityPath = computed(() => {
  if (!props.data || props.data.length < 2) return ''
  const { w, h } = plotArea.value
  const midY = padding.top + h / 2
  const upper = props.data
    .map((d, i) => {
      const x = padding.left + (i / (props.data.length - 1)) * w
      const band = (Math.min(d.intensity, 10) / 10) * (h / 4)
      const centerY = midY - (d.netValence / (VALENCE_RANGE / 2)) * (h / 2)
      return `${i === 0 ? 'M' : 'L'}${x},${centerY - band}`
    })
    .join(' ')
  const lower = props.data
    .toReversed()
    .map((d, i) => {
      const idx = props.data.length - 1 - i
      const x = padding.left + (idx / (props.data.length - 1)) * w
      const band = (Math.min(d.intensity, 10) / 10) * (h / 4)
      const centerY = midY - (d.netValence / (VALENCE_RANGE / 2)) * (h / 2)
      return `${i === 0 ? '' : 'L'}${x},${centerY + band}`
    })
    .join(' ')
  return `${upper} ${lower} Z`
})

const zeroLineY = computed(() => {
  const { h } = plotArea.value
  return padding.top + h / 2
})

const labels = computed(() => {
  if (!props.data || props.data.length === 0) return []
  const count = 5
  const step = Math.floor(props.data.length / (count - 1))
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.min(i * step, props.data.length - 1)
    return { index: idx, label: `${Math.round((idx / props.data.length) * 100)}%` }
  })
})

const hoverX = computed(() => {
  if (props.hoverIndex === null || !props.data || props.data.length < 2) return null
  const w = props.width - padding.left - padding.right
  return padding.left + (props.hoverIndex / (props.data.length - 1)) * w
})

function onMouseMove(e) {
  if (!props.data || props.data.length < 2) return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const plotW = props.width - padding.left - padding.right
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / plotW))
  const index = Math.round(ratio * (props.data.length - 1))
  emit('hover', index)
}

const avgValence = computed(() => {
  if (!props.data || props.data.length === 0) return 0
  const sum = props.data.reduce((s, d) => s + d.netValence, 0)
  return (sum / props.data.length).toFixed(1)
})

const totalIntensity = computed(() => {
  if (!props.data || props.data.length === 0) return 0
  const avg = props.data.reduce((s, d) => s + d.intensity, 0) / props.data.length
  return avg.toFixed(1)
})
</script>

<template>
  <div class="emotional-arc-chart">
    <svg :width="width" :height="height" class="w-full h-full">
      <defs>
        <linearGradient id="intensity-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6e8bb5" stop-opacity="0.12" />
          <stop offset="100%" stop-color="#6e8bb5" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <line
        :x1="padding.left"
        :y1="zeroLineY"
        :x2="width - padding.right"
        :y2="zeroLineY"
        stroke="rgba(255,255,255,0.06)"
        stroke-width="1"
        stroke-dasharray="3,2"
      />

      <path v-if="intensityPath" :d="intensityPath" fill="url(#intensity-fill)" />

      <path
        v-if="valencePath"
        :d="valencePath"
        fill="none"
        stroke="rgba(110,139,181,0.9)"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="valence-line"
      />

      <line
        v-if="hoverX !== null"
        :x1="hoverX"
        :y1="padding.top"
        :x2="hoverX"
        :y2="height - padding.bottom"
        stroke="rgba(255,255,255,0.12)"
        stroke-width="1"
        stroke-dasharray="2,2"
      />
      <rect
        :width="width"
        :height="height"
        fill="transparent"
        @mousemove="onMouseMove"
        @mouseleave="() => emit('leave')"
      />
      <text
        v-for="(l, i) in labels"
        :key="i"
        :x="padding.left + (l.index / (data.length - 1)) * (width - padding.left - padding.right)"
        :y="height - 4"
        text-anchor="middle"
        class="fill-text-hint"
        style="
          font-size: 8px;
          font-family: system-ui;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        "
      >
        {{ l.label }}
      </text>
    </svg>

    <div class="emotion-stats">
      <span class="stat">
        Valence: <strong>{{ avgValence }}</strong>
      </span>
      <span class="stat">
        Intensity: <strong>{{ totalIntensity }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.emotional-arc-chart {
  width: 100%;
  user-select: none;
}

.valence-line {
  filter: none;
}

.emotion-stats {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 4px;
}

.stat {
  font-size: 0.625rem;
  color: var(--vers-text-hint);
  font-variant-numeric: tabular-nums;
}

.stat strong {
  color: var(--vers-accent-primary);
}
</style>
