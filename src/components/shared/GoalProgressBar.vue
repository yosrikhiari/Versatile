<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentWords: {
    type: Number,
    default: 0
  },
  goalWords: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['open-settings'])

const progressPercent = computed(() => {
  if (props.goalWords <= 0) return 0
  return Math.min((props.currentWords / props.goalWords) * 100, 100)
})

const goalReached = computed(() => {
  return props.goalWords > 0 && props.currentWords >= props.goalWords
})
</script>

<template>
  <div class="flex items-center gap-2">
    <div 
      v-if="goalWords > 0"
      class="w-20 h-1 bg-bg-tertiary rounded-full overflow-hidden"
    >
      <div 
        class="h-full transition-all duration-300 rounded-full"
        :class="goalReached ? 'bg-gradient-to-r from-success to-green-400 glow-progress' : 'bg-gradient-to-r from-accent/70 to-accent'"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>
    <span 
      v-if="goalWords > 0"
      class="text-[10px] tabular-nums"
      :class="goalReached ? 'text-green-400/80' : 'text-text-hint/70'"
    >
      {{ currentWords.toLocaleString() }} / {{ goalWords.toLocaleString() }}
    </span>
    <button 
      v-else
      class="text-[10px] text-text-hint/50 hover:text-accent transition-colors duration-150 btn-ghost"
      @click="emit('open-settings')"
    >
      Set a goal
    </button>
  </div>
</template>