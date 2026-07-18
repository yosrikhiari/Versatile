<script setup>
import { computed } from 'vue'

const emit = defineEmits(['hover', 'leave'])

const props = defineProps({
  beats: { type: Array, default: () => [] },
  chunkCount: { type: Number, default: 20 },
  width: { type: Number, default: 400 },
  height: { type: Number, default: 80 },
  hoverIndex: { type: Number, default: null }
})

const padding = { top: 6, right: 10, bottom: 16, left: 10 }

const activeBeats = computed(() => {
  return props.beats.filter((b) => b.confidence > 0)
})

const milestones = computed(() => {
  if (!props.chunkCount) return []
  const segmentSize = Math.max(Math.floor(props.chunkCount / (activeBeats.value.length + 1)), 1)
  return activeBeats.value.map((beat, i) => {
    const position = (i + 1) * segmentSize
    const normPos = Math.min(position / props.chunkCount, 1)
    return { ...beat, position: normPos }
  })
})

const lane = computed(() => {
  if (!props.beats.length) return ''
  const w = props.width - padding.left - padding.right
  const y = padding.top + (props.height - padding.top - padding.bottom) / 2
  return `M${padding.left},${y} L${padding.left + w},${y}`
})

const BEAT_COLORS = {
  'Inciting Incident': '#6e8bb5',
  'Rising Action': '#6a9e7a',
  Midpoint: '#d4a74a',
  'Crisis / Dark Moment': '#a86b6b',
  Climax: '#7a9aa8',
  Resolution: '#9a9a5c'
}

function beatColor(beat) {
  return BEAT_COLORS[beat.label] || 'rgba(255,255,255,0.2)'
}

const hoverX = computed(() => {
  if (props.hoverIndex === null || !props.chunkCount) return null
  const w = props.width - padding.left - padding.right
  return padding.left + (props.hoverIndex / (props.chunkCount - 1)) * w
})

function onMouseMove(e) {
  if (!props.chunkCount) return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const plotW = props.width - padding.left - padding.right
  const ratio = Math.max(0, Math.min(1, (x - padding.left) / plotW))
  const index = Math.round(ratio * (props.chunkCount - 1))
  emit('hover', index)
}

const pctLabels = computed(() => {
  const count = 5
  return Array.from({ length: count }, (_, i) => {
    const pct = Math.round((i / (count - 1)) * 100)
    return {
      pct,
      x: padding.left + (i / (count - 1)) * (props.width - padding.left - padding.right)
    }
  })
})
</script>

<template>
  <div class="narrative-timeline">
    <svg :width="width" :height="height" class="w-full h-full">
      <line
        :d="lane"
        x1="0"
        y1="0"
        :x2="width"
        :y2="0"
        transform="translate(0, 0)"
        stroke="rgba(255,255,255,0.06)"
        stroke-width="1"
      />

      <line
        v-for="(p, i) in pctLabels"
        :key="i"
        :x1="p.x"
        :y1="padding.top"
        :x2="p.x"
        :y2="height"
        stroke="rgba(255,255,255,0.03)"
        stroke-width="0.5"
      />

      <text
        v-for="(p, i) in pctLabels"
        :key="i"
        :x="p.x"
        :y="height - 2"
        text-anchor="middle"
        class="fill-text-hint"
        style="
          font-size: 7px;
          font-family: system-ui;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        "
      >
        {{ p.pct }}%
      </text>

      <line
        v-if="hoverX !== null"
        :x1="hoverX"
        :y1="0"
        :x2="hoverX"
        :y2="height"
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
      <g v-for="m in milestones" :key="m.label">
        <circle
          :cx="padding.left + m.position * (width - padding.left - padding.right)"
          :cy="padding.top + (height - padding.top - padding.bottom) / 2"
          :r="Math.max(3, Math.min(6, Math.round(m.confidence / 25)))"
          :fill="beatColor(m)"
          :opacity="Math.max(0.3, Math.min(m.confidence / 100, 1))"
        />
        <text
          :x="padding.left + m.position * (width - padding.left - padding.right)"
          :y="padding.top + 2"
          text-anchor="middle"
          class="fill-text-secondary"
          style="font-size: 6px; font-family: system-ui; font-weight: 500"
        >
          {{ m.label }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.narrative-timeline {
  width: 100%;
  user-select: none;
}
</style>
