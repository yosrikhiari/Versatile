<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

/**
 * Semantic banner for inline feedback — a save confirmation, a validation
 * problem, a caution before an expensive generation run.
 *
 * Severity is carried by a tinted well plus a hue-matched icon rather than a
 * heavy colored rule, which keeps it inside the hairline surface language the
 * rest of the app uses.
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'info',
    validator: (v) => ['info', 'success', 'warning', 'danger'].includes(v)
  },
  title: String,
  /** Overrides the per-variant default icon. */
  icon: String,
  dismissible: Boolean,
  /**
   * Edge-to-edge presentation for app-level notification bars: no rounding, no
   * side borders, just the bottom hairline that separates it from the app below.
   */
  flush: Boolean
})

defineEmits(['dismiss'])

const VARIANTS = {
  info: {
    icon: 'info',
    surface: 'bg-info/10 border-info/25',
    fg: 'text-info',
    role: 'status'
  },
  success: {
    icon: 'circle-check',
    surface: 'bg-success/10 border-success/25',
    fg: 'text-success',
    role: 'status'
  },
  warning: {
    icon: 'triangle-alert',
    surface: 'bg-warning/10 border-warning/25',
    fg: 'text-warning',
    role: 'status'
  },
  danger: {
    icon: 'circle-alert',
    surface: 'bg-danger/10 border-danger/25',
    fg: 'text-danger',
    role: 'alert'
  }
}

const tone = computed(() => VARIANTS[props.variant])
</script>

<template>
  <div
    :role="tone.role"
    :class="[
      'flex items-start gap-2.5 border font-ui text-xs',
      tone.surface,
      flush ? 'border-x-0 border-t-0 px-4 py-2.5' : 'rounded-lg px-3 py-2.5'
    ]"
  >
    <BaseIcon :name="icon || tone.icon" :size="15" :class="['mt-px shrink-0', tone.fg]" />

    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-medium text-text-primary">{{ title }}</p>
      <div :class="['leading-relaxed', title ? 'mt-0.5 text-text-secondary' : 'text-text-primary']">
        <slot />
      </div>
      <div v-if="$slots.actions" class="mt-2 flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <button
      v-if="dismissible"
      type="button"
      class="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-text-hint transition-colors hover:bg-surface-hover hover:text-text-primary"
      aria-label="Dismiss"
      @click="$emit('dismiss')"
    >
      <BaseIcon name="x" :size="13" />
    </button>
  </div>
</template>
