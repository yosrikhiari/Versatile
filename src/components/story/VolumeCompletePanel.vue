<script setup>
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSection from '../ui/BaseSection.vue'
import EvalPanel from '../eval/EvalPanel.vue'
import RevisionDeltaPanel from '../eval/RevisionDeltaPanel.vue'
import EvalDashboard from '../eval/EvalDashboard.vue'

defineOptions({ name: 'VolumeCompletePanel' })

const props = defineProps({
  volumeGenerator: { type: Object, required: true },
  sceneEval: { type: Object, required: true },
  saveStatus: { type: Object, default: null }
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

const totalCharacterIssues = computed(
  () => props.volumeGenerator.consistencyReport.value?.characterIssues?.length || 0
)
const totalLocationIssues = computed(
  () => props.volumeGenerator.consistencyReport.value?.locationIssues?.length || 0
)

function wordCount(prose) {
  const t = (prose || '').trim()
  return t ? t.split(/\s+/).length : 0
}

const totalWordsWritten = computed(() =>
  props.volumeGenerator.writtenScenes.value.reduce((sum, s) => sum + wordCount(s.prose), 0)
)
</script>

<template>
  <div>
    <!-- ── Summary ──────────────────────────────────────────────────────── -->
    <BaseSection
      first
      title="Draft complete"
      :description="`${volumeGenerator.writtenScenes.value.length} scenes · ${totalWordsWritten.toLocaleString()} words written into the manuscript.`"
    >
      <template #actions>
        <BaseButton variant="primary" size="sm" icon="plus" @click="emit('reset')">
          Generate another
        </BaseButton>
      </template>

      <!-- Three actions on the result, one row, no colour. -->
      <div class="flex flex-wrap items-center gap-2">
        <BaseButton variant="secondary" size="sm" icon="book-open" @click="emit('open-read')">
          Read
        </BaseButton>
        <div class="relative">
          <BaseButton variant="secondary" size="sm" icon="save" @click="emit('save')"
            >Save</BaseButton
          >
          <span
            v-if="saveStatus"
            class="absolute -top-2 -right-1 font-ui text-2xs px-1.5 py-0.5 rounded-sm whitespace-nowrap border border-border-subtle bg-bg-secondary"
            :class="saveStatus.type === 'saving' ? 'text-text-hint' : 'text-success'"
            >{{ saveStatus.message }}</span
          >
        </div>
        <BaseButton variant="secondary" size="sm" icon="list" @click="emit('open-chapters')">
          Chapters
        </BaseButton>
        <span class="flex-1"></span>
        <BaseButton variant="ghost" size="sm" icon="file-text" @click="emit('export-txt')"
          >.txt</BaseButton
        >
        <BaseButton variant="ghost" size="sm" icon="file-down" @click="emit('export-md')"
          >.md</BaseButton
        >
      </div>
    </BaseSection>

    <!-- ── Quality ──────────────────────────────────────────────────────── -->
    <BaseSection
      title="Quality"
      description="Continuity against the story bible, and the critic's verdicts where scenes were evaluated."
      dense
    >
      <dl class="grid grid-cols-3 gap-x-4">
        <div>
          <dt class="label-micro text-text-hint mb-1">Continuity</dt>
          <dd class="font-ui text-sm text-text-primary">
            <button
              v-if="volumeTotalConsistencyIssues > 0"
              type="button"
              class="inline-flex items-center gap-1.5 text-warning hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              @click="emit('open-consistency')"
            >
              <BaseIcon name="alert-triangle" :size="12" />
              {{ volumeTotalConsistencyIssues }} issue{{
                volumeTotalConsistencyIssues === 1 ? '' : 's'
              }}
            </button>
            <span
              v-else-if="volumeGenerator.consistencyReport.value"
              class="inline-flex items-center gap-1.5 text-success"
            >
              <BaseIcon name="check-circle" :size="12" /> Clean
            </span>
            <span v-else class="text-text-hint">Not checked</span>
          </dd>
        </div>
        <div>
          <dt class="label-micro text-text-hint mb-1">Evaluated</dt>
          <dd class="font-ui text-sm text-text-primary tabular-nums">
            {{ sceneEval.aggregateStats.value?.evaluatedCount || 0 }} /
            {{
              sceneEval.aggregateStats.value?.totalScenes ||
              volumeGenerator.writtenScenes.value.length
            }}
          </dd>
        </div>
        <div>
          <dt class="label-micro text-text-hint mb-1">Average score</dt>
          <dd class="font-ui text-sm text-text-primary tabular-nums">
            <template v-if="sceneEval.aggregateStats.value?.averageScore != null">
              {{ sceneEval.aggregateStats.value.averageScore }}
              <span
                v-if="sceneEval.aggregateStats.value?.totalRegressions > 0"
                class="text-warning text-xs"
              >
                · {{ sceneEval.aggregateStats.value.totalRegressions }} regressed
              </span>
            </template>
            <span v-else class="text-text-hint">—</span>
          </dd>
        </div>
      </dl>
      <p
        v-if="volumeGenerator.consistencyReport.value && volumeTotalConsistencyIssues > 0"
        class="mt-2 font-ui text-xs text-text-hint"
      >
        {{ totalCharacterIssues }} character · {{ totalLocationIssues }} location
      </p>
      <div class="mt-3">
        <button
          type="button"
          class="flex items-center gap-1.5 label-micro text-text-hint hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          :aria-expanded="showDashboard"
          @click="showDashboard = !showDashboard"
        >
          <BaseIcon
            name="chevron-right"
            :size="12"
            class="transition-transform duration-150"
            :class="showDashboard ? 'rotate-90' : ''"
          />
          Evaluation dashboard
        </button>
        <EvalDashboard
          v-if="showDashboard"
          :scene-results-map="sceneEval.sceneResultsMap.value"
          :gate-results="sceneEval.gateResults.value"
          :workspace-type="projectStore.activeWorkspaceType || 'creative'"
          :focus-instructions="sceneEval.focusInstructions.value"
          :past-eval-results="sceneEval.pastEvalResults.value"
          class="mt-3"
        />
      </div>
    </BaseSection>

    <!-- ── Scenes ───────────────────────────────────────────────────────── -->
    <BaseSection
      title="Scenes"
      description="Pick a scene to regenerate it, or run the critic on it."
      :meta="`${volumeGenerator.writtenScenes.value.length}`"
      dense
    >
      <ul class="-mx-1 divide-y divide-border-subtle" role="listbox" aria-label="Written scenes">
        <li
          v-for="(scene, i) in volumeGenerator.writtenScenes.value"
          :key="i"
          role="option"
          :aria-selected="i === selectedSceneIndex"
          tabindex="0"
          class="flex items-center gap-3 px-2 py-2 cursor-pointer rounded-md transition-colors duration-150 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          :class="
            i === selectedSceneIndex
              ? 'bg-surface-hover shadow-[inset_2px_0_0_0_rgb(var(--vers-accent-primary-rgb))]'
              : ''
          "
          @click="selectedSceneIndex = i"
          @keydown.enter.space.prevent="selectedSceneIndex = i"
        >
          <span class="font-ui text-xs text-text-hint tabular-nums w-5 shrink-0">{{ i + 1 }}</span>
          <span class="flex-1 min-w-0 font-ui text-sm text-text-primary truncate">{{
            scene.title
          }}</span>
          <span class="font-ui text-xs text-text-hint tabular-nums shrink-0"
            >{{ wordCount(scene.prose).toLocaleString() }} w</span
          >
        </li>
      </ul>

      <!-- Selected scene -->
      <div v-if="selectedSceneIndex >= 0" class="mt-3 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            icon="refresh-cw"
            @click="emit('regenerate', selectedSceneIndex)"
          >
            Regenerate scene {{ selectedSceneIndex + 1 }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            icon="check-circle"
            :loading="sceneEval.isEvaluating.value"
            :disabled="
              sceneEval.isEvaluating.value ||
              !volumeGenerator.writtenScenes.value?.[selectedSceneIndex]?.prose
            "
            @click="emit('evaluate', selectedSceneIndex)"
          >
            {{
              sceneEval.isEvaluating.value
                ? 'Evaluating'
                : sceneEval.hasBeenEvaluated.value
                  ? 'Re-evaluate'
                  : 'Evaluate'
            }}
          </BaseButton>
        </div>

        <div
          v-if="sceneEval.hasBeenEvaluated.value || sceneEval.isEvaluating.value"
          class="space-y-3 border-t border-border-subtle pt-3"
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

          <div v-if="sceneEval.hasBeenEvaluated.value" class="flex flex-wrap items-center gap-2">
            <BaseButton
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              :loading="sceneEval.isRevising.value"
              :disabled="sceneEval.isRevising.value || !sceneEval.critiqueResult.value"
              @click="emit('revise', selectedSceneIndex)"
            >
              {{ sceneEval.isRevising.value ? 'Revising' : 'Apply revision' }}
            </BaseButton>
            <BaseButton
              v-if="sceneEval.revisionResult.value"
              variant="primary"
              size="sm"
              icon="check"
              @click="emit('accept-revision')"
            >
              Accept revision
            </BaseButton>
          </div>

          <RevisionDeltaPanel :revision-result="sceneEval.revisionResult.value" :compact="true" />
        </div>
      </div>
    </BaseSection>
  </div>
</template>
