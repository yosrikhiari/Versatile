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
  <div class="glass border-t border-border-subtle/50 px-6 py-3">
    <div class="max-w-3xl mx-auto flex items-center gap-4">
      <span class="text-lg font-mono text-accent font-semibold tabular-nums">{{ formattedTime }}</span>
      
      <div class="flex-1 h-2 bg-bg-tertiary/50 rounded-full overflow-hidden">
        <div 
          class="h-full bg-gradient-to-r from-accent/70 to-accent transition-all duration-500 rounded-full"
          :style="{ width: `${progressPercent}%` }"
        ></div>
      </div>
      
      <span class="text-xs text-text-hint/70 font-ui whitespace-nowrap tabular-nums">
        {{ sessionWordCount }} / {{ sessionGoal }} words
      </span>

      <button
        class="text-text-hint/50 hover:text-accent text-sm ml-2 focus:outline-none focus:ring-2 focus:ring-accent rounded-lg p-1.5 btn-ghost transition-all duration-150"
        title="Daily goal settings"
        @click="emit('open-settings')"
      >
        <BaseIcon name="settings" :size="16" />
      </button>
    </div>

    <div class="max-w-[680px] mx-auto flex items-center gap-4 mt-3">
      <span class="text-xs text-text-hint/50 font-ui w-12 tracking-wide">Daily</span>
      
      <div class="flex-1 h-1 bg-bg-tertiary/50 rounded-full overflow-hidden">
        <div 
          class="h-full bg-gradient-to-r from-success/70 to-success transition-all duration-500 rounded-full"
          :style="{ width: `${dailyProgress}%` }"
        ></div>
      </div>
      
      <span class="text-xs text-text-hint/70 font-ui whitespace-nowrap tabular-nums">
        {{ dailyWordCount }} / {{ dailyGoal }} words
      </span>
    </div>
  </div>
</template>
