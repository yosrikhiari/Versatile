<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

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
      class="w-20 h-1.5 bg-bg-tertiary rounded-full overflow-hidden"
    >
      <div 
        class="h-full transition-all duration-300 rounded-full"
        :class="goalReached ? 'bg-green-500' : 'bg-accent'"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>
    <span 
      v-if="goalWords > 0"
      class="text-[10px]"
      :class="goalReached ? 'text-green-400' : 'text-text-muted'"
    >
      {{ currentWords.toLocaleString() }} / {{ goalWords.toLocaleString() }}
    </span>
    <button 
      v-else
      class="text-[10px] text-text-hint hover:text-accent transition-colors"
      @click="emit('open-settings')"
    >
      Set a goal
    </button>
  </div>
</template>