<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  revisionResult: { type: Object, default: null },
  compact: { type: Boolean, default: false }
})

const hasRevision = computed(() => !!props.revisionResult?.revisedProse)

const origWords = computed(() => {
  if (!hasRevision.value) return 0
  return props.revisionResult.originalProse?.split(/\s+/).length || 0
})

const revWords = computed(() => {
  if (!hasRevision.value) return 0
  return props.revisionResult.revisedProse?.split(/\s+/).length || 0
})

const wordDelta = computed(() => {
  if (!hasRevision.value) return 0
  return revWords.value - origWords.value
})

const scoreDelta = computed(() => {
  if (!hasRevision.value) return null
  const d = props.revisionResult.delta
  if (d != null) return d
  const orig = props.revisionResult.originalCritique?.score ?? 0
  const rev = props.revisionResult.revisedCritique?.score ?? 0
  return rev - orig
})

const dimensionDeltas = computed(() => {
  if (!props.revisionResult?.degradation?.dimensions) return null
  return Object.entries(props.revisionResult.degradation.dimensions).map(([key, val]) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    ...val
  }))
})

const hasRegressions = computed(() => !!props.revisionResult?.degradation?.hasRegressions)
const hasMajorRegressions = computed(() => !!props.revisionResult?.degradation?.hasMajorRegressions)

function deltaClass(val) {
  if (val == null) return ''
  if (val > 0) return 'text-success'
  if (val < 0) return 'text-danger'
  return 'text-text-hint'
}

function statusIcon(status) {
  if (status === 'improved') return 'trending-up'
  if (status === 'regressed' || status === 'major_regression') return 'trending-down'
  return 'minus'
}

function statusColor(status) {
  if (status === 'improved') return 'text-success'
  if (status === 'regressed') return 'text-warning'
  if (status === 'major_regression') return 'text-danger'
  return 'text-text-hint'
}
</script>

<template>
  <div class="revision-delta-panel space-y-3">
    <template v-if="hasRevision">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-semibold text-text-secondary font-ui uppercase tracking-wider flex items-center gap-1.5">
          <BaseIcon name="refresh-cw" :size="12" class="text-accent" />
          Revision Applied
        </h4>
        <div v-if="scoreDelta != null" class="flex items-center gap-1 text-xs font-ui" :class="deltaClass(scoreDelta)">
          <BaseIcon name="trending-up" :size="12" />
          <span>{{ scoreDelta >= 0 ? '+' : '' }}{{ scoreDelta.toFixed(1) }} score</span>
        </div>
      </div>

      <div v-if="!compact" class="grid grid-cols-2 gap-2">
        <div class="bg-gray-900/30 border border-gray-800/50 rounded-lg p-2.5">
          <span class="text-2xs font-ui text-text-hint block mb-0.5">Original</span>
          <span class="text-sm font-bold font-ui text-text-primary">{{ origWords.toLocaleString() }}</span>
          <span class="text-2xs text-text-hint font-ui ml-1">words</span>
        </div>
        <div class="bg-gray-900/30 border border-gray-800/50 rounded-lg p-2.5">
          <span class="text-2xs font-ui text-text-hint block mb-0.5">Revised</span>
          <span class="text-sm font-bold font-ui text-text-primary">{{ revWords.toLocaleString() }}</span>
          <span class="text-2xs text-text-hint font-ui ml-1">words</span>
          <span v-if="wordDelta !== 0" class="ml-1 text-2xs font-ui" :class="wordDelta > 0 ? 'text-success' : 'text-danger'">
            ({{ wordDelta > 0 ? '+' : '' }}{{ wordDelta }})
          </span>
        </div>
      </div>

      <div v-if="hasRegressions && !compact" class="flex items-center gap-2 text-xs font-ui"
        :class="hasMajorRegressions ? 'text-danger' : 'text-warning'">
        <BaseIcon :name="hasMajorRegressions ? 'alert-octagon' : 'alert-triangle'" :size="14" />
        <span>{{ hasMajorRegressions ? 'Major' : 'Minor' }} regressions detected
          <span v-if="dimensionDeltas" class="text-text-hint">
            ({{ dimensionDeltas.filter(d => d.status === 'regressed' || d.status === 'major_regression').length }} dimensions)
          </span>
        </span>
      </div>

      <div v-if="dimensionDeltas && dimensionDeltas.length > 0 && !compact" class="space-y-1.5">
        <h5 class="text-2xs font-semibold text-text-secondary font-ui uppercase tracking-wider">Dimension Deltas</h5>
        <div v-for="dim in dimensionDeltas" :key="dim.key" class="flex items-center justify-between bg-gray-900/30 border border-gray-800/50 rounded px-2.5 py-1.5">
          <div class="flex items-center gap-1.5">
            <BaseIcon :name="statusIcon(dim.status)" :size="10" :class="statusColor(dim.status)" />
            <span class="text-xs font-ui text-text-secondary">{{ dim.label }}</span>
          </div>
          <div class="flex items-center gap-1 text-xs font-ui">
            <span class="text-text-hint">{{ dim.before }}</span>
            <BaseIcon name="arrow-right" :size="10" class="text-text-hint" />
            <span :class="statusColor(dim.status)">{{ dim.after }}</span>
            <span class="text-2xs" :class="statusColor(dim.status)">
              ({{ dim.delta > 0 ? '+' : '' }}{{ dim.delta }})
            </span>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2 text-xs text-text-hint font-ui">
        <BaseIcon name="info" :size="12" />
        <span>Not revised yet</span>
      </div>
    </template>
  </div>
</template>
