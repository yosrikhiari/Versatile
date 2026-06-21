<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  critiqueResult: { type: Object, default: null },
  gateResults: { type: Object, default: null },
  evalGates: { type: Object, default: null },
  workspaceType: { type: String, default: 'creative' },
  compact: { type: Boolean, default: false },
  degradation: { type: Object, default: null }
})

const passed = computed(() => props.critiqueResult?.pass ?? true)
const score = computed(() => props.critiqueResult?.score ?? null)

const dimensionScores = computed(() => {
  const raw = props.critiqueResult?.dimensionScores
  if (!raw) return []
  return Object.entries(raw).map(([key, val]) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    score: val,
    displayScore: val != null ? val : '—'
  }))
})

const issues = computed(() => props.critiqueResult?.issues || [])
const strengths = computed(() => props.critiqueResult?.strengths || [])

const majorIssues = computed(() => issues.value.filter(i => i.severity === 'major'))
const minorIssues = computed(() => issues.value.filter(i => i.severity === 'minor'))

const hasGateResults = computed(() => {
  const g = props.gateResults
  return g?.dimensionCoverage || g?.scoreDistribution || g?.revisionEffectiveness
})

const gateSummary = computed(() => {
  const g = props.evalGates?.summary
  if (!g) return null
  return g
})

const revisionDelta = computed(() => {
  const r = props.gateResults?.revisionEffectiveness
  if (!r || r.delta == null) return null
  return r.delta
})

function scoreColor(val) {
  if (val == null) return 'text-gray-500'
  if (val >= 8) return 'text-success'
  if (val >= 6) return 'text-warning'
  return 'text-danger'
}

function severityColor(sev) {
  return sev === 'major' ? 'text-danger' : 'text-warning'
}

function dimensionDegradation(dimKey) {
  if (!props.degradation?.dimensions) return null
  return props.degradation.dimensions[dimKey] || null
}

function degradationBadgeClass(dim) {
  const d = dimensionDegradation(dim.key)
  if (!d) return ''
  if (d.status === 'major_regression') return 'border-red-500/40 bg-red-500/10'
  if (d.status === 'regressed') return 'border-yellow-500/40 bg-yellow-500/10'
  if (d.status === 'improved') return 'border-green-500/40 bg-green-500/10'
  return ''
}

function degradationDeltaText(dim) {
  const d = dimensionDegradation(dim.key)
  if (!d) return ''
  return d.delta > 0 ? `+${d.delta}` : `${d.delta}`
}

function gateIcon(pass) {
  return pass ? 'check-circle' : 'alert-circle'
}

function gateColor(pass) {
  return pass ? 'text-success' : 'text-danger'
}
</script>

<template>
  <div class="eval-panel space-y-4">
    <!-- Overall Score -->
    <div v-if="!compact" class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <BaseIcon :name="passed ? 'check-circle' : 'x-circle'" :size="20" :class="passed ? 'text-success' : 'text-danger'" />
        <span class="text-sm font-ui text-text-primary">
          {{ passed ? 'Passed' : 'Needs Revision' }}
        </span>
      </div>
      <div v-if="score != null" class="flex items-center gap-1">
        <span class="text-2xl font-bold font-ui" :class="scoreColor(score)">{{ score }}</span>
        <span class="text-xs text-text-hint font-ui">/10</span>
      </div>
    </div>

    <!-- Gate Summary (aggregated across scenes) -->
    <div v-if="gateSummary" class="bg-gray-900/50 border border-gray-800 rounded-lg p-3">
      <h4 class="text-xs font-semibold text-text-secondary font-ui uppercase tracking-wider mb-2">Eval Gates</h4>
      <div class="flex items-center gap-3 text-xs font-ui">
        <span class="text-success">{{ gateSummary.passed }} passed</span>
        <span v-if="gateSummary.failed > 0" class="text-danger">{{ gateSummary.failed }} failed</span>
        <span class="text-text-hint">({{ gateSummary.total }} checks)</span>
      </div>
    </div>

    <!-- Per-Gate Details -->
    <div v-if="hasGateResults && !compact" class="space-y-2">
      <!-- Dimension Coverage -->
      <div v-if="props.gateResults.dimensionCoverage" class="bg-gray-900/30 border border-gray-800/50 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1">
          <h4 class="text-xs font-semibold text-text-secondary font-ui uppercase tracking-wider">Dimension Coverage</h4>
          <BaseIcon :name="gateIcon(props.gateResults.dimensionCoverage.pass)" :size="14" :class="gateColor(props.gateResults.dimensionCoverage.pass)" />
        </div>
        <div v-if="props.gateResults.dimensionCoverage.warnings?.length" class="space-y-0.5">
          <p v-for="(w, i) in props.gateResults.dimensionCoverage.warnings" :key="i" class="text-xs text-warning font-body">
            {{ w }}
          </p>
        </div>
        <p v-else class="text-xs text-text-hint font-body">All dimensions covered</p>
      </div>

      <!-- Score Distribution -->
      <div v-if="props.gateResults.scoreDistribution" class="bg-gray-900/30 border border-gray-800/50 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1">
          <h4 class="text-xs font-semibold text-text-secondary font-ui uppercase tracking-wider">Score Distribution</h4>
          <BaseIcon :name="gateIcon(props.gateResults.scoreDistribution.pass)" :size="14" :class="gateColor(props.gateResults.scoreDistribution.pass)" />
        </div>
        <div v-if="props.gateResults.scoreDistribution.flags?.length" class="space-y-0.5">
          <p v-for="(f, i) in props.gateResults.scoreDistribution.flags" :key="i" class="text-xs text-warning font-body">
            {{ f }}
          </p>
        </div>
        <p v-else class="text-xs text-text-hint font-body">Score distribution nominal</p>
      </div>

      <!-- Revision Effectiveness -->
      <div v-if="props.gateResults.revisionEffectiveness" class="bg-gray-900/30 border border-gray-800/50 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1">
          <h4 class="text-xs font-semibold text-text-secondary font-ui uppercase tracking-wider">Revision Effectiveness</h4>
          <BaseIcon :name="gateIcon(props.gateResults.revisionEffectiveness.pass)" :size="14" :class="gateColor(props.gateResults.revisionEffectiveness.pass)" />
        </div>
        <div class="space-y-0.5">
          <p v-if="revisionDelta != null" class="text-xs font-body" :class="revisionDelta >= 0 ? 'text-success' : 'text-danger'">
            Score delta: {{ revisionDelta >= 0 ? '+' : '' }}{{ revisionDelta }}
          </p>
          <p v-for="(r, i) in props.gateResults.revisionEffectiveness.regressions" :key="i" class="text-xs text-danger font-body">
            {{ r }}
          </p>
        </div>
        <p v-if="!props.gateResults.revisionEffectiveness.regressions?.length && revisionDelta == null" class="text-xs text-text-hint font-body">
          No revision needed
        </p>
      </div>
    </div>

    <!-- Dimension Scores Grid -->
    <div v-if="dimensionScores.length > 0 && !compact" class="grid grid-cols-2 gap-2">
      <div
v-for="dim in dimensionScores" :key="dim.key"
        class="bg-gray-900/30 border border-gray-800/50 rounded-lg p-2.5"
        :class="degradationBadgeClass(dim)">
        <div class="flex items-center justify-between mb-0.5">
          <div class="flex items-center gap-1 min-w-0">
            <span class="text-xs font-ui text-text-secondary truncate">{{ dim.label }}</span>
            <span
v-if="dimensionDegradation(dim.key)" class="text-2xs font-ui shrink-0"
              :class="dimensionDegradation(dim.key).status === 'major_regression' ? 'text-danger' : dimensionDegradation(dim.key).status === 'regressed' ? 'text-warning' : 'text-success'">
              {{ degradationDeltaText(dim) }}
            </span>
          </div>
          <span class="text-sm font-bold font-ui" :class="scoreColor(dim.score)">{{ dim.displayScore }}</span>
        </div>
        <div class="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            v-if="dim.score != null"
            class="h-full rounded-full transition-all duration-300"
            :class="dim.score >= 8 ? 'bg-success' : dim.score >= 6 ? 'bg-warning' : 'bg-danger'"
            :style="{ width: (dim.score / 10) * 100 + '%' }"
          />
        </div>
      </div>
    </div>

    <!-- Issues -->
    <div v-if="issues.length > 0 && !compact">
      <h4 class="text-xs font-semibold text-text-secondary font-ui uppercase tracking-wider mb-2">
        Issues ({{ majorIssues.length }} major, {{ minorIssues.length }} minor)
      </h4>
      <div class="space-y-1.5">
        <div v-for="(issue, i) in issues" :key="i" class="flex items-start gap-2 text-xs font-body">
          <BaseIcon name="alert-triangle" :size="12" :class="severityColor(issue.severity)" class="mt-0.5 shrink-0" />
          <div>
            <span class="font-semibold" :class="severityColor(issue.severity)">[{{ issue.severity }}]</span>
            <span class="text-text-secondary"> {{ issue.description }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Strengths -->
    <div v-if="strengths.length > 0 && !compact">
      <h4 class="text-xs font-semibold text-text-secondary font-ui uppercase tracking-wider mb-2">Strengths</h4>
      <div class="space-y-1.5">
        <div v-for="(strength, i) in strengths" :key="i" class="flex items-start gap-2 text-xs font-body">
          <BaseIcon name="sparkles" :size="12" class="text-success mt-0.5 shrink-0" />
          <span class="text-text-secondary">{{ strength }}</span>
        </div>
      </div>
    </div>

    <!-- No eval data -->
    <div v-if="!critiqueResult && !hasGateResults" class="text-center py-6 text-xs text-text-hint font-ui">
      No evaluation data yet
    </div>
  </div>
</template>
