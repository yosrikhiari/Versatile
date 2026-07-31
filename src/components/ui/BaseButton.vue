<script setup>
import { computed, useAttrs } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) =>
      [
        'primary',
        'secondary',
        'ghost',
        'soft',
        'danger',
        'accent-ghost',
        'elevated',
        'outline'
      ].includes(v)
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

/**
 * Focus is left to the global `*:focus-visible` outline rather than a local
 * ring. The previous ring fired on `:focus`, so it also lit up on mouse click,
 * and its `ring-offset-bg-base` named a color key that does not exist — the
 * offset silently fell back to white.
 */
const baseClasses =
  'inline-flex items-center justify-center gap-1.5 font-ui font-medium rounded-lg transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none'

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
      return 'bg-accent text-bg-primary hover:bg-accent-hover active:scale-[0.98]'
    case 'secondary':
      return 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-bg-secondary active:scale-[0.98]'
    case 'ghost':
      return 'text-text-hint hover:text-text-secondary hover:bg-bg-tertiary active:bg-bg-secondary active:scale-[0.98]'
    case 'danger':
      // Dark-on-danger clears AA (~7:1); white on the same fill sits near 3:1.
      return 'bg-danger text-bg-primary hover:bg-danger/90 active:scale-[0.98]'
    case 'soft':
      return 'bg-accent/12 text-accent hover:bg-accent/20 active:scale-[0.98]'
    case 'accent-ghost':
      return 'bg-surface-hover text-accent active:scale-[0.98]'
    case 'elevated':
      return 'bg-accent text-bg-primary btn-elevated active:scale-[0.98]'
    case 'outline':
      return 'border border-border-subtle text-text-secondary hover:border-accent hover:text-accent active:bg-accent/5 active:scale-[0.98]'
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

const attrs = useAttrs()

const ariaAttrs = computed(() => {
  const attrs = {}
  if (props.loading) attrs['aria-label'] = 'Loading...'
  if (props.disabled) attrs['aria-disabled'] = 'true'
  return attrs
})

const mergedAttrs = computed(() => ({ ...attrs, ...ariaAttrs.value }))
</script>

<template>
  <button
    v-bind="mergedAttrs"
    :type="type"
    :class="[baseClasses, sizeClasses, variantClasses, customClass]"
    :disabled="disabled || loading"
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
      v-if="!loading && icon && iconPosition === 'right'"
      :name="icon"
      :size="iconSize"
      class="shrink-0"
    />
  </button>
</template>
