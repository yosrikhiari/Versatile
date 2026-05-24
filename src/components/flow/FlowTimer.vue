<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  remaining: Number,
  sessionWordCount: Number,
  sessionGoal: Number,
  sessionProgress: Number,
  dailyWordCount: Number,
  dailyGoal: Number,
  dailyProgress: Number
})

const emit = defineEmits(['open-settings'])

const formattedTime = computed(() => {
  const mins = Math.floor(props.remaining / 60)
  const secs = props.remaining % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
})

const progressPercent = computed(() => {
  return Math.min((props.sessionWordCount / props.sessionGoal) * 100, 100)
})
</script>

<template>
  <div class="bg-bg-secondary border-t border-border-subtle px-6 py-3">
    <div class="max-w-3xl mx-auto flex items-center gap-4">
      <span class="text-lg font-mono text-accent font-semibold">{{ formattedTime }}</span>
      
      <div class="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
        <div 
          class="h-full bg-accent transition-all duration-500"
          :style="{ width: `${progressPercent}%` }"
        ></div>
      </div>
      
      <span class="text-xs text-text-hint font-ui whitespace-nowrap">
        {{ sessionWordCount }} / {{ sessionGoal }} words
      </span>

      <button
        class="text-text-hint hover:text-accent text-sm ml-2 focus:outline-none focus:ring-2 focus:ring-accent rounded p-1"
        title="Daily goal settings"
        @click="emit('open-settings')"
      >
        <BaseIcon name="settings" :size="16" />
      </button>
    </div>

    <div class="max-w-[680px] mx-auto flex items-center gap-4 mt-3">
      <span class="text-xs text-text-hint font-ui w-12">Daily</span>
      
      <div class="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div 
          class="h-full bg-success transition-all duration-500"
          :style="{ width: `${dailyProgress}%` }"
        ></div>
      </div>
      
      <span class="text-xs text-text-hint font-ui whitespace-nowrap">
        {{ dailyWordCount }} / {{ dailyGoal }} words
      </span>
    </div>
  </div>
</template>
