<script setup>
import BaseButton from '../ui/BaseButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  result: { type: Object, required: true }
})

const emit = defineEmits(['action'])

const severityConfig = {
  error: { icon: 'alert-circle', color: 'var(--vers-status-danger, #d07070)' },
  warning: { icon: 'alert-triangle', color: 'var(--vers-status-warning, #d4a74a)' },
  info: { icon: 'info', color: 'var(--vers-status-info, #5b8cb8)' }
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
        <span class="result-category">{{ result.category }}</span>
      </div>
      <span class="result-title">{{ result.title }}</span>
      <p v-if="result.description" class="result-desc">{{ result.description }}</p>
      <div v-if="result.detail" class="result-detail">{{ result.detail }}</div>
    </div>
    <BaseButton v-if="result.action" variant="outline" size="sm" @click="handleAction">
      {{ result.action.label }}
    </BaseButton>
  </div>
</template>

<style scoped>
.result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--vers-bg-hover);
  transition: background 0.15s;
}
.result-item:hover {
  background: var(--vers-bg-elevated);
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
  color: var(--vers-text-muted);
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

.result-detail {
  font-size: 0.625rem;
  color: var(--vers-text-muted);
  line-height: 1.3;
  margin-top: 2px;
  padding: 4px 6px;
  background: var(--vers-bg-base);
  border-radius: 4px;
}
</style>
