<script setup>
import { computed } from 'vue'

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const props = defineProps({
  data: { type: Array, default: () => [] },
  width: { type: Number, default: 400 },
  height: { type: Number, default: 160 },
  color: { type: String, default: '#c8922a' }
})

const padding = { top: 10, right: 10, bottom: 20, left: 10 }

const points = computed(() => {
  if (!props.data || props.data.length === 0) return ''
  const w = props.width - padding.left - padding.right
  const h = props.height - padding.top - padding.bottom
  const maxVal = Math.max(...props.data, 1)
  return props.data
    .map((v, i) => {
      const x = padding.left + (i / (props.data.length - 1)) * w
      const y = padding.top + h - (v / maxVal) * h
      return `${x},${y}`
    })
    .join(' ')
})

const areaPath = computed(() => {
  if (!props.data || props.data.length === 0) return ''
  const w = props.width - padding.left - padding.right
  const h = props.height - padding.top - padding.bottom
  const maxVal = Math.max(...props.data, 1)
  const bottomY = padding.top + h
  const firstX = padding.left
  const lastX = padding.left + w

  const curve = props.data
    .map((v, i) => {
      const x = padding.left + (i / (props.data.length - 1)) * w
      const y = padding.top + h - (v / maxVal) * h
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')

  return `${curve} L${lastX},${bottomY} L${firstX},${bottomY} Z`
})

const shadowColor = computed(() => hexToRgba(props.color, 0.2))

const labels = computed(() => {
  if (!props.data || props.data.length === 0) return []
  const count = 5
  const step = Math.floor(props.data.length / (count - 1))
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.min(i * step, props.data.length - 1)
    return { index: idx, label: `${Math.round((idx / props.data.length) * 100)}%` }
  })
})
</script>

<template>
  <div class="tension-chart">
    <svg :width="width" :height="height" class="w-full h-full">
      <defs>
        <linearGradient id="tension-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.25" />
          <stop offset="100%" :stop-color="color" stop-opacity="0.03" />
        </linearGradient>
      </defs>
      <path
        v-if="areaPath"
        :d="areaPath"
        fill="url(#tension-fill)"
      />
      <polyline
        v-if="points"
        :points="points"
        fill="none"
        :stroke="color"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="tension-line"
      />
      <text
        v-for="(l, i) in labels"
        :key="i"
        :x="padding.left + (l.index / (data.length - 1)) * (width - padding.left - padding.right)"
        y="0"
        :dy="height - 4"
        text-anchor="middle"
        class="fill-text-hint"
        style="font-size: 8px; font-family: system-ui; text-transform: uppercase; letter-spacing: 0.04em;"
      >
        {{ l.label }}
      </text>
    </svg>
  </div>
</template>

<style scoped>
.tension-chart {
  width: 100%;
  user-select: none;
}

.tension-line {
  filter: drop-shadow(0 0 6px v-bind(shadowColor));
}
</style>
