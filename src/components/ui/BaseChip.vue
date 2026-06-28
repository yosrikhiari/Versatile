<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  variant: {
    type: String,
    default: 'default',
    validator: v => ['default', 'filter', 'removable'].includes(v)
  },
  active: Boolean,
  size: {
    type: String,
    default: 'sm',
    validator: v => ['sm', 'md'].includes(v)
  },
  color: {
    type: String,
    default: 'accent',
    validator: v => ['accent', 'success', 'danger', 'warning', 'info'].includes(v)
  },
  disabled: Boolean,
  customClass: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['remove'])

const sizeClasses = computed(() => ({
  sm: 'text-2xs px-1.5 py-0.5',
  md: 'text-xs px-2 py-1'
}[props.size]))

const colorMap = {
  accent: {
    bg: 'bg-accent/15',
    text: 'text-accent',
    activeBg: 'bg-accent',
    activeText: 'text-accent-foreground'
  },
  success: {
    bg: 'bg-success/15',
    text: 'text-success',
    activeBg: 'bg-success',
    activeText: 'text-white'
  },
  danger: {
    bg: 'bg-danger/15',
    text: 'text-danger',
    activeBg: 'bg-danger',
    activeText: 'text-white'
  },
  warning: {
    bg: 'bg-warning/15',
    text: 'text-warning',
    activeBg: 'bg-warning',
    activeText: 'text-white'
  },
  info: {
    bg: 'bg-info/15',
    text: 'text-info',
    activeBg: 'bg-info',
    activeText: 'text-white'
  }
}

const variantClasses = computed(() => {
  const c = colorMap[props.color]
  switch (props.variant) {
    case 'default':
      return `${c.bg} ${c.text}`
    case 'filter':
      return props.active
        ? `${c.activeBg} ${c.activeText}`
        : `${c.bg} ${c.text} hover:${c.bg.replace('/15', '/25')}`
    case 'removable':
      return `${c.bg} ${c.text} pr-1`
  }
})

const baseClasses = 'inline-flex items-center gap-1 rounded-full font-medium font-ui transition-all duration-150 active:scale-[0.97]'
</script>

<template>
  <span
    v-if="variant !== 'filter'"
    :class="[baseClasses, sizeClasses, variantClasses, customClass]"
  >
    <slot />
    <button
      v-if="variant === 'removable'"
      class="ml-0.5 rounded-full hover:bg-black/10 p-0.5 transition-colors focus:outline-none"
      :disabled="disabled"
      aria-label="Remove"
      @click.stop="emit('remove')"
    >
      <BaseIcon name="x" :size="10" />
    </button>
  </span>
  <button
    v-else
    role="tab"
    :aria-selected="active ? 'true' : 'false'"
    :disabled="disabled"
    :class="[baseClasses, sizeClasses, variantClasses, customClass]"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
