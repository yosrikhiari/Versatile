<template>
  <div class="active-learning-panel">
    <div v-if="isAnalyzing" class="al-status analyzing">
      <span class="spinner" />
      Analyzing eval data for improvement opportunities...
    </div>

    <div v-else-if="analysisError" class="al-status error">
      Analysis failed: {{ analysisError }}
    </div>

    <div v-else-if="!analysisReport" class="al-status idle">
      <p>Run active learning to find improvement opportunities in your prompts.</p>
      <button class="btn btn-sm btn-outline" @click="$emit('run-analysis')">
        Run Active Learning
      </button>
    </div>

    <template v-else>
      <div v-if="!hasActionableItems" class="alert alert-success">
        All dimensions above threshold. No prompt changes recommended.
      </div>

      <div v-if="belowThresholdRecs.length > 0" class="al-section">
        <h4 class="al-section-title">Below-Threshold Dimensions</h4>
        <p class="al-section-desc">
          These dimension averages are below the {{ belowThresholdRecs[0].threshold }}/10 threshold —
          consider adjusting writer prompts.
        </p>
        <div v-for="rec in belowThresholdRecs" :key="rec.dimension" class="al-recommendation">
          <div class="al-rec-header">
            <strong>{{ rec.dimension }}</strong>
            <span class="al-rec-score">Avg {{ rec.avgScore }} (gap {{ rec.gap }})</span>
          </div>
          <p class="al-rec-guidance">{{ rec.guidance }}</p>
          <div v-if="rec.promptKeywords.length > 0" class="al-rec-keywords">
            <span v-for="kw in rec.promptKeywords" :key="kw" class="keyword-tag">{{ kw }}</span>
          </div>
          <div v-if="rec.exampleSnippet" class="al-rec-snippet">
            <code>{{ rec.exampleSnippet }}</code>
          </div>
        </div>
      </div>

      <div v-if="noDataRecs.length > 0" class="al-section">
        <h4 class="al-section-title">Insufficient Data</h4>
        <p class="al-section-desc">These dimensions have no eval data yet.</p>
        <div v-for="rec in noDataRecs" :key="`nodata-${rec.dimension}`" class="al-recommendation nodata">
          <div class="al-rec-header">
            <strong>{{ rec.dimension }}</strong>
            <span class="al-rec-score">No data</span>
          </div>
          <p class="al-rec-guidance">{{ rec.guidance }}</p>
        </div>
      </div>

      <p v-if="analysisReport" class="al-meta">
        {{ analysisReport.summary.totalEvals }} evals across {{ analysisReport.summary.workspacesAnalyzed }} workspaces
        &middot; {{ analysisReport.generatedAt }}
      </p>
    </template>
  </div>
</template>

<script setup>
defineProps({
  analysisReport: { type: Object, default: null },
  analysisError: { type: String, default: null },
  isAnalyzing: { type: Boolean, default: false },
  recommendations: { type: Array, default: () => [] },
  belowThresholdRecs: { type: Array, default: () => [] },
  noDataRecs: { type: Array, default: () => [] },
  hasActionableItems: { type: Boolean, default: false }
})

defineEmits(['run-analysis'])
</script>

<style scoped>
.active-learning-panel {
  padding: 0;
}
.al-status {
  padding: 1rem;
  text-align: center;
  color: var(--vers-text-secondary);
}
.al-status.idle {
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
.alert-success {
  background: rgba(106, 158, 122, 0.1);
  border: 1px solid rgba(106, 158, 122, 0.3);
  color: #6a9e7a;
}
.al-section {
  margin-bottom: 1rem;
}
.al-section-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vers-text-secondary);
  margin-bottom: 0.2rem;
}
.al-section-desc {
  font-size: 0.8rem;
  color: var(--vers-text-muted);
  margin-bottom: 0.5rem;
}
.al-recommendation {
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  background: var(--vers-bg-panel);
  border-left: 3px solid var(--vers-accent-primary);
}
.al-recommendation.nodata {
  border-left-color: var(--vers-text-muted);
  opacity: 0.8;
}
.al-rec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.3rem;
}
.al-rec-score {
  font-size: 0.8rem;
  color: var(--vers-text-secondary);
}
.al-rec-guidance {
  font-size: 0.85rem;
  color: var(--vers-text-primary);
  margin-bottom: 0.3rem;
}
.al-rec-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.3rem;
}
.keyword-tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: var(--vers-bg-hover);
  color: var(--vers-text-secondary);
}
.al-rec-snippet {
  margin-top: 0.3rem;
}
.al-rec-snippet code {
  display: block;
  font-size: 0.78rem;
  padding: 0.4rem 0.5rem;
  background: var(--vers-bg-base);
  border-radius: 4px;
  color: var(--vers-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
.al-meta {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--vers-text-muted);
}
</style>
