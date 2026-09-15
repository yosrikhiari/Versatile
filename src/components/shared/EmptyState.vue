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
    <div
      class="w-12 h-12 rounded-sm border border-border-subtle text-text-hint flex items-center justify-center mb-5"
    >
      <BaseIcon :name="icon" :size="24" class="text-accent" />
    </div>
    <h3 class="type-display text-xs text-text-primary mb-1.5">{{ title }}</h3>
    <p v-if="description" class="text-xs text-text-hint max-w-xs leading-relaxed">
      {{ description }}
    </p>
    <slot />
    <button
      v-if="actionLabel"
      class="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-border-subtle hover:border-accent active:scale-[0.97] text-accent text-xs font-ui font-medium transition-all duration-200 cursor-pointer"
      @click="emit('action')"
    >
      <BaseIcon :name="actionIcon" :size="12" />
      {{ actionLabel }}
    </button>
  </div>
</template>
