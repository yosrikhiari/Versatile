<template>
  <div class="drift-alerts">
    <div v-if="isAnalyzing" class="drift-status analyzing">
      <span class="spinner" />
      Analyzing eval history for drift...
    </div>

    <div v-else-if="analysisError" class="drift-status error">
      Drift analysis failed: {{ analysisError }}
    </div>

    <div v-else-if="!driftReport" class="drift-status idle">
      <p>Run drift analysis to detect quality changes over time.</p>
      <button class="btn btn-sm btn-outline" @click="$emit('run-analysis')">
        Run Drift Analysis
      </button>
    </div>

    <template v-else>
      <div v-if="hasHighSeverity" class="alert alert-danger">
        High-severity regressions detected — review flagged dimensions
      </div>
      <div v-else-if="hasDrift" class="alert alert-warning">
        Drift detected — review changes below
      </div>
      <div v-else class="alert alert-success">
        No significant drift detected
      </div>

      <div v-if="flaggedRegressions.length > 0" class="drift-section">
        <h4 class="drift-section-title">Regressions</h4>
        <div v-for="r in flaggedRegressions" :key="`reg-${r.workspaceType}-${r.dimension}`" class="drift-item regression">
          <div class="drift-item-header">
            <span class="dimension-badge" :class="r.severity">{{ r.severity }}</span>
            <strong>{{ r.workspaceType }}</strong> / {{ r.dimension }}
          </div>
          <div class="drift-item-stats">
            <span>Delta: {{ r.delta }}</span>
            <span>Baseline: {{ r.baseline.mean }} → Recent: {{ r.recent.mean }}</span>
          </div>
          <p class="drift-item-recommendation">{{ r.recommendation }}</p>
        </div>
      </div>

      <div v-if="flaggedImprovements.length > 0" class="drift-section">
        <h4 class="drift-section-title">Improvements</h4>
        <div v-for="r in flaggedImprovements" :key="`imp-${r.workspaceType}-${r.dimension}`" class="drift-item improvement">
          <div class="drift-item-header">
            <span class="dimension-badge">improvement</span>
            <strong>{{ r.workspaceType }}</strong> / {{ r.dimension }}
          </div>
          <div class="drift-item-stats">
            <span>Delta: +{{ Math.abs(r.delta) }}</span>
            <span>Baseline: {{ r.baseline.mean }} → Recent: {{ r.recent.mean }}</span>
          </div>
        </div>
      </div>

      <div v-if="flaggedVolatility.length > 0" class="drift-section">
        <h4 class="drift-section-title">Volatility Increases</h4>
        <div v-for="r in flaggedVolatility" :key="`vol-${r.workspaceType}-${r.dimension}`" class="drift-item volatility">
          <div class="drift-item-header">
            <span class="dimension-badge">volatility</span>
            <strong>{{ r.workspaceType }}</strong> / {{ r.dimension }}
          </div>
          <div class="drift-item-stats">
            <span>Variance ratio: {{ r.varianceRatio }}x</span>
            <span>σ {{ r.baseline.stddev }} → {{ r.recent.stddev }}</span>
          </div>
        </div>
      </div>

      <p v-if="driftReport" class="drift-meta">
        {{ driftReport.summary.totalEvals }} evals across {{ driftReport.summary.workspacesAnalyzed }} workspaces
        &middot; {{ driftReport.generatedAt }}
      </p>
    </template>
  </div>
</template>

<script setup>
defineProps({
  driftReport: { type: Object, default: null },
  analysisError: { type: String, default: null },
  isAnalyzing: { type: Boolean, default: false },
  flaggedRegressions: { type: Array, default: () => [] },
  flaggedImprovements: { type: Array, default: () => [] },
  flaggedVolatility: { type: Array, default: () => [] },
  hasDrift: { type: Boolean, default: false },
  hasHighSeverity: { type: Boolean, default: false }
})

defineEmits(['run-analysis'])
</script>

<style scoped>
.drift-alerts {
  padding: 0;
}
.drift-status {
  padding: 1rem;
  text-align: center;
  color: var(--vers-text-secondary);
}
.drift-status.idle {
  border: 1px dashed var(--vers-border-subtle);
  border-radius: 8px;
}
.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--vers-border-subtle);
  border-top-color: var(--vers-accent-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-right: 0.5rem;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.alert {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  font-weight: 500;
}
.alert-danger {
  background: rgba(208, 112, 112, 0.1);
  border: 1px solid rgba(208, 112, 112, 0.3);
  color: #d07070;
}
.alert-warning {
  background: rgba(212, 167, 74, 0.1);
  border: 1px solid rgba(212, 167, 74, 0.3);
  color: #d4a74a;
}
.alert-success {
  background: rgba(106, 158, 122, 0.1);
  border: 1px solid rgba(106, 158, 122, 0.3);
  color: #6a9e7a;
}
.drift-section {
  margin-bottom: 0.75rem;
}
.drift-section-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vers-text-secondary);
  margin-bottom: 0.4rem;
}
.drift-item {
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.4rem;
  border-radius: 6px;
  background: var(--vers-bg-panel);
  font-size: 0.85rem;
}
.drift-item.regression {
  border-left: 3px solid #d07070;
}
.drift-item.improvement {
  border-left: 3px solid #6a9e7a;
}
.drift-item.volatility {
  border-left: 3px solid #d4a74a;
}
.drift-item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.dimension-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: var(--vers-bg-hover);
  color: var(--vers-text-secondary);
  text-transform: uppercase;
}
.dimension-badge.high {
  background: rgba(208, 112, 112, 0.2);
  color: #d07070;
}
.drift-item-stats {
  display: flex;
  gap: 1rem;
  color: var(--vers-text-secondary);
  font-size: 0.8rem;
  margin-bottom: 0.2rem;
}
.drift-item-recommendation {
  color: var(--vers-text-secondary);
  font-size: 0.8rem;
  margin: 0;
}
.drift-meta {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--vers-text-muted);
}
</style>
