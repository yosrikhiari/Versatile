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
      <p>Run active learning to find improvement opportunities in your prompts or adjust calibration thresholds below.</p>
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
          These dimension averages are below the threshold — consider adjusting writer prompts or calibration below.
        </p>
        <div v-for="rec in belowThresholdRecs" :key="rec.dimension" class="al-recommendation">
          <div class="al-rec-header">
            <strong>{{ rec.dimension }}</strong>
            <span class="al-rec-score">
              Avg {{ rec.avgScore }}/10
              <span v-if="rec.activeThresholdIsCustom" class="badge badge-custom">Custom</span>
              <span v-else class="badge badge-default">Threshold {{ rec.threshold }}</span>
              <span v-if="rec.gap > 0" class="al-rec-gap">gap {{ rec.gap }}</span>
            </span>
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

    <div class="al-divider" />

    <div class="al-calibration">
      <h4 class="al-section-title">Calibration Thresholds</h4>
      <p class="al-section-desc">
        Adjust per-dimension scoring thresholds (1-10). Dimensions below their threshold trigger recommendations.
        Use calibration examples to guide what good output looks like for each dimension.
      </p>

      <div v-for="wt in allWorkspaceTypes" :key="wt" class="al-cal-workspace">
        <div class="al-cal-ws-header" @click="toggleWorkspace(wt)">
          <span class="al-cal-ws-toggle">{{ expandedWorkspaces[wt] ? '▼' : '▶' }}</span>
          <strong class="al-cal-ws-name">{{ wt }}</strong>
          <span class="al-cal-ws-count">
            {{ workspaceDimensionCount(wt) }} dimensions
            <template v-if="workspaceHasCustom(wt)"> &middot; <span class="badge badge-custom">Customized</span></template>
          </span>
        </div>

        <div v-if="expandedWorkspaces[wt]" class="al-cal-dims">
          <div v-for="dim in workspaceDimensions(wt)" :key="dim.key" class="al-cal-dim">
            <div class="al-cal-dim-header">
              <span class="al-cal-dim-label">{{ dim.label }}</span>
              <span class="al-cal-dim-default">Default {{ dim.defaultThreshold }}/10</span>
            </div>

            <div class="al-cal-dim-controls">
              <div class="al-cal-threshold-row">
                <label class="al-cal-label">Threshold:</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  :value="getCustomThreshold(wt, dim.key) ?? dim.defaultThreshold"
                  class="al-cal-slider"
                  @input="setCustomThreshold(wt, dim.key, Number($event.target.value))"
                />
                <input
                  type="number"
                  min="1"
                  max="10"
                  :value="getCustomThreshold(wt, dim.key) ?? dim.defaultThreshold"
                  class="al-cal-number"
                  @change="setCustomThreshold(wt, dim.key, Number($event.target.value))"
                />
                <button
                  v-if="getCustomThreshold(wt, dim.key) !== null"
                  class="btn btn-xs btn-outline"
                  @click="resetThresholds(wt, dim.key)"
                >
                  Reset
                </button>
              </div>

              <div class="al-cal-example-row">
                <label class="al-cal-label">Example:</label>
                <textarea
                  :value="getCalibrationExample(wt, dim.key)"
                  class="al-cal-textarea"
                  rows="2"
                  placeholder="Paste an example of good output for this dimension..."
                  @input="setCalibrationExample(wt, dim.key, $event.target.value)"
                />
              </div>
            </div>
          </div>

          <button
            v-if="workspaceHasCustom(wt)"
            class="btn btn-xs btn-outline al-cal-reset-all"
            @click="resetAllForWorkspace(wt)"
          >
            Reset all to defaults
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { EVAL_DIMENSIONS } from '../../config/evalDimensions.js'

const props = defineProps({
  analysisReport: { type: Object, default: null },
  analysisError: { type: String, default: null },
  isAnalyzing: { type: Boolean, default: false },
  recommendations: { type: Array, default: () => [] },
  belowThresholdRecs: { type: Array, default: () => [] },
  noDataRecs: { type: Array, default: () => [] },
  hasActionableItems: { type: Boolean, default: false },
  calibration: { type: Object, default: () => ({ thresholds: {}, examples: {} }) },
  getCustomThreshold: { type: Function, default: null },
  setCustomThreshold: { type: Function, default: null },
  getCalibrationExample: { type: Function, default: null },
  setCalibrationExample: { type: Function, default: null },
  resetThresholds: { type: Function, default: null },
  resetAllForWorkspace: { type: Function, default: null }
})

defineEmits(['run-analysis'])

const expandedWorkspaces = ref({})

const allWorkspaceTypes = computed(() => {
  return Object.keys(EVAL_DIMENSIONS)
})

function workspaceDimensions(wt) {
  const dims = EVAL_DIMENSIONS[wt]
  if (!dims) return []
  return Object.entries(dims).map(([key, val]) => ({
    key,
    label: val.label,
    defaultThreshold: val.defaultThreshold
  }))
}

function workspaceDimensionCount(wt) {
  const dims = EVAL_DIMENSIONS[wt]
  return dims ? Object.keys(dims).length : 0
}

function workspaceHasCustom(wt) {
  if (!props.calibration) return false
  const prefix = `${wt}:`
  return Object.keys(props.calibration.thresholds || {}).some((k) => k.startsWith(prefix))
}

function toggleWorkspace(wt) {
  expandedWorkspaces.value[wt] = !expandedWorkspaces.value[wt]
}
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
.al-rec-gap {
  margin-left: 0.3rem;
  font-size: 0.75rem;
  color: var(--vers-accent-warning, #cc9f4a);
}
.badge {
  display: inline-block;
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  margin-left: 0.3rem;
  vertical-align: middle;
}
.badge-custom {
  background: rgba(106, 158, 200, 0.15);
  color: #6a9ec8;
  border: 1px solid rgba(106, 158, 200, 0.3);
}
.badge-default {
  background: rgba(128, 128, 128, 0.1);
  color: var(--vers-text-muted);
}
.al-divider {
  height: 1px;
  background: var(--vers-border-subtle);
  margin: 1rem 0;
}
.al-calibration {
  margin-top: 0.5rem;
}
.al-cal-workspace {
  margin-bottom: 0.75rem;
  border: 1px solid var(--vers-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}
.al-cal-ws-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  background: var(--vers-bg-panel);
  user-select: none;
}
.al-cal-ws-header:hover {
  background: var(--vers-bg-hover);
}
.al-cal-ws-toggle {
  font-size: 0.65rem;
  color: var(--vers-text-muted);
  width: 12px;
}
.al-cal-ws-name {
  font-size: 0.85rem;
  text-transform: capitalize;
}
.al-cal-ws-count {
  font-size: 0.7rem;
  color: var(--vers-text-muted);
  margin-left: auto;
}
.al-cal-dims {
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--vers-border-subtle);
}
.al-cal-dim {
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--vers-border-subtle);
}
.al-cal-dim:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}
.al-cal-dim-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.al-cal-dim-label {
  font-weight: 600;
  font-size: 0.82rem;
}
.al-cal-dim-default {
  font-size: 0.7rem;
  color: var(--vers-text-muted);
}
.al-cal-dim-controls {
  padding-left: 0.5rem;
}
.al-cal-threshold-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.al-cal-label {
  font-size: 0.75rem;
  color: var(--vers-text-secondary);
  min-width: 60px;
  flex-shrink: 0;
}
.al-cal-slider {
  flex: 1;
  max-width: 140px;
  accent-color: var(--vers-accent-primary);
}
.al-cal-number {
  width: 50px;
  padding: 0.2rem 0.3rem;
  font-size: 0.78rem;
  border: 1px solid var(--vers-border-subtle);
  border-radius: 4px;
  background: var(--vers-bg-base);
  color: var(--vers-text-primary);
  text-align: center;
}
.al-cal-example-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}
.al-cal-textarea {
  flex: 1;
  padding: 0.3rem 0.4rem;
  font-size: 0.78rem;
  border: 1px solid var(--vers-border-subtle);
  border-radius: 4px;
  background: var(--vers-bg-base);
  color: var(--vers-text-primary);
  resize: vertical;
  font-family: inherit;
  line-height: 1.4;
}
.al-cal-textarea:focus {
  outline: none;
  border-color: var(--vers-accent-primary);
}
.al-cal-reset-all {
  margin-top: 0.5rem;
}
</style>
