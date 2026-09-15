<script setup>
/**
 * What is arriving while the planner runs: the cast and places as the model
 * names them, then the scenes as they are planned. The stage list above this
 * (GenerationStages) already says where the run is and what it is doing, so
 * this block no longer repeats it in a second vocabulary at 18 px.
 */
import { computed } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  phase: {
    type: String,
    default: ''
  },
  progress: {
    type: Object,
    default: () => ({})
  },
  streamedEntities: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['cancel'])

const cast = computed(() =>
  props.streamedEntities.filter((e) => e.type === 'character' || e.type === 'location')
)
const scenes = computed(() => props.streamedEntities.filter((e) => e.type === 'scene'))
const nothingYet = computed(() => cast.value.length === 0 && scenes.value.length === 0)
</script>

<template>
  <div class="w-full text-left font-ui" role="status" aria-live="polite">
    <div v-if="nothingYet" class="flex items-center gap-2 text-xs text-text-hint">
      <BaseIcon name="loader-2" :size="14" class="animate-spin text-accent" />
      Waiting for the model…
    </div>

    <div v-if="cast.length" class="space-y-2">
      <span class="label-micro text-text-hint">Cast and places</span>
      <div class="flex flex-wrap gap-1.5">
        <TransitionGroup name="fade-stagger">
          <span
            v-for="(entity, idx) in cast"
            :key="entity.id"
            class="px-2 py-0.5 text-xs rounded-sm border border-border-subtle bg-bg-secondary text-text-primary"
            :style="{ animationDelay: `${(idx % 10) * 100}ms` }"
          >
            {{ entity.name }}
          </span>
        </TransitionGroup>
      </div>
    </div>

    <div v-if="scenes.length" class="space-y-2" :class="cast.length ? 'mt-4' : ''">
      <span class="label-micro text-text-hint">Scenes planned</span>
      <div class="flex flex-wrap gap-1.5">
        <TransitionGroup name="fade-stagger">
          <span
            v-for="(entity, idx) in scenes"
            :key="entity.id"
            class="px-2 py-0.5 text-xs rounded-sm border border-border-subtle bg-bg-secondary text-text-primary"
            :style="{ animationDelay: `${idx * 50}ms` }"
          >
            {{ entity.name }}
          </span>
        </TransitionGroup>
      </div>
    </div>

    <div class="mt-6">
      <BaseButton variant="ghost" size="sm" @click="emit('cancel')">Stop this run</BaseButton>
    </div>
  </div>
</template>

<style scoped>
.fade-stagger-enter-active {
  animation: fade-in-up 0.3s ease-out both;
}
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fade-stagger-enter-active {
    animation: none;
  }
}
</style>
