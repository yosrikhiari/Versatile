<script setup>
import BaseIcon from './BaseIcon.vue'

defineProps({
  icon: {
    type: String,
    default: 'inbox'
  },
  title: {
    type: String,
    default: 'Nothing here yet'
  },
  description: {
    type: String,
    default: ''
  },
  actionLabel: {
    type: String,
    default: ''
  },
  actionIcon: {
    type: String,
    default: 'plus'
  }
})

const emit = defineEmits(['action'])
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div class="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-5">
      <BaseIcon :name="icon" :size="24" class="text-accent" />
    </div>
    <h3 class="text-sm font-ui font-medium text-text-primary mb-1.5">{{ title }}</h3>
    <p v-if="description" class="text-xs text-text-hint max-w-xs leading-relaxed">{{ description }}</p>
    <slot />
    <button
      v-if="actionLabel"
      class="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-11px font-ui font-medium transition-all duration-200 cursor-pointer"
      @click="emit('action')"
    >
      <BaseIcon :name="actionIcon" :size="12" />
      {{ actionLabel }}
    </button>
  </div>
</template>
