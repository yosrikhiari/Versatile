<script setup>
import { computed } from 'vue'
import * as LucideIcons from 'lucide-vue-next'

const props = defineProps({
  name: {
    type: String,
    default: 'circle'
  },
  size: {
    type: [Number, String],
    default: 16
  },
  strokeWidth: {
    type: [Number, String],
    default: 1.5
  },
  class: {
    type: String,
    default: ''
  }
})

const iconComponent = computed(() => {
  const name = props.name || 'circle'
  const pascalCase = name.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('')
  
  return LucideIcons[pascalCase] || LucideIcons.Circle
})
</script>

<template>
  <component
    :is="iconComponent"
    :size="Number(size)"
    :stroke-width="Number(strokeWidth)"
    :class="$props.class"
    aria-hidden="true"
  />
</template>
