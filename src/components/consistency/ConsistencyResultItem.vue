<script setup>
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  result: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['action'])

const severityConfig = {
  error: { icon: 'alert-circle', color: 'var(--vers-error, #ef4444)' },
  warning: { icon: 'alert-triangle', color: 'var(--vers-warning, #f59e0b)' },
  info: { icon: 'info', color: 'var(--vers-info, #3b82f6)' }
}

const categoryLabels = {
  orphaned_character: 'Orphaned Character',
  orphaned_location: 'Orphaned Location',
  undefined_mention: 'Undefined Mention',
  graph_mismatch: 'Graph Mismatch',
  plot_thread_gap: 'Plot Thread Gap',
  relationship_orphan: 'Relationship Orphan'
}

function cfg() {
  return severityConfig[props.result.severity] || severityConfig.info
}

function handleAction() {
  if (props.result.action) {
    emit('action', props.result.action)
  }
}
</script>

<template>
  <div :class="['result-item', `result-item--${result.severity}`]">
    <div class="result-icon">
      <BaseIcon :name="cfg().icon" :size="16" :stroke-width="2" :style="{ color: cfg().color }" />
    </div>
    <div class="result-body">
      <div class="result-header">
        <span class="result-category">{{
          categoryLabels[result.category] || result.category
        }}</span>
      </div>
      <span class="result-title">{{ result.title }}</span>
      <p v-if="result.description" class="result-desc">{{ result.description }}</p>
    </div>
    <button v-if="result.action" class="result-action" @click="handleAction">
      {{ result.action.label }}
    </button>
  </div>
</template>

<style scoped>
.result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.15s;
}
.result-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.result-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.result-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.result-category {
  font-size: 0.5625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vers-text-hint);
  opacity: 0.7;
}

.result-title {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vers-text-primary);
  line-height: 1.3;
}

.result-desc {
  font-size: 0.6875rem;
  color: var(--vers-text-secondary);
  line-height: 1.4;
  margin: 0;
}

.result-action {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--vers-border-subtle);
  background: transparent;
  color: var(--vers-accent-primary);
  font-size: 0.625rem;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
  white-space: nowrap;
}
.result-action:hover {
  background: rgba(var(--vers-accent-primary-rgb), 0.1);
  border-color: var(--vers-accent-primary);
}
</style>
