<template>
  <div class="space-y-3">
    <!-- Summary Stats Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold text-text-primary font-ui">{{ displayStats.total }}</p>
        <p class="text-2xs text-text-hint font-ui">Scenes Evaluated</p>
      </div>
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold font-ui" :class="avgScoreClass">{{ displayStats.avgScore }}</p>
        <p class="text-2xs text-text-hint font-ui">Average Score</p>
      </div>
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold font-ui" :class="passRateClass">{{ displayStats.passRate }}%</p>
        <p class="text-2xs text-text-hint font-ui">Pass Rate</p>
      </div>
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold font-ui" :class="regressionClass">
          {{ displayStats.regressions }}
        </p>
        <p class="text-2xs text-text-hint font-ui">Regressions</p>
      </div>
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold font-ui" :class="majorRegressionClass">
          {{ displayStats.majorRegressions }}
        </p>
        <p class="text-2xs text-text-hint font-ui">Major Regressions</p>
      </div>
      <div class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3 text-center">
        <p class="text-lg font-bold text-text-primary font-ui">{{ displayStats.totalGates }}</p>
        <p class="text-2xs text-text-hint font-ui">Gates Checked</p>
      </div>
    </div>

    <!-- Gate Health -->
    <div
      v-if="gateHealth.length > 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
        Pipeline Health
      </h4>
      <div class="space-y-1.5">
        <div v-for="gate in gateHealth" :key="gate.name" class="flex items-center gap-2 text-xs">
          <BaseIcon
            :name="gate.passing ? 'check-circle' : 'alert-triangle'"
            :size="12"
            :class="gate.passing ? 'text-emerald-400' : 'text-amber-400'"
          />
          <span class="font-ui text-text-primary flex-1">{{ gate.label }}</span>
          <span class="font-ui" :class="gate.passing ? 'text-emerald-400' : 'text-amber-400'">{{
            gate.passing ? 'PASS' : gate.failures + ' fail'
          }}</span>
        </div>
      </div>
    </div>

    <!-- Per-Dimension Scores -->
    <div
      v-if="dimensionStats.length > 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
        Score by Dimension
      </h4>
      <div class="space-y-1.5">
        <div v-for="dim in dimensionStats" :key="dim.name" class="flex items-center gap-2 text-xs">
          <span class="font-ui text-text-primary w-24 truncate shrink-0">{{ dim.label }}</span>
          <div class="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="dim.barClass"
              :style="{ width: dim.barWidth + '%' }"
            ></div>
          </div>
          <span class="font-ui w-8 text-right" :class="dim.scoreClass">{{ dim.avg }}</span>
        </div>
      </div>
    </div>

    <!-- Degradation Hotspots -->
    <div
      v-if="degradationHotspots.length > 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
        Degradation Hotspots
      </h4>
      <div class="space-y-1.5">
        <div
          v-for="dim in degradationHotspots"
          :key="dim.name"
          class="flex items-center gap-2 text-xs"
        >
          <BaseIcon name="trending-down" :size="12" class="text-red-400 shrink-0" />
          <span class="font-ui text-text-primary flex-1">{{ dim.label }}</span>
          <span class="font-ui text-red-400">{{ dim.regressed }}/{{ dim.total }} regressed</span>
        </div>
      </div>
      <p
        v-if="degradationHotspots.length === 0 && hasDegradationData"
        class="text-xs text-emerald-400 font-ui text-center py-1"
      >
        No degradation hotspots detected
      </p>
    </div>

    <!-- Score Distribution -->
    <div
      v-if="scoreDistribution.length > 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
        Score Distribution
      </h4>
      <div class="space-y-1">
        <div
          v-for="bucket in scoreDistribution"
          :key="bucket.label"
          class="flex items-center gap-2 text-xs"
        >
          <span class="font-ui text-text-hint w-16 shrink-0">{{ bucket.label }}</span>
          <div class="flex-1 h-3 rounded-full bg-bg-tertiary overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="bucket.barClass"
              :style="{ width: bucket.pct + '%' }"
            ></div>
          </div>
          <span class="font-ui text-text-secondary w-8 text-right">{{ bucket.count }}</span>
        </div>
      </div>
    </div>

    <!-- Score Sparkline Preview -->
    <div
      v-if="sparklineScores.length >= 2"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui">
          Recent Scores
        </h4>
        <button
          class="text-2xs text-accent font-ui hover:text-accent/80 transition-colors"
          @click="showTrends = !showTrends"
        >
          {{ showTrends ? 'Hide Trends' : 'View Trends' }}
        </button>
      </div>
      <div class="flex items-end gap-1 h-12">
        <div
          v-for="(s, i) in sparklineScores"
          :key="i"
          class="flex-1 rounded-t transition-all duration-200"
          :class="s >= 7 ? 'bg-emerald-500' : s >= 5 ? 'bg-amber-500' : 'bg-red-500'"
          :style="{ height: (s / 10) * 100 + '%' }"
          :title="'Score: ' + s"
        ></div>
      </div>
    </div>

    <!-- Trends Panel -->
    <EvalTrends
      v-if="showTrends && projectId"
      :project-id="projectId"
      :workspace-type="workspaceType"
      @close="showTrends = false"
    />

    <!-- Drift Detection -->
    <div
      v-if="enableDrift"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
        Drift Detection
      </h4>
      <DriftAlerts
        :drift-report="driftReport"
        :analysis-error="driftAnalysisError"
        :is-analyzing="driftIsAnalyzing"
        :flagged-regressions="driftFlaggedRegressions"
        :flagged-improvements="driftFlaggedImprovements"
        :flagged-volatility="driftFlaggedVolatility"
        :has-drift="driftHasDrift"
        :has-high-severity="driftHasHighSeverity"
        @run-analysis="$emit('run-drift-analysis')"
      />
    </div>

    <!-- Active Learning -->
    <div
      v-if="enableActiveLearning"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-3"
    >
      <h4 class="text-11px uppercase tracking-wider text-text-hint font-ui mb-2">
        Active Learning
      </h4>
      <ActiveLearningPanel
        :analysis-report="alAnalysisReport"
        :analysis-error="alAnalysisError"
        :is-analyzing="alIsAnalyzing"
        :recommendations="alRecommendations"
        :below-threshold-recs="alBelowThresholdRecs"
        :no-data-recs="alNoDataRecs"
        :has-actionable-items="alHasActionableItems"
        @run-analysis="$emit('run-active-learning')"
      />
    </div>

    <!-- Empty State -->
    <div
      v-if="totalScenes === 0"
      class="rounded-lg bg-bg-tertiary/40 border border-border-subtle p-6 text-center"
    >
      <BaseIcon name="bar-chart" :size="24" class="mx-auto text-text-hint mb-2" />
      <p class="text-sm text-text-secondary font-ui">No evaluation data yet</p>
      <p class="text-xs text-text-hint mt-1">
        Scores and metrics will appear as scenes are evaluated.
      </p>
    </div>
  </div>
</template>

<script>
import { computed, ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { getDimensionsForWorkspace } from '../../config/evalDimensions'
import DriftAlerts from './DriftAlerts.vue'
import ActiveLearningPanel from './ActiveLearningPanel.vue'
import EvalTrends from './EvalTrends.vue'

export default {
  name: 'EvalDashboard',
  components: { BaseIcon, DriftAlerts, ActiveLearningPanel, EvalTrends },
  props: {
    sceneResultsMap: { type: Object, required: true },
    gateResults: { type: Object, default: () => ({}) },
    workspaceType: { type: String, default: 'creative' },
    evaluateAll: { type: Function, default: null },
    projectId: { type: String, default: null },

    // Drift detection
    enableDrift: { type: Boolean, default: false },
    driftReport: { type: Object, default: null },
    driftAnalysisError: { type: String, default: null },
    driftIsAnalyzing: { type: Boolean, default: false },
    driftFlaggedRegressions: { type: Array, default: () => [] },
    driftFlaggedImprovements: { type: Array, default: () => [] },
    driftFlaggedVolatility: { type: Array, default: () => [] },
    driftHasDrift: { type: Boolean, default: false },
    driftHasHighSeverity: { type: Boolean, default: false },

    // Active learning
    enableActiveLearning: { type: Boolean, default: false },
    alAnalysisReport: { type: Object, default: null },
    alAnalysisError: { type: String, default: null },
    alIsAnalyzing: { type: Boolean, default: false },
    alRecommendations: { type: Array, default: () => [] },
    alBelowThresholdRecs: { type: Array, default: () => [] },
    alNoDataRecs: { type: Array, default: () => [] },
    alHasActionableItems: { type: Boolean, default: false }
  },
  emits: ['run-drift-analysis', 'run-active-learning'],
  setup(props) {
    const _showTrends = ref(false)

    const _sparklineScores = computed(() => {
      return Object.values(props.sceneResultsMap)
        .map((s) => s.score)
        .filter((s) => s != null)
        .slice(-10)
    })

    const dimensionNames = computed(() => {
      const dims = getDimensionsForWorkspace(props.workspaceType)
      return Object.entries(dims).map(([key, cfg]) => ({
        value: key,
        label: cfg.label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      }))
    })
    const totalScenes = computed(() => Object.keys(props.sceneResultsMap).length)
    const evaluatedScenes = computed(() => {
      return Object.values(props.sceneResultsMap).filter((s) => s.score != null).length
    })
    const hasResults = computed(() => evaluatedScenes.value > 0)

    const avgScore = computed(() => {
      if (!hasResults.value) return 0
      const scores = Object.values(props.sceneResultsMap)
        .map((s) => s.score)
        .filter((s) => s != null)
      return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—'
    })

    const regressions = computed(() => {
      return Object.values(props.sceneResultsMap).filter((s) => s.hasRegressions).length
    })

    const majorRegressions = computed(() => {
      return Object.values(props.sceneResultsMap).filter((s) => s.hasMajorRegressions).length
    })

    const passRate = computed(() => {
      if (!hasResults.value) return 0
      const passed = Object.values(props.sceneResultsMap).filter((s) => s.score >= 6).length
      return Math.round((passed / evaluatedScenes.value) * 100)
    })

    const totalGatePasses = computed(() => {
      let total = 0
      Object.values(props.sceneResultsMap).forEach((scene) => {
        if (scene.gateResults) {
          const passing = Object.values(scene.gateResults).filter((g) => g.pass !== false).length
          total += passing
        }
      })
      return total
    })

    const displayStats = computed(() => ({
      total: evaluatedScenes.value + ' / ' + totalScenes.value,
      avgScore: avgScore.value,
      passRate: passRate.value,
      regressions: regressions.value,
      majorRegressions: majorRegressions.value,
      totalGates: totalGatePasses.value
    }))

    const avgScoreClass = computed(() => {
      const v = parseFloat(avgScore.value)
      if (isNaN(v)) return 'text-text-primary'
      if (v >= 7) return 'text-emerald-400'
      if (v >= 5) return 'text-amber-400'
      return 'text-red-400'
    })

    const passRateClass = computed(() => {
      if (passRate.value >= 70) return 'text-emerald-400'
      if (passRate.value >= 40) return 'text-amber-400'
      return 'text-red-400'
    })

    const regressionClass = computed(() => {
      return regressions.value > 0 ? 'text-amber-400' : 'text-emerald-400'
    })

    const majorRegressionClass = computed(() => {
      return majorRegressions.value > 0 ? 'text-red-400' : 'text-emerald-400'
    })

    const gateHealth = computed(() => {
      const gates = {}
      Object.values(props.sceneResultsMap).forEach((scene) => {
        if (scene.gateResults) {
          Object.entries(scene.gateResults).forEach(([name, result]) => {
            if (!gates[name]) gates[name] = { pass: 0, fail: 0 }
            if (result.pass !== false) gates[name].pass++
            else gates[name].fail++
          })
        }
      })
      return Object.entries(gates).map(([name, counts]) => ({
        name,
        label: name.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        passing: counts.fail === 0,
        failures: counts.fail
      }))
    })

    const dimensionStats = computed(() => {
      const names = dimensionNames.value
      const dimScores = {}
      names.forEach((d) => {
        dimScores[d.value] = []
      })
      Object.values(props.sceneResultsMap).forEach((scene) => {
        if (scene.dimensionScores) {
          Object.entries(scene.dimensionScores).forEach(([key, val]) => {
            if (dimScores[key] && val != null) dimScores[key].push(val)
          })
        }
      })
      return names
        .map((d) => {
          const scores = dimScores[d.value]
          if (!scores.length) return null
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length
          const barWidth = Math.round((avg / 10) * 100)
          const barClass = avg >= 7 ? 'bg-emerald-500' : avg >= 5 ? 'bg-amber-500' : 'bg-red-500'
          const scoreClass =
            avg >= 7 ? 'text-emerald-400' : avg >= 5 ? 'text-amber-400' : 'text-red-400'
          return {
            name: d.value,
            label: d.label,
            avg: avg.toFixed(1),
            barWidth,
            barClass,
            scoreClass
          }
        })
        .filter(Boolean)
    })

    const hasDegradationData = computed(() => {
      return Object.values(props.sceneResultsMap).some(
        (s) => s.degradation && Object.keys(s.degradation).length > 0
      )
    })

    const degradationHotspots = computed(() => {
      const dims = {}
      dimensionNames.value.forEach((d) => {
        dims[d.value] = { total: 0, regressed: 0, label: d.label }
      })
      Object.values(props.sceneResultsMap).forEach((scene) => {
        if (scene.degradation) {
          Object.entries(scene.degradation).forEach(([key, val]) => {
            if (dims[key]) {
              dims[key].total++
              if (val.status === 'regressed' || val.status === 'major_regression')
                dims[key].regressed++
            }
          })
        }
      })
      return Object.values(dims)
        .filter((d) => d.regressed > 0)
        .sort((a, b) => b.regressed / (b.total || 1) - a.regressed / (a.total || 1))
    })

    const scoreDistribution = computed(() => {
      const buckets = [
        { label: '9-10', min: 9, max: 10, count: 0, barClass: 'bg-emerald-500' },
        { label: '7-8', min: 7, max: 8.9, count: 0, barClass: 'bg-emerald-400' },
        { label: '5-6', min: 5, max: 6.9, count: 0, barClass: 'bg-amber-500' },
        { label: '3-4', min: 3, max: 4.9, count: 0, barClass: 'bg-orange-500' },
        { label: '1-2', min: 1, max: 2.9, count: 0, barClass: 'bg-red-500' }
      ]
      const scores = Object.values(props.sceneResultsMap)
        .map((s) => s.score)
        .filter((s) => s != null)
      if (!scores.length) return []
      scores.forEach((s) => {
        const bucket = buckets.find((b) => s >= b.min && s <= b.max)
        if (bucket) bucket.count++
      })
      const maxCount = Math.max(...buckets.map((b) => b.count), 1)
      return buckets
        .map((b) => ({ ...b, pct: Math.round((b.count / maxCount) * 100) }))
        .filter((b) => b.count > 0)
    })

    return {
      showTrends: _showTrends,
      sparklineScores: _sparklineScores,
      totalScenes,
      evaluatedScenes,
      hasResults,
      avgScore,
      regressions,
      majorRegressions,
      passRate,
      totalGatePasses,
      displayStats,
      avgScoreClass,
      passRateClass,
      regressionClass,
      majorRegressionClass,
      gateHealth,
      dimensionStats,
      degradationHotspots,
      hasDegradationData,
      scoreDistribution
    }
  }
}
</script>
