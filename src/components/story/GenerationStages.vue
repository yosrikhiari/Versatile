<script setup>
import { computed } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

/**
 * The pipeline's progress as a list of completed and remaining steps.
 *
 * A volume takes minutes on a local model. Nielsen Norman Group's guidance is
 * that any wait over ~10s needs percent-done or time-remaining — and that when
 * accurate estimates are impossible, the sanctioned alternative is exactly this:
 * "indicate relative progress by providing a list of completed and remaining
 * steps". Token generation cannot be estimated honestly, so a percentage across
 * the whole pipeline would be invented. This is the honest form.
 *
 * The scene counter inside "Writing scenes" IS honest (scenes done / planned),
 * so it stays — it just belongs to one step rather than standing in for all of
 * them.
 *
 * Stage -> phase mapping is derived from the delegator's ROUTING_TABLE
 * (generation/delegator/Delegator.js). Keep it in sync with that table: a phase
 * missing here renders as no active step, which reads as a stall.
 */
const props = defineProps({
  /** Current delegator phase. */
  phase: { type: String, required: true },
  /** Scenes finished so far (for the writing step's detail line). */
  currentScene: { type: Number, default: 0 },
  /** Scenes planned in total. */
  totalScenes: { type: Number, default: 0 },
  /** Free-text detail from the generator, shown under the active step. */
  statusText: { type: String, default: '' }
})

const STAGES = [
  {
    key: 'prepare',
    label: 'Preparing story elements',
    phases: ['volume-creating', 'bootstrapping']
  },
  { key: 'plan', label: 'Planning chapters', phases: ['planning', 'plan-preview'] },
  { key: 'spine', label: 'Building the story spine', phases: ['spine-generation'] },
  { key: 'write', label: 'Writing scenes', phases: ['writing', 'scene-review', 'sync-preview'] },
  {
    key: 'continuity',
    label: 'Checking continuity',
    phases: ['repairing', 'consistency-check', 'consistency-fix']
  },
  { key: 'save', label: 'Saving', phases: ['committing'] }
]

const activeIndex = computed(() => STAGES.findIndex((s) => s.phases.includes(props.phase)))
const isComplete = computed(() => props.phase === 'complete')
const isError = computed(() => props.phase === 'error')

function statusOf(index) {
  if (isComplete.value) return 'done'
  const active = activeIndex.value
  // An unmapped phase (or idle) means nothing is active; showing every step as
  // pending is more honest than guessing which one we are in.
  if (active === -1) return 'pending'
  if (index < active) return 'done'
  if (index === active) return 'current'
  return 'pending'
}

/** Only the writing step has a real count to report. */
function detailOf(stage, status) {
  if (status !== 'current') return ''
  if (stage.key === 'write' && props.totalScenes > 0) {
    return `Scene ${props.currentScene} of ${props.totalScenes}`
  }
  return props.statusText
}
</script>

<template>
  <ol v-if="!isError" class="space-y-0.5" aria-label="Generation progress">
    <li
      v-for="(stage, i) in STAGES"
      :key="stage.key"
      class="stage-row flex items-start gap-2.5 py-1"
      :style="{ animationDelay: `${i * 60}ms` }"
      :aria-current="statusOf(i) === 'current' ? 'step' : undefined"
    >
      <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <BaseIcon
          v-if="statusOf(i) === 'done'"
          name="check"
          :size="12"
          class="text-accent"
          aria-hidden="true"
        />
        <BaseIcon
          v-else-if="statusOf(i) === 'current'"
          name="loader-2"
          :size="12"
          class="animate-spin text-accent"
          aria-hidden="true"
        />
        <span v-else class="h-1 w-1 rounded-full bg-border-subtle" aria-hidden="true"></span>
      </span>

      <span class="min-w-0 flex-1">
        <span
          class="block text-xs font-ui leading-5"
          :class="{
            'text-text-hint': statusOf(i) === 'pending',
            'text-text-secondary': statusOf(i) === 'done',
            'text-text-primary': statusOf(i) === 'current'
          }"
        >
          {{ stage.label }}
          <span class="sr-only">
            —
            {{
              statusOf(i) === 'done'
                ? 'done'
                : statusOf(i) === 'current'
                  ? 'in progress'
                  : 'not started'
            }}
          </span>
        </span>
        <span
          v-if="detailOf(stage, statusOf(i))"
          class="block text-11px text-text-hint font-ui tabular-nums leading-4"
        >
          {{ detailOf(stage, statusOf(i)) }}
        </span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
/* Split and staggered rather than one container fade. Runs once on mount, so a
   keyframe is right here; interactive state changes below use transitions. */
.stage-row {
  animation: stage-in 220ms cubic-bezier(0.2, 0, 0, 1) both;
}

@keyframes stage-in {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage-row {
    animation: none;
  }
}
</style>
