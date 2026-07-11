<script setup>
import { computed } from 'vue'

const emit = defineEmits(['hover', 'leave'])

const props = defineProps({
  characters: { type: Array, default: () => [] },
  chunks: { type: Array, default: () => [] },
  width: { type: Number, default: 400 },
  height: { type: Number, default: 200 },
  hoverIndex: { type: Number, default: null }
})

const padding = { top: 8, right: 8, bottom: 16, left: 10 }

const namePatterns = computed(() => {
  return props.characters.map((c) => {
    const name = c.name || ''
    const first = name.split(/\s+/)[0]
    return { name, firstName: first, pattern: new RegExp('\\b' + escapeRegex(first) + '\\b', 'gi') }
  })
})

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const matrix = computed(() => {
  if (!props.chunks.length || !namePatterns.value.length) return { rows: [], maxHits: 1 }
  const rows = namePatterns.value.map((cp) => {
    const hits = props.chunks.map((chunk) => {
      const matches = chunk.match(cp.pattern)
      return matches ? matches.length : 0
    })
    const total = hits.reduce((s, h) => s + h, 0)
    return { name: cp.name, hits, total }
  })
  const maxHits = Math.max(1, ...rows.map((r) => Math.max(...r.hits)))
  return { rows, maxHits }
})

const cellW = computed(() => {
  if (!props.chunks.length) return 8
  const area = (props.width - padding.left - padding.right) / props.chunks.length
  return Math.max(6, Math.min(area, 16))
})

const cellH = computed(() => {
  if (!matrix.value.rows.length) return 14
  const area = (props.height - padding.top - padding.bottom) / matrix.value.rows.length
  return Math.max(10, Math.min(area, 20))
})

const chartW = computed(() => {
  return padding.left + props.chunks.length * cellW.value + padding.right
})

const chunkLabels = computed(() => {
  if (!props.chunks.length) return []
  const count = Math.min(5, props.chunks.length)
  const step = Math.max(Math.floor(props.chunks.length / count), 1)
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.min(i * step, props.chunks.length - 1)
    return { index: idx, label: `${Math.round((idx / props.chunks.length) * 100)}%` }
  })
})

const CHARACTER_COLORS = [
  '#c8922a',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#60a5fa',
  '#fb923c',
  '#a3e635'
]

function onMouseMove(e) {
  if (!props.chunks.length) return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const plotW = props.chunks.length * cellW.value
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / plotW))
  const index = Math.round(ratio * (props.chunks.length - 1))
  emit('hover', Math.max(0, Math.min(index, props.chunks.length - 1)))
}

function cellColor(hits, maxHits) {
  if (hits === 0) return 'rgba(255,255,255,0.03)'
  const t = hits / maxHits
  const alpha = 0.08 + t * 0.6
  return `rgba(167, 139, 250, ${alpha})`
}

function charColor(index) {
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length]
}
</script>

<template>
  <div class="char-focus-matrix">
    <svg :width="chartW" :height="height" class="w-full">
      <rect
        v-if="hoverIndex !== null"
        :x="padding.left + hoverIndex * cellW"
        :y="padding.top"
        :width="cellW"
        :height="matrix.rows.length * cellH"
        fill="rgba(255,255,255,0.04)"
        rx="1"
      />
      <g v-for="(row, ri) in matrix.rows" :key="row.name">
        <text
          :x="padding.left - 2"
          :y="padding.top + ri * cellH + cellH / 2"
          text-anchor="end"
          dominant-baseline="central"
          class="fill-text-hint"
          style="font-size: 7px; font-family: system-ui"
        >
          {{ row.name.length > 8 ? row.name.slice(0, 7) + '\u2026' : row.name }}
        </text>
        <rect
          v-for="(h, ci) in row.hits"
          :key="ci"
          :x="padding.left + ci * cellW"
          :y="padding.top + ri * cellH"
          :width="cellW - 1"
          :height="cellH - 1"
          :rx="1"
          :fill="cellColor(h, matrix.maxHits)"
          :stroke="h > 0 ? charColor(ri) : 'transparent'"
          :stroke-width="h > 0 ? 0.5 : 0"
          stroke-opacity="0.2"
        />
      </g>

      <rect
        :width="chartW"
        :height="height"
        fill="transparent"
        @mousemove="onMouseMove"
        @mouseleave="() => emit('leave')"
      />
      <text
        v-for="(l, i) in chunkLabels"
        :key="i"
        :x="padding.left + l.index * cellW + cellW / 2"
        :y="height - 4"
        text-anchor="middle"
        class="fill-text-hint"
        style="
          font-size: 7px;
          font-family: system-ui;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        "
      >
        {{ l.label }}
      </text>
    </svg>

    <div v-if="!matrix.rows.length" class="empty-hint">No characters found in Bible</div>
  </div>
</template>

<style scoped>
.char-focus-matrix {
  width: 100%;
  overflow-x: auto;
  user-select: none;
}

.empty-hint {
  text-align: center;
  font-size: 0.625rem;
  color: var(--vers-text-hint);
  padding: 8px 0;
}
</style>
