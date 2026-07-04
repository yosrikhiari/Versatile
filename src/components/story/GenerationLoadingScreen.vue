<script setup>
import { computed } from 'vue'
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

const currentStep = computed(() => {
  if (props.phase === 'bootstrapping' || props.phase === 'planning') {
    return props.progress.current || 1
  }
  return 5 // complete
})

// Filter entities to only characters and locations for Step 2
const step2Entities = computed(() => {
  return props.streamedEntities.filter((e) => e.type === 'character' || e.type === 'location')
})

// Filter entities to scenes for Step 3 cascade
const step3Entities = computed(() => {
  return props.streamedEntities.filter((e) => e.type === 'scene')
})

function getState(stepNumber) {
  if (currentStep.value > stepNumber) return 'complete'
  if (currentStep.value === stepNumber) return 'active'
  return 'pending'
}

const stages = [
  { id: 1, label: 'Creating Volume Archive' },
  { id: 2, label: 'Conjuring Characters & World' },
  { id: 3, label: 'Forging the Story Graph' },
  { id: 4, label: 'Sealing the Arc Contract' }
]
</script>

<template>
  <div
    class="flex flex-col items-center justify-center min-h-[400px] w-full max-w-2xl mx-auto font-ui text-text-primary"
  >
    <!-- Stage List -->
    <div class="space-y-6 w-full max-w-md">
      <div v-for="stage in stages" :key="stage.id" class="flex flex-col">
        <div class="flex items-center gap-4">
          <!-- Icon State -->
          <div class="w-6 h-6 flex items-center justify-center shrink-0">
            <BaseIcon
              v-if="getState(stage.id) === 'complete'"
              name="check"
              :size="20"
              class="text-accent fade-in"
            />
            <BaseIcon
              v-else-if="getState(stage.id) === 'active'"
              name="loader-2"
              :size="20"
              class="text-accent animate-spin-slow pulse-glow"
            />
            <BaseIcon v-else name="circle" :size="16" class="text-text-hint opacity-50" />
          </div>

          <!-- Label State -->
          <span
            :class="[
              'text-lg font-serif transition-all duration-500',
              getState(stage.id) === 'active'
                ? 'text-text-primary drop-shadow-glow'
                : getState(stage.id) === 'complete'
                  ? 'text-text-secondary opacity-80'
                  : 'text-text-hint opacity-50'
            ]"
          >
            {{ stage.label }}
          </span>
        </div>

        <!-- Step 2 Content Stream (Conjuring Characters & World) -->
        <div
          v-if="stage.id === 2 && currentStep >= 2"
          class="pl-10 mt-3 flex flex-wrap gap-2 min-h-[32px]"
        >
          <TransitionGroup name="fade-stagger">
            <div
              v-for="(entity, idx) in step2Entities"
              :key="entity.id"
              class="px-2.5 py-1 text-xs rounded-full bg-bg-secondary border border-border-subtle text-accent/90"
              :style="{ animationDelay: `${(idx % 10) * 100}ms` }"
            >
              {{ entity.name }}
            </div>
          </TransitionGroup>
          <div
            v-if="getState(2) === 'active'"
            class="text-xs text-text-hint italic py-1 opacity-50 fade-in-slow"
          >
            Waiting for the ether...
          </div>
        </div>

        <!-- Step 3 Content Cascade (Forging the Story Graph) -->
        <div
          v-if="stage.id === 3 && currentStep >= 3"
          class="pl-10 mt-3 flex flex-wrap gap-2 min-h-[32px]"
        >
          <TransitionGroup name="fade-stagger">
            <div
              v-for="(entity, idx) in step3Entities"
              :key="entity.id"
              class="px-2.5 py-1 text-xs rounded border border-accent/20 bg-accent/5 text-accent"
              :style="{ animationDelay: `${idx * 50}ms` }"
            >
              {{ entity.name }}
            </div>
          </TransitionGroup>
        </div>
      </div>
    </div>

    <!-- Abandon Button -->
    <div class="mt-12">
      <button
        class="text-xs text-text-hint hover:text-text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-accent rounded px-3 py-2 bg-transparent"
        @click="emit('cancel')"
      >
        [ Abandon Conjuration ]
      </button>
    </div>
  </div>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 3s linear infinite;
}

.pulse-glow {
  filter: drop-shadow(0 0 4px rgba(var(--vers-glow-loading-rgb), 0.6));
  animation:
    spin 3s linear infinite,
    pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.drop-shadow-glow {
  filter: drop-shadow(0 0 8px rgba(var(--vers-glow-loading-rgb), 0.3));
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.fade-in {
  animation: fadeIn 0.5s ease-out forwards;
}

.fade-in-slow {
  animation: fadeIn 2s ease-in forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-stagger-enter-active {
  animation: fadeIn 0.4s ease-out both;
}

.fade-stagger-leave-active {
  transition: all 0.3s;
}

.fade-stagger-enter-from,
.fade-stagger-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
