<script setup>
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import BaseIcon from '../shared/BaseIcon.vue'
import EvalPanel from '../eval/EvalPanel.vue'
import RevisionDeltaPanel from '../eval/RevisionDeltaPanel.vue'
import EvalDashboard from '../eval/EvalDashboard.vue'

defineOptions({ name: 'VolumeCompletePanel' })

const props = defineProps({
  volumeGenerator: { type: Object, required: true },
  sceneEval: { type: Object, required: true },
  saveStatus: { default: null }
})

const emit = defineEmits([
  'regenerate',
  'evaluate',
  'revise',
  'accept-revision',
  'reset',
  'save',
  'export-txt',
  'export-md',
  'open-chapters',
  'open-consistency',
  'open-read'
])

const projectStore = useProjectStore()

const selectedSceneIndex = ref(-1)
const showDashboard = ref(false)

const volumeTotalConsistencyIssues = computed(() => {
  const report = props.volumeGenerator.consistencyReport.value
  if (!report) return 0
  return (report.characterIssues?.length || 0) + (report.locationIssues?.length || 0)
})

const qualityGrade = computed(() => {
  const n = volumeTotalConsistencyIssues.value
  if (n === 0) return 'good'
  if (n <= 3) return 'fair'
  return 'poor'
})

const totalCharacterIssues = computed(
  () => props.volumeGenerator.consistencyReport.value?.characterIssues?.length || 0
)
const totalLocationIssues = computed(
  () => props.volumeGenerator.consistencyReport.value?.locationIssues?.length || 0
)

const totalWordsWritten = computed(() =>
  props.volumeGenerator.writtenScenes.value.reduce(
    (sum, s) => sum + (s.prose?.split(/\s+/).length || 0),
    0
  )
)
</script>

<template>
  <div class="p-4 space-y-4">
    <!-- Scene list header with inline stats -->
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-xs uppercase tracking-widest text-text-hint font-ui">
        Scenes ({{ volumeGenerator.writtenScenes.value.length }})
        <span class="font-normal tracking-normal text-text-hint/60"
          >· {{ totalWordsWritten.toLocaleString() }} words</span
        >
      </h3>
      <div class="flex items-center gap-1.5">
        <div v-if="volumeTotalConsistencyIssues > 0">
          <button
            class="text-2xs text-warning font-ui flex items-center gap-1 hover:text-warning focus:outline-none focus:ring-1 focus:ring-accent rounded"
            @click="emit('open-consistency')"
          >
            <BaseIcon name="alert-triangle" :size="10" />
            {{ volumeTotalConsistencyIssues }}
          </button>
        </div>
        <div v-else class="text-2xs text-success font-ui flex items-center gap-1">
          <BaseIcon name="check-circle" :size="10" />
          ok
        </div>
      </div>
    </div>

    <!-- Quality summary card -->
    <div
      v-if="volumeGenerator.consistencyReport.value"
      class="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border-subtle bg-bg-secondary"
    >
      <div class="flex items-center gap-2">
        <BaseIcon
          :name="qualityGrade === 'good' ? 'check-circle' : 'alert-triangle'"
          :size="14"
          :class="
            qualityGrade === 'good'
              ? 'text-success'
              : qualityGrade === 'fair'
                ? 'text-warning'
                : 'text-danger'
          "
        />
        <span class="text-xs font-ui text-text-secondary">
          Quality:
          <span
            :class="
              qualityGrade === 'good'
                ? 'text-success'
                : qualityGrade === 'fair'
                  ? 'text-warning'
                  : 'text-danger'
            "
            >{{ qualityGrade }}</span
          >
        </span>
      </div>
      <div class="flex gap-3 text-2xs text-text-hint">
        <span>{{ totalCharacterIssues }} character issues</span>
        <span>{{ totalLocationIssues }} location issues</span>
      </div>
    </div>

    <!-- Story-level eval aggregate summary -->
    <div class="rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-2xs uppercase tracking-wider text-text-hint font-ui">Evaluations</span>
        <div class="flex items-center gap-2">
          <div class="flex gap-3 text-2xs text-text-hint">
            <span
              >{{ sceneEval.aggregateStats.value?.evaluatedCount || 0 }} /
              {{ sceneEval.aggregateStats.value?.totalScenes || 0 }} scenes</span
            >
            <span
              v-if="sceneEval.aggregateStats.value?.averageScore !== null"
              class="text-info"
            >
              Avg: {{ sceneEval.aggregateStats.value?.averageScore }}
            </span>
            <span
              v-if="sceneEval.aggregateStats.value?.totalRegressions > 0"
              class="text-warning"
            >
              {{ sceneEval.aggregateStats.value?.totalRegressions }} regressions
            </span>
          </div>
          <button
            class="text-2xs text-accent font-ui hover:text-accent focus:outline-none focus:ring-1 focus:ring-accent rounded px-1.5 py-0.5"
            @click="showDashboard = !showDashboard"
          >
            {{ showDashboard ? 'Hide' : 'Dashboard' }}
          </button>
        </div>
      </div>
      <EvalDashboard
        v-if="showDashboard"
        :scene-results-map="sceneEval.sceneResultsMap.value"
        :gate-results="sceneEval.gateResults.value"
        :workspace-type="projectStore.activeWorkspaceType || 'creative'"
        :focus-instructions="sceneEval.focusInstructions.value"
        :past-eval-results="sceneEval.pastEvalResults.value"
        class="mt-2 border-t border-border-subtle pt-2"
      />
    </div>

    <!-- Scene list -->
    <div class="rounded-lg border border-border-subtle overflow-hidden">
      <div
        v-for="(scene, i) in volumeGenerator.writtenScenes.value"
        :key="i"
        class="px-3 py-2.5 border-b border-border-subtle last:border-b-0 cursor-pointer transition-colors hover:bg-surface-hover"
        :class="
          i === selectedSceneIndex
            ? 'border-l-2 border-accent bg-bg-secondary'
            : 'border-l-2 border-transparent'
        "
        @click="selectedSceneIndex = i"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-semibold text-text-primary font-ui truncate"
            >Scene {{ i + 1 }}: {{ scene.title }}</span
          >
          <span class="text-2xs text-text-hint/60 font-ui whitespace-nowrap"
            >{{ scene.prose.split(/\s+/).length }} words</span
          >
        </div>
      </div>
    </div>

    <!-- Selected scene actions -->
    <div v-if="selectedSceneIndex >= 0" class="space-y-2">
      <div class="flex gap-1.5">
        <button
          class="flex-1 py-1.5 px-2 bg-bg-secondary text-warning rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5"
          @click="emit('regenerate', selectedSceneIndex)"
        >
          <BaseIcon name="refresh-cw" :size="12" /> Re-generate Scene
          {{ selectedSceneIndex + 1 }}
        </button>
        <button
          class="flex-1 py-1.5 px-2 bg-bg-secondary text-accent rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
          :disabled="
            sceneEval.isEvaluating.value ||
            !volumeGenerator.writtenScenes.value?.[selectedSceneIndex]?.prose
          "
          @click="emit('evaluate', selectedSceneIndex)"
        >
          <BaseIcon :name="sceneEval.isEvaluating.value ? 'loader' : 'check-circle'" :size="12" />
          {{
            sceneEval.isEvaluating.value
              ? 'Evaluating...'
              : sceneEval.hasBeenEvaluated.value
                ? 'Re-evaluate'
                : 'Evaluate'
          }}
        </button>
      </div>

      <div
        v-if="sceneEval.hasBeenEvaluated.value || sceneEval.isEvaluating.value"
        class="space-y-2 border border-border-subtle rounded-lg p-3 bg-bg-secondary"
      >
        <EvalPanel
          :critique-result="sceneEval.critiqueResult.value"
          :gate-results="sceneEval.gateResults.value"
          :eval-gates="{
            dimensionCoverage: sceneEval.gateResults.value?.dimensionCoverage,
            scoreDistribution: sceneEval.gateResults.value?.scoreDistribution,
            revisionEffectiveness: sceneEval.gateResults.value?.revisionEffectiveness
          }"
          :workspace-type="projectStore.activeWorkspaceType || 'creative'"
          :compact="true"
        />

        <div v-if="sceneEval.hasBeenEvaluated.value" class="flex gap-1.5">
          <button
            class="flex-1 py-1 px-2 bg-bg-secondary text-info rounded-md text-11px font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
            :disabled="sceneEval.isRevising.value || !sceneEval.critiqueResult.value"
            @click="emit('revise', selectedSceneIndex)"
          >
            <BaseIcon :name="sceneEval.isRevising.value ? 'loader' : 'refresh-cw'" :size="11" />
            {{ sceneEval.isRevising.value ? 'Revising...' : 'Apply Revision' }}
          </button>
          <button
            v-if="sceneEval.revisionResult.value"
            class="flex-1 py-1 px-2 bg-bg-secondary text-success rounded-md text-11px font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5"
            @click="emit('accept-revision')"
          >
            <BaseIcon name="check" :size="11" /> Accept Revision
          </button>
        </div>

        <RevisionDeltaPanel :revision-result="sceneEval.revisionResult.value" :compact="true" />
      </div>
    </div>

    <!-- Primary action -->
    <button
      class="w-full py-2.5 btn-primary rounded-lg font-ui focus:outline-none focus:ring-2 focus:ring-accent"
      @click="emit('reset')"
    >
      <span class="flex items-center justify-center gap-2"
        ><BaseIcon name="plus" :size="16" /> Generate Another</span
      >
    </button>

    <!-- Secondary actions -->
    <div class="flex gap-1.5">
      <button
        class="flex-1 py-1.5 px-2 bg-bg-tertiary text-text-secondary rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5"
        @click="emit('open-read')"
      >
        <BaseIcon name="book-open" :size="12" /> Read
      </button>
      <div class="relative flex-1">
        <button
          class="w-full py-1.5 px-2 bg-bg-tertiary text-text-secondary rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5"
          @click="emit('save')"
        >
          <BaseIcon name="save" :size="12" /> Save
        </button>
        <span
          v-if="saveStatus"
          class="absolute -top-2 right-0 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
          :class="
            saveStatus.type === 'saving'
              ? 'bg-accent text-bg-primary'
              : 'bg-bg-secondary text-success'
          "
          >{{ saveStatus.message }}</span
        >
      </div>
      <button
        class="flex-1 py-1.5 px-2 bg-bg-tertiary text-text-secondary rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5"
        @click="emit('open-chapters')"
      >
        <BaseIcon name="list" :size="12" /> Chapters
      </button>
    </div>

    <!-- Tertiary / Export actions -->
    <div class="flex gap-1.5">
      <button
        class="flex-1 py-1 px-2 bg-transparent text-text-hint rounded text-2xs font-medium hover:text-text-secondary hover:bg-bg-tertiary transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1"
        @click="emit('export-txt')"
      >
        <BaseIcon name="file-text" :size="10" /> .txt
      </button>
      <button
        class="flex-1 py-1 px-2 bg-transparent text-text-hint rounded text-2xs font-medium hover:text-text-secondary hover:bg-bg-tertiary transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1"
        @click="emit('export-md')"
      >
        <BaseIcon name="file-down" :size="10" /> .md
      </button>
    </div>
  </div>
</template>
