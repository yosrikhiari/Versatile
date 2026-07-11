<script setup>
import { computed, onMounted, ref } from 'vue'
import { useStoryShapeAnalyzer } from '../../composables/useStoryShapeAnalyzer'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import TensionCurveChart from './TensionCurveChart.vue'
import EmotionalArcChart from './EmotionalArcChart.vue'
import CharacterFocusMatrix from './CharacterFocusMatrix.vue'
import NarrativeStructureTimeline from './NarrativeStructureTimeline.vue'
import StoryMetricsDashboard from './StoryMetricsDashboard.vue'

const {
  currentAnalysis,
  isAnalyzing,
  isAIAnalyzing,
  currentVersion,
  combinedTension,
  hasAnalysis,
  aiInsights,
  runFullAnalysis,
  loadLatestAnalysis
} = useStoryShapeAnalyzer()

const storyBible = useStoryBibleStore()

const chunkCount = computed(() => currentAnalysis.value?.wordBasedTension?.length ?? 0)
const emotionData = computed(() => currentAnalysis.value?.emotionByChunk ?? [])
const chunkTexts = computed(() => currentAnalysis.value?.chunks ?? [])
const characterNames = computed(() => storyBible.characters.map((c) => c.name))

const sharedHoverIndex = ref(null)

function onChartHover(index) {
  sharedHoverIndex.value = index
}

function onChartLeave() {
  sharedHoverIndex.value = null
}

onMounted(() => {
  loadLatestAnalysis()
})

function handleAnalyze() {
  runFullAnalysis()
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

function priorityLabel(p) {
  if (p === 'high') return 'High'
  if (p === 'medium') return 'Med'
  return 'Low'
}

function priorityClass(p) {
  if (p === 'high') return 'priority-high'
  if (p === 'medium') return 'priority-med'
  return 'priority-low'
}
</script>

<template>
  <div class="story-shape-panel">
    <div class="panel-header">
      <h3 class="panel-title">Story Shape</h3>
      <button class="analyze-btn" :disabled="isAnalyzing" @click="handleAnalyze">
        <span v-if="isAnalyzing" class="analyzing-spinner" />
        <template v-else>
          {{ hasAnalysis ? 'Reanalyze' : 'Analyze Manuscript' }}
        </template>
      </button>
    </div>

    <div v-if="isAnalyzing && !isAIAnalyzing" class="analyzing-state">
      <div class="spinner" />
      <span>Analyzing narrative structure…</span>
    </div>

    <template v-if="hasAnalysis">
      <div v-if="currentVersion > 0" class="version-badge">v{{ currentVersion }}</div>

      <div class="section">
        <h4 class="section-title">Tension Curve</h4>
        <TensionCurveChart
          :data="combinedTension"
          :hover-index="sharedHoverIndex"
          @hover="onChartHover"
          @leave="onChartLeave"
        />
        <div class="metric-row">
          <div class="metric">
            <span class="metric-value">{{ currentAnalysis.metrics.avgTension }}</span>
            <span class="metric-label">Average</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ currentAnalysis.metrics.maxTension }}</span>
            <span class="metric-label">Peak</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{
              currentAnalysis.metrics.wordCount.toLocaleString()
            }}</span>
            <span class="metric-label">Words</span>
          </div>
          <div class="metric">
            <span
              :class="[
                'metric-value',
                {
                  'text-accent': currentAnalysis.metrics.overallTensionLevel === 'high',
                  'text-yellow-400': currentAnalysis.metrics.overallTensionLevel === 'medium'
                }
              ]"
            >
              {{ currentAnalysis.metrics.overallTensionLevel }}
            </span>
            <span class="metric-label">Level</span>
          </div>
        </div>
      </div>

      <div class="section">
        <h4 class="section-title">Metrics</h4>
        <StoryMetricsDashboard
          :word-based-tension="currentAnalysis.wordBasedTension"
          :emotion-by-chunk="emotionData"
          :chunks="chunkTexts"
          :character-names="characterNames"
          :pacing-gradient="currentAnalysis.metrics.pacingGradient"
        />
      </div>

      <div class="section">
        <h4 class="section-title">Rhythm</h4>
        <div class="rhythm-block">
          <div class="rhythm-row">
            <span class="rhythm-label">Dialogue Ratio</span>
            <span class="rhythm-value"
              >{{ Math.round(currentAnalysis.metrics.dialogueRatio * 100) }}%</span
            >
          </div>
          <div class="rhythm-row">
            <span class="rhythm-label">Fingerprint</span>
            <span class="rhythm-value capitalize">{{
              currentAnalysis.metrics.rhythmFingerprint
            }}</span>
          </div>
          <div class="rhythm-row">
            <span class="rhythm-label">Pacing</span>
            <span class="rhythm-value"
              >{{ currentAnalysis.metrics.pacingGradient.toFixed(1) }}x</span
            >
          </div>
        </div>
      </div>

      <div v-if="emotionData.length" class="section">
        <h4 class="section-title">Emotional Arc</h4>
        <div class="emotion-breakdown">
          <div
            v-for="em in currentAnalysis.metrics.emotionBreakdown"
            :key="em.emotion"
            :class="[
              'emotion-bar',
              { dominant: currentAnalysis.metrics.dominantEmotion.emotion === em.emotion }
            ]"
          >
            <div class="emotion-bar-header">
              <span class="emotion-name">{{ em.emotion }}</span>
              <span class="emotion-score">{{ em.score }}</span>
            </div>
            <div class="emotion-track">
              <div
                class="emotion-fill"
                :style="{
                  width:
                    Math.min(
                      (em.score / currentAnalysis.metrics.dominantEmotion.score) * 100,
                      100
                    ) + '%'
                }"
              />
            </div>
          </div>
        </div>
        <EmotionalArcChart
          :data="emotionData"
          :hover-index="sharedHoverIndex"
          @hover="onChartHover"
          @leave="onChartLeave"
        />
      </div>

      <div v-if="storyBible.characters.length && chunkTexts.length" class="section">
        <h4 class="section-title">Character Focus</h4>
        <CharacterFocusMatrix
          :characters="storyBible.characters"
          :chunks="chunkTexts"
          :hover-index="sharedHoverIndex"
          @hover="onChartHover"
          @leave="onChartLeave"
        />
      </div>

      <div class="section">
        <h4 class="section-title">Structural Beats</h4>
        <NarrativeStructureTimeline
          :beats="currentAnalysis.metrics.structuralBeats"
          :chunk-count="chunkCount"
          :hover-index="sharedHoverIndex"
          @hover="onChartHover"
          @leave="onChartLeave"
        />
        <div class="beats-grid">
          <div
            v-for="beat in currentAnalysis.metrics.structuralBeats"
            :key="beat.label"
            :class="['beat-item', { 'beat-detected': beat.confidence > 20 }]"
          >
            <div class="beat-indicator">
              <div class="beat-dot" :style="{ opacity: Math.min(beat.confidence / 100, 1) }" />
            </div>
            <div class="beat-info">
              <span class="beat-label">{{ beat.label }}</span>
              <span class="beat-confidence">{{ Math.round(beat.confidence) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-if="isAIAnalyzing" class="section">
      <h4 class="section-title">AI Enhancement</h4>
      <div class="analyzing-ai-row">
        <div class="analyzing-spinner" />
        <span>Running AI narrative analysis…</span>
      </div>
    </div>

    <template v-if="aiInsights">
      <div v-if="aiInsights.narrativeArc" class="section">
        <h4 class="section-title">Narrative Arc</h4>
        <div class="arc-block">
          <div class="arc-type">{{ aiInsights.narrativeArc.type }}</div>
          <div class="arc-conf">Confidence: {{ aiInsights.narrativeArc.confidence }}%</div>
          <p class="arc-desc">{{ aiInsights.narrativeArc.description }}</p>
        </div>
      </div>

      <div v-if="aiInsights.pacingAssessment" class="section">
        <h4 class="section-title">Pacing Assessment</h4>
        <div class="pacing-block">
          <div
            :class="[
              'pacing-badge',
              aiInsights.pacingAssessment.rating?.includes('slow')
                ? 'pacing-warn'
                : aiInsights.pacingAssessment.rating === 'well-paced'
                  ? 'pacing-good'
                  : ''
            ]"
          >
            {{ aiInsights.pacingAssessment.rating }}
          </div>
          <div v-if="aiInsights.pacingAssessment.strengths?.length" class="pacing-list">
            <span class="pacing-list-label">Strengths</span>
            <ul>
              <li v-for="s in aiInsights.pacingAssessment.strengths" :key="s">{{ s }}</li>
            </ul>
          </div>
          <div v-if="aiInsights.pacingAssessment.concerns?.length" class="pacing-list">
            <span class="pacing-list-label">Concerns</span>
            <ul>
              <li v-for="c in aiInsights.pacingAssessment.concerns" :key="c">{{ c }}</li>
            </ul>
          </div>
        </div>
      </div>

      <div v-if="aiInsights.themes?.length" class="section">
        <h4 class="section-title">Themes</h4>
        <div class="themes-list">
          <div v-for="t in aiInsights.themes" :key="t.theme" class="theme-item">
            <div class="theme-header">
              <span class="theme-name">{{ t.theme }}</span>
              <span class="theme-relevance">{{ t.relevance }}%</span>
            </div>
            <div class="theme-track">
              <div class="theme-fill" :style="{ width: Math.min(t.relevance, 100) + '%' }" />
            </div>
            <p v-if="t.evidence" class="theme-evidence">{{ t.evidence }}</p>
          </div>
        </div>
      </div>

      <div v-if="aiInsights.qualityMetrics" class="section">
        <h4 class="section-title">Quality Metrics</h4>
        <div class="quality-grid">
          <div v-for="(val, key) in aiInsights.qualityMetrics" :key="key" class="quality-item">
            <span class="quality-label">{{ formatKey(key) }}</span>
            <div class="quality-bar-row">
              <div class="quality-track">
                <div
                  class="quality-fill"
                  :style="{ width: (Math.min(val, 10) / 10) * 100 + '%' }"
                />
              </div>
              <span class="quality-value">{{ val }}/10</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="aiInsights.recommendations?.length" class="section">
        <h4 class="section-title">Recommendations</h4>
        <div class="recs-list">
          <div
            v-for="(r, i) in aiInsights.recommendations"
            :key="i"
            :class="['rec-item', priorityClass(r.priority)]"
          >
            <div class="rec-header">
              <span :class="['rec-priority', priorityClass(r.priority)]">{{
                priorityLabel(r.priority)
              }}</span>
              <span class="rec-area">{{ r.area }}</span>
            </div>
            <p class="rec-suggestion">{{ r.suggestion }}</p>
          </div>
        </div>
      </div>
    </template>

    <div v-if="!isAnalyzing && !hasAnalysis" class="empty-state">
      <div class="empty-icon">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="text-text-hint"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
      <p class="empty-text">
        No analysis yet. Run an analysis to see the narrative shape of your manuscript.
      </p>
    </div>
  </div>
</template>

<style scoped>
.story-shape-panel {
  padding: 12px;
  font-family: Inter, system-ui, sans-serif;
  color: var(--vers-text-primary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--vers-text-primary);
}

.analyze-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--vers-accent-primary);
  background: transparent;
  color: var(--vers-accent-primary);
  font-size: 0.6875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
  font-family: inherit;
}

.analyze-btn:hover:not(:disabled) {
  background: rgba(var(--vers-accent-primary-rgb), 0.1);
}

.analyze-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.analyzing-spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--vers-accent-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.analyzing-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
  color: var(--vers-text-hint);
  font-size: 0.75rem;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--vers-accent-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.version-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(var(--vers-accent-primary-rgb), 0.1);
  color: var(--vers-accent-primary);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vers-text-hint);
  margin-bottom: 6px;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin-top: 6px;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 6px 4px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--vers-text-primary);
}

.metric-label {
  font-size: 0.625rem;
  color: var(--vers-text-hint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rhythm-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rhythm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.02);
}

.rhythm-label {
  font-size: 0.6875rem;
  color: var(--vers-text-secondary);
}

.rhythm-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vers-text-primary);
  font-variant-numeric: tabular-nums;
}

.emotion-breakdown {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.emotion-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.emotion-name {
  font-size: 0.6875rem;
  color: var(--vers-text-secondary);
  text-transform: capitalize;
}

.emotion-score {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--vers-text-hint);
  font-variant-numeric: tabular-nums;
}

.emotion-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.emotion-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--vers-accent-primary);
  transition: width 0.3s ease;
}

.dominant .emotion-name {
  color: var(--vers-accent-primary);
  font-weight: 600;
}

.beats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.beat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.15s;
}

.beat-item.beat-detected {
  background: rgba(var(--vers-accent-primary-rgb), 0.06);
}

.beat-indicator {
  display: flex;
  align-items: center;
}

.beat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vers-accent-primary);
}

.beat-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.beat-label {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--vers-text-primary);
}

.beat-confidence {
  font-size: 0.5625rem;
  color: var(--vers-text-hint);
  font-variant-numeric: tabular-nums;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  opacity: 0.3;
}

.empty-text {
  font-size: 0.75rem;
  color: var(--vers-text-hint);
  line-height: 1.4;
  max-width: 200px;
}

.capitalize {
  text-transform: capitalize;
}

.analyzing-ai-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--vers-text-hint);
  font-size: 0.6875rem;
}

.analyzing-ai-row .analyzing-spinner {
  width: 10px;
  height: 10px;
}

.arc-block {
  padding: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.arc-type {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--vers-accent-primary);
}

.arc-conf {
  font-size: 0.625rem;
  color: var(--vers-text-hint);
  margin-top: 1px;
}

.arc-desc {
  font-size: 0.6875rem;
  color: var(--vers-text-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

.pacing-block {
  padding: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.pacing-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: capitalize;
  background: rgba(255, 255, 255, 0.06);
  color: var(--vers-text-primary);
}

.pacing-badge.pacing-warn {
  background: rgba(250, 204, 21, 0.12);
  color: #facc15;
}

.pacing-badge.pacing-good {
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
}

.pacing-list {
  margin-top: 6px;
}

.pacing-list-label {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--vers-text-hint);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pacing-list ul {
  margin: 3px 0 0;
  padding-left: 14px;
  font-size: 0.6875rem;
  color: var(--vers-text-secondary);
  line-height: 1.4;
}

.pacing-list li {
  margin-bottom: 2px;
}

.themes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-item {
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
}

.theme-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.theme-name {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--vers-text-primary);
}

.theme-relevance {
  font-size: 0.625rem;
  color: var(--vers-text-hint);
  font-variant-numeric: tabular-nums;
}

.theme-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.theme-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--vers-accent-primary);
  transition: width 0.3s ease;
}

.theme-evidence {
  font-size: 0.625rem;
  color: var(--vers-text-hint);
  margin: 3px 0 0;
  line-height: 1.3;
  font-style: italic;
}

.quality-grid {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.quality-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quality-label {
  font-size: 0.625rem;
  color: var(--vers-text-secondary);
  text-transform: capitalize;
}

.quality-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.quality-track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.quality-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--vers-accent-primary);
  transition: width 0.3s ease;
}

.quality-value {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--vers-text-hint);
  min-width: 24px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.recs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rec-item {
  padding: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border-left: 2px solid transparent;
}

.rec-item.priority-high {
  border-left-color: #ef4444;
}

.rec-item.priority-med {
  border-left-color: #facc15;
}

.rec-item.priority-low {
  border-left-color: rgba(255, 255, 255, 0.15);
}

.rec-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.rec-priority {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.5625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rec-priority.priority-high {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.rec-priority.priority-med {
  background: rgba(250, 204, 21, 0.15);
  color: #facc15;
}

.rec-priority.priority-low {
  background: rgba(255, 255, 255, 0.06);
  color: var(--vers-text-hint);
}

.rec-area {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--vers-text-primary);
}

.rec-suggestion {
  font-size: 0.6875rem;
  color: var(--vers-text-secondary);
  line-height: 1.4;
  margin: 0;
}
</style>
