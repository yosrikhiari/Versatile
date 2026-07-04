<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) =>
      ['primary', 'secondary', 'ghost', 'danger', 'accent-ghost', 'elevated', 'outline'].includes(v)
  },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v)
  },
  disabled: Boolean,
  loading: Boolean,
  icon: String,
  iconPosition: {
    type: String,
    default: 'left'
  },
  type: {
    type: String,
    default: 'button'
  },
  customClass: {
    type: String,
    default: ''
  }
})

const baseClasses =
  'inline-flex items-center justify-center gap-1.5 font-ui font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-bg-base disabled:opacity-40 disabled:pointer-events-none'

const sizeClasses = computed(
  () =>
    ({
      sm: 'px-2 py-1 text-11px',
      md: 'px-3 py-1.5 text-xs',
      lg: 'px-4 py-2 text-sm'
    })[props.size]
)

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.98]'
    case 'secondary':
      return 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-bg-secondary'
    case 'ghost':
      return 'text-text-hint hover:text-text-secondary hover:bg-bg-tertiary active:bg-bg-secondary'
    case 'danger':
      return 'bg-danger text-white hover:bg-danger/90 active:scale-[0.98]'
    case 'accent-ghost':
      return 'bg-accent/10 text-accent hover:bg-accent/20 active:scale-[0.98]'
    case 'elevated':
      return 'bg-accent text-accent-foreground btn-elevated'
    case 'outline':
      return 'border border-border-subtle text-text-secondary hover:border-accent hover:text-accent active:bg-accent/5'
    default:
      return ''
  }
})

const iconSize = computed(
  () =>
    ({
      sm: 14,
      md: 15,
      lg: 16
    })[props.size]
)

const ariaAttrs = computed(() => {
  const attrs = {}
  if (props.loading) attrs['aria-label'] = 'Loading...'
  if (props.disabled) attrs['aria-disabled'] = 'true'
  return attrs
})
</script>

<template>
  <button
    :type="type"
    :class="[baseClasses, sizeClasses, variantClasses, customClass]"
    :disabled="disabled || loading"
    v-bind="ariaAttrs"
  >
    <BaseIcon v-if="loading" name="loader-2" :size="iconSize" class="animate-spin shrink-0" />
    <BaseIcon
      v-else-if="icon && iconPosition === 'left'"
      :name="icon"
      :size="iconSize"
      class="shrink-0"
    />
    <slot />
    <BaseIcon
      v-if="icon && iconPosition === 'right'"
      :name="icon"
      :size="iconSize"
      class="shrink-0"
    />
  </button>
</template>
