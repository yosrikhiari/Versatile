<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  variant: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'filter', 'removable'].includes(v)
  },
  active: Boolean,
  size: {
    type: String,
    default: 'sm',
    validator: (v) => ['sm', 'md'].includes(v)
  },
  color: {
    type: String,
    default: 'accent',
    validator: (v) => ['accent', 'success', 'danger', 'warning', 'info', 'neutral'].includes(v)
  },
  disabled: Boolean,
  customClass: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['remove', 'click'])

const sizeClasses = computed(
  () =>
    ({
      sm: 'text-2xs px-1.5 py-0.5',
      md: 'text-xs px-2.5 py-1'
    })[props.size]
)

/**
 * Every class here is a whole literal string. Tailwind scans source as plain
 * text, so a class assembled at runtime (`hover:${bg.replace(...)}`) is never
 * generated and silently does nothing.
 */
const colorMap = {
  accent: {
    bg: 'bg-accent/15',
    hover: 'hover:bg-accent/25',
    text: 'text-accent',
    activeBg: 'bg-accent',
    activeText: 'text-bg-primary'
  },
  success: {
    bg: 'bg-success/15',
    hover: 'hover:bg-success/25',
    text: 'text-success',
    activeBg: 'bg-success',
    activeText: 'text-bg-primary'
  },
  danger: {
    bg: 'bg-danger/15',
    hover: 'hover:bg-danger/25',
    text: 'text-danger',
    activeBg: 'bg-danger',
    activeText: 'text-bg-primary'
  },
  warning: {
    bg: 'bg-warning/15',
    hover: 'hover:bg-warning/25',
    text: 'text-warning',
    activeBg: 'bg-warning',
    activeText: 'text-bg-primary'
  },
  info: {
    bg: 'bg-info/15',
    hover: 'hover:bg-info/25',
    text: 'text-info',
    activeBg: 'bg-info',
    activeText: 'text-bg-primary'
  },
  neutral: {
    bg: 'bg-surface-hover',
    hover: 'hover:bg-bg-elevated',
    text: 'text-text-secondary',
    activeBg: 'bg-text-secondary',
    activeText: 'text-bg-primary'
  }
}

/**
 * A filter chip at rest is neutral. Tinting every option in the accent — as a
 * per-color inactive style did — spends the accent on a whole row of things the
 * writer has *not* chosen, so the one they did choose stops standing out, and a
 * fourteen-genre list turns most of the panel accent-colored.
 *
 * Selection is the only accent event here: neutral well at rest, solid fill when
 * chosen. The tinted styles stay on `default`/`removable`, where the color
 * carries a status rather than an availability.
 */
const FILTER_REST = 'bg-bg-tertiary text-text-hint hover:bg-surface-hover hover:text-text-secondary'

const variantClasses = computed(() => {
  const c = colorMap[props.color]
  switch (props.variant) {
    case 'default':
      return `${c.bg} ${c.text}`
    case 'filter':
      return props.active ? `${c.activeBg} ${c.activeText}` : FILTER_REST
    case 'removable':
      return `${c.bg} ${c.text} pr-1`
    default:
      return ''
  }
})

const baseClasses =
  'inline-flex items-center gap-1 rounded-full font-medium font-ui transition-all duration-150 active:scale-[0.97]'
</script>

<template>
  <span
    v-if="variant !== 'filter'"
    :class="[baseClasses, sizeClasses, variantClasses, customClass]"
  >
    <slot />
    <button
      v-if="variant === 'removable'"
      class="ml-0.5 rounded-full hover:bg-surface-hover p-0.5 transition-colors focus:outline-none"
      :disabled="disabled"
      aria-label="Remove"
      @click.stop="emit('remove')"
    >
      <BaseIcon name="x" :size="10" />
    </button>
  </span>
  <!--
    A filter chip is a toggle button, so it reports `aria-pressed`. It used to
    claim `role="tab"`, which promises an owning tablist and a controlled
    tabpanel that no caller provides — screen readers announced "tab 1 of 1".
    Real tabs belong to BaseTab.
  -->
  <button
    v-else
    type="button"
    :aria-pressed="active ? 'true' : 'false'"
    :disabled="disabled"
    :class="[baseClasses, sizeClasses, variantClasses, customClass]"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
