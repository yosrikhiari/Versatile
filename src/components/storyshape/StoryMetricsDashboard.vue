<script setup>
import { computed } from 'vue'

const props = defineProps({
  wordBasedTension: { type: Array, default: () => [] },
  emotionByChunk: { type: Array, default: () => [] },
  chunks: { type: Array, default: () => [] },
  characterNames: { type: Array, default: () => [] },
  pacingGradient: { type: Number, default: 0 }
})

const tensionVolatility = computed(() => {
  const t = props.wordBasedTension
  if (!t.length) return 0
  const mean = t.reduce((a, b) => a + b, 0) / t.length
  const variance = t.reduce((sum, v) => sum + (v - mean) ** 2, 0) / t.length
  return Math.sqrt(variance).toFixed(1)
})

const emotionSpread = computed(() => {
  const vals = props.emotionByChunk.map((c) => c.netValence)
  if (!vals.length) return 0
  return (Math.max(...vals) - Math.min(...vals)).toFixed(1)
})

const characterInvolvement = computed(() => {
  const names = props.characterNames
  const chunks = props.chunks
  if (!names.length || !chunks.length) return 0
  const re = new RegExp(names.map((n) => n.split(/\s+/)[0]).join('|'), 'i')
  const mentioned = chunks.filter((c) => re.test(c)).length
  return Math.round((mentioned / chunks.length) * 100)
})

const pacingRating = computed(() => {
  const g = props.pacingGradient
  if (g < 0.8) return { label: 'Steady', color: 'var(--vers-text-muted)' }
  if (g < 1.5) return { label: 'Moderate', color: 'var(--vers-accent-primary)' }
  if (g < 2.5) return { label: 'Dynamic', color: '#d4a74a' }
  return { label: 'Volatile', color: '#d07070' }
})
</script>

<template>
  <div class="metrics-dashboard">
    <div class="metric-tile">
      <span class="tile-value" :style="{ color: pacingRating.color }">{{
        pacingRating.label
      }}</span>
      <span class="tile-label">Pacing</span>
    </div>
    <div class="metric-tile">
      <span class="tile-value">{{ tensionVolatility }}</span>
      <span class="tile-label">Volatility</span>
    </div>
    <div class="metric-tile">
      <span class="tile-value">{{ emotionSpread }}</span>
      <span class="tile-label">Emotion Spread</span>
    </div>
    <div class="metric-tile">
      <span class="tile-value">{{ characterInvolvement }}%</span>
      <span class="tile-label">Character %</span>
    </div>
  </div>
</template>

<style scoped>
.metrics-dashboard {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.metric-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 2px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.tile-value {
  font-size: 0.8125rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--vers-text-primary);
  white-space: nowrap;
}

.tile-label {
  font-size: 0.5625rem;
  color: var(--vers-text-hint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
