<script setup>
/**
 * The book-analysis bar (WHATIF-AND-IMPORT-PLAN.md, step 3): offers to read an
 * imported book that has not been read yet, shows progress while it runs
 * (scene N of M, time left, Stop), and says what it filled in when done. A
 * hand-written book can start the same run from Ctrl+K ("Understand this book").
 */
import { ref, computed, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import { useProjectStore } from '../../stores/projectStore'
import { getProject } from '../../services/db-projects'
import { useBookAnalysis, bookAnalysisState } from '../../composables/useBookAnalysis'

const projectStore = useProjectStore()
const { run, stop } = useBookAnalysis()
const project = ref(null)
const dismissed = ref(false)
const state = bookAnalysisState

const PHASE_LABEL = {
  reading: 'Reading the book',
  resolving: 'Matching names',
  linking: 'Filling the story bible and network',
  profiling: 'Describing the book'
}

async function refresh() {
  const id = projectStore.currentProjectId
  project.value = id ? await getProject(id) : null
}
watch(() => projectStore.currentProjectId, refresh, { immediate: true })
watch(
  () => state.phase,
  (p) => {
    if (p === 'done') refresh()
  }
)

const mine = computed(() => String(state.projectId) === String(projectStore.currentProjectId))
const running = computed(
  () => mine.value && ['reading', 'resolving', 'linking', 'profiling'].includes(state.phase)
)
const offer = computed(
  () =>
    !running.value &&
    project.value?.source === 'import' &&
    project.value?.analysis?.status !== 'done' &&
    !(mine.value && state.phase === 'done')
)
const finished = computed(() => mine.value && state.phase === 'done' && state.summary)
const visible = computed(
  () =>
    !dismissed.value &&
    (running.value || offer.value || finished.value || (mine.value && state.phase === 'failed'))
)
const minutesLeft = computed(() => {
  const left = Math.max(0, state.total - state.done)
  return state.secondsPerScene ? Math.max(1, Math.round((left * state.secondsPerScene) / 60)) : null
})

function start() {
  dismissed.value = false
  run(projectStore.currentProjectId).catch(() => {})
}
</script>

<template>
  <div
    v-if="visible"
    class="glass px-4 py-2 flex flex-wrap items-center justify-between gap-2"
    data-test="book-analysis"
    role="status"
  >
    <div class="flex min-w-0 items-center gap-2 font-ui text-sm text-text-secondary">
      <BaseIcon name="book-open" :size="14" class="shrink-0 text-text-hint" />
      <span v-if="running" class="min-w-0 truncate">
        {{ PHASE_LABEL[state.phase] }}
        <template v-if="state.phase === 'reading'">
          · scene <span class="tabular-nums">{{ state.done }}</span> of
          <span class="tabular-nums">{{ state.total }}</span>
          <template v-if="minutesLeft"> · about {{ minutesLeft }} min left</template>
        </template>
        <span v-if="state.current" class="text-text-hint"> · {{ state.current }}</span>
      </span>
      <span v-else-if="finished">
        Book read: {{ state.summary.characters }} characters, {{ state.summary.locations }} places
        and {{ state.summary.edges }} links are in the story bible and network.
        <template v-if="state.failed">
          {{ state.failed }} scene{{ state.failed === 1 ? '' : 's' }} could not be read.
        </template>
      </span>
      <span v-else-if="mine && state.phase === 'failed'" class="text-danger">
        Reading the book stopped: {{ state.error }}
      </span>
      <span v-else>
        Versatile has not read this book yet. Reading it fills the story bible, the network and the
        scene summaries that What If and the other tools work from. It runs on your own machine, and
        you can stop it and carry on later.
      </span>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <BaseButton v-if="running" variant="ghost" size="sm" data-test="stop-analysis" @click="stop">
        Stop
      </BaseButton>
      <BaseButton
        v-else-if="offer || (mine && state.phase === 'failed')"
        variant="primary"
        size="sm"
        data-test="start-analysis"
        @click="start"
      >
        {{
          mine && ['stopped', 'failed'].includes(state.phase) ? 'Continue reading' : 'Read the book'
        }}
      </BaseButton>
      <BaseButton
        v-if="!running"
        variant="ghost"
        size="sm"
        icon="x"
        aria-label="Dismiss"
        @click="dismissed = true"
      />
    </div>
  </div>
</template>
