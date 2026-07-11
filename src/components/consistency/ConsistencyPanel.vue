<script setup>
import { onMounted } from 'vue'

const emit = defineEmits(['navigate'])
import { useConsistencyChecker } from '../../composables/useConsistencyChecker'
import ConsistencyResultItem from './ConsistencyResultItem.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const { results, isScanning, counts, resultsBySeverity, scan, clearResults } =
  useConsistencyChecker()

onMounted(() => {
  if (results.value.length === 0) {
    scan()
  }
})

function handleRecheck() {
  clearResults()
  scan()
}

function handleResultAction(action) {
  emit('navigate', action)
}
</script>

<template>
  <div class="consistency-panel">
    <div class="panel-header">
      <h3 class="panel-title">Consistency Check</h3>
      <button class="scan-btn" :disabled="isScanning" @click="handleRecheck">
        <template v-if="isScanning">
          <span class="scanning-spinner" />
          Scanning…
        </template>
        <template v-else>
          <BaseIcon name="refresh-cw" :size="12" />
          {{ results.length > 0 ? 'Recheck' : 'Scan' }}
        </template>
      </button>
    </div>

    <div v-if="isScanning" class="scanning-state">
      <div class="spinner" />
      <span>Scanning for inconsistencies…</span>
    </div>

    <div v-else-if="results.length > 0">
      <div class="summary-row">
        <div v-if="counts.errors > 0" class="summary-badge summary-badge--error">
          {{ counts.errors }} error{{ counts.errors > 1 ? 's' : '' }}
        </div>
        <div v-if="counts.warnings > 0" class="summary-badge summary-badge--warning">
          {{ counts.warnings }} warning{{ counts.warnings > 1 ? 's' : '' }}
        </div>
        <div v-if="counts.info > 0" class="summary-badge summary-badge--info">
          {{ counts.info }} info
        </div>
      </div>

      <div class="results-list">
        <template v-for="group in ['errors', 'warnings', 'info']" :key="group">
          <div v-if="resultsBySeverity[group]?.length" class="result-group">
            <h4 v-if="group === 'errors'" class="group-label group-label--error">
              <BaseIcon name="alert-circle" :size="13" />
              Errors
            </h4>
            <h4 v-else-if="group === 'warnings'" class="group-label group-label--warning">
              <BaseIcon name="alert-triangle" :size="13" />
              Warnings
            </h4>
            <h4 v-else class="group-label group-label--info">
              <BaseIcon name="info" :size="13" />
              Info
            </h4>
            <ConsistencyResultItem
              v-for="item in resultsBySeverity[group]"
              :key="item.id"
              :result="item"
              @action="handleResultAction"
            />
          </div>
        </template>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <BaseIcon name="check-circle" :size="32" class="empty-check" />
      </div>
      <p class="empty-text">
        No inconsistencies found. Your story bible, manuscript, and story graph are in sync.
      </p>
    </div>
  </div>
</template>

<style scoped>
.consistency-panel {
  padding: 12px;
  font-family: Inter, system-ui, sans-serif;
  color: var(--vers-text-primary);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--vers-text-primary);
}

.scan-btn {
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

.scan-btn:hover:not(:disabled) {
  background: rgba(var(--vers-accent-primary-rgb), 0.1);
}

.scan-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.scanning-spinner {
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

.scanning-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0;
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

.summary-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.summary-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.summary-badge--error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.summary-badge--warning {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.summary-badge--info {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 2px 0;
  padding: 0 2px;
}

.group-label--error {
  color: #ef4444;
}

.group-label--warning {
  color: #f59e0b;
}

.group-label--info {
  color: #3b82f6;
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
  opacity: 0.4;
}

.empty-check {
  color: #22c55e;
}

.empty-text {
  font-size: 0.75rem;
  color: var(--vers-text-hint);
  line-height: 1.4;
  max-width: 220px;
}
</style>
