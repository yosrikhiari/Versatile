<script setup>
import BaseButton from '../ui/BaseButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  result: { type: Object, required: true }
})

const emit = defineEmits(['action'])

const severityConfig = {
  error: { icon: 'alert-circle', tone: 'text-danger' },
  warning: { icon: 'alert-triangle', tone: 'text-warning' },
  info: { icon: 'info', tone: 'text-text-hint' }
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
  <li class="flex items-start gap-3 px-1 py-2.5">
    <BaseIcon :name="cfg().icon" :size="14" :class="['shrink-0 mt-0.5', cfg().tone]" />
    <div class="flex-1 min-w-0">
      <p class="font-ui text-sm text-text-primary leading-5">{{ result.title }}</p>
      <p class="font-ui text-xs text-text-hint leading-4">
        {{ result.category
        }}<template v-if="result.description"> · {{ result.description }}</template>
      </p>
      <p
        v-if="result.detail"
        class="mt-1.5 font-manuscript text-xs text-text-secondary leading-5 border-l-2 border-border-subtle pl-2 whitespace-pre-wrap"
      >
        {{ result.detail }}
      </p>
    </div>
    <BaseButton
      v-if="result.action"
      variant="ghost"
      size="sm"
      custom-class="shrink-0"
      @click="handleAction"
    >
      {{ result.action.label }}
    </BaseButton>
  </li>
</template>
