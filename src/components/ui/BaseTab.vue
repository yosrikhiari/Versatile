<script setup>
import { computed } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  variant: {
    type: String,
    default: 'underline',
    validator: v => ['underline', 'pill', 'segment'].includes(v)
  },
  active: Boolean,
  disabled: Boolean,
  size: {
    type: String,
    default: 'md',
    validator: v => ['sm', 'md'].includes(v)
  },
  customClass: {
    type: String,
    default: ''
  }
})

const baseClasses = 'font-ui font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-inset'

const sizeClasses = computed(() => ({
  sm: 'text-11px px-2 py-1.5',
  md: 'text-xs px-3 py-2'
}[props.size]))

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'underline':
      return [
        'border-b-2',
        props.active
          ? 'text-accent border-accent'
          : 'text-text-hint border-transparent hover:text-text-secondary hover:border-text-hint/20'
      ].join(' ')
    case 'pill':
      return [
        'rounded-full',
        props.active
          ? 'bg-accent text-accent-foreground'
          : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      ].join(' ')
    case 'segment':
      return [
        'rounded-md',
        props.active
          ? 'bg-accent text-accent-foreground shadow-sm'
          : 'text-text-hint hover:text-text-secondary'
      ].join(' ')
    default:
      return ''
  }
})
</script>

<template>
  <button
    role="tab"
    :aria-selected="active ? 'true' : 'false'"
    :disabled="disabled"
    :class="[baseClasses, sizeClasses, variantClasses, customClass]"
  >
    <slot />
  </button>
</template>
