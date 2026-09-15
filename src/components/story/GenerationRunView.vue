<script setup>
import BaseIcon from '../shared/BaseIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseAlert from '../ui/BaseAlert.vue'
import GenerationSyncPreview from './GenerationSyncPreview.vue'
import GenerationLoadingScreen from './GenerationLoadingScreen.vue'
import GenerationStages from './GenerationStages.vue'
import VolumeCompletePanel from './VolumeCompletePanel.vue'
import VolumeSceneReview from './VolumeSceneReview.vue'
import VolumePlanPreview from './VolumePlanPreview.vue'
import ChapterGateReport from './ChapterGateReport.vue'

/**
 * The phases every generation run goes through, from the first error screen
 * to the complete panel. Driven entirely by a `useGenerationRunController`
 * instance, so the chapter and arc pipelines share one implementation while
 * keeping separate state.
 */
const props = defineProps({
  /** A `useGenerationRunController(...)` instance. */
  run: { type: Object, required: true },
  sceneEval: { type: Object, required: true },
  saveStatus: { type: Object, default: null },
  /** "Chapter" / "Arc" / "Scene" — shown in the plan preview. */
  planLabel: { type: String, default: 'Arc' },
  failedTitle: { type: String, default: 'Generation failed' },
  /** Prefix for data-test hooks ("chapter" → data-test="chapter-error"). */
  testPrefix: { type: String, default: '' },
  /** The chapter pipeline shows its gate report beside the complete panel. */
  gateReport: { type: Object, default: null },
  consistencyHint: { type: String, default: 'Comparing character and location depictions' },
  /** Inputs `confirmPlan` hands back to the generator. */
  planContext: { type: Object, default: () => ({ synopsis: '', sparkContext: '', focus: '' }) }
})

const emit = defineEmits(['open-chapters', 'open-consistency', 'open-read'])

const t = (suffix) => (props.testPrefix ? `${props.testPrefix}-${suffix}` : undefined)
const generator = props.run.generator
const phase = () => generator.phase.value
</script>

<template>
  <div>
    <!-- ERROR -->
    <div v-if="phase() === 'error'" :data-test="t('error')" class="px-4 py-6 space-y-3">
      <div class="flex items-center gap-2">
        <BaseIcon name="alert-triangle" :size="16" class="text-danger shrink-0" />
        <h3 class="font-ui text-sm font-semibold text-text-primary">{{ failedTitle }}</h3>
      </div>
      <BaseAlert variant="danger">
        <span class="whitespace-pre-wrap">{{
          generator.error.value || 'An unknown error occurred.'
        }}</span>
      </BaseAlert>
      <div class="flex justify-end">
        <BaseButton variant="secondary" size="md" icon="rotate-ccw" @click="run.reset()">
          Try again
        </BaseButton>
      </div>
    </div>

    <!-- PIPELINE PROGRESS — spans every active phase, so "where am I in the
         whole thing" is always answered even in phases with no block of
         their own. -->
    <div v-if="run.isActive.value" :data-test="t('stages')" class="px-4 pt-4">
      <GenerationStages
        :phase="phase()"
        :current-scene="run.currentScene.value"
        :total-scenes="run.totalScenes.value"
        :status-text="generator.progress.statusText"
      />
    </div>

    <!-- BOOTSTRAPPING / PLANNING -->
    <div
      v-if="phase() === 'bootstrapping' || phase() === 'planning'"
      class="p-8 text-center space-y-4"
    >
      <GenerationLoadingScreen
        :phase="phase()"
        :progress="generator.progress"
        :streamed-entities="run.liveEntities.value"
        @cancel="run.reset()"
      />
    </div>

    <!-- PLAN PREVIEW -->
    <VolumePlanPreview
      v-if="phase() === 'plan-preview'"
      :data-test="t('plan-preview')"
      :scenes="run.previewScenes.value"
      :plan-label="planLabel"
      :scene-count="generator.scenePlan.value.length"
      @scene-edit="run.sceneEdit"
      @wants-edit="run.wantsEdit"
      @confirm="run.confirmPlan(planContext)"
      @cancel="run.reset()"
    />

    <!-- WRITING -->
    <div v-if="phase() === 'writing'" class="px-4 py-4 space-y-3">
      <div class="flex items-baseline justify-between gap-3 font-ui text-xs">
        <span class="text-text-primary tabular-nums">
          Scene {{ Math.min(run.currentScene.value + 1, run.totalScenes.value || 1) }} of
          {{ run.totalScenes.value || '…' }}
        </span>
        <span class="text-text-hint truncate">
          <template v-if="run.activeStreamCount.value > 1"
            >{{ run.activeStreamCount.value }} scenes writing in parallel</template
          >
          <template v-else>also live in the editor</template>
        </span>
      </div>
      <div
        class="h-1 bg-bg-tertiary rounded-full overflow-hidden"
        role="progressbar"
        :aria-valuenow="run.currentScene.value"
        :aria-valuemax="run.totalScenes.value"
      >
        <div
          class="h-full bg-accent rounded-full transition-[width] duration-300 ease-out"
          :style="{
            width:
              run.totalScenes.value > 0
                ? (run.currentScene.value / run.totalScenes.value) * 100 + '%'
                : '0%'
          }"
        ></div>
      </div>

      <div
        class="rounded-md bg-bg-tertiary border border-border-subtle max-h-64 overflow-y-auto scrollbar-thin"
      >
        <div
          class="p-3 font-manuscript text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
        >
          <template v-if="run.streamingText.value">{{ run.streamingText.value }}</template>
          <span v-else class="font-ui text-xs text-text-hint">Waiting for the first words…</span>
          <BaseIcon
            v-if="run.streamingText.value"
            name="loader-2"
            :size="12"
            class="animate-spin inline ml-1 text-accent"
          />
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 pt-1">
        <p class="font-ui text-xs text-text-hint">Finished scenes are kept.</p>
        <div class="flex items-center gap-2">
          <BaseButton
            variant="ghost"
            size="sm"
            :loading="generator.isCancelling.value"
            :disabled="generator.isCancelling.value"
            @click="run.reset()"
          >
            {{ generator.isCancelling.value ? 'Stopping' : 'Stop' }}
          </BaseButton>
          <BaseButton
            :data-test="t('pause-btn')"
            variant="secondary"
            size="sm"
            icon="pause"
            :loading="generator.pauseRequested.value"
            :disabled="generator.isCancelling.value || !generator.canPause.value"
            @click="generator.pause()"
          >
            {{ generator.pauseRequested.value ? 'Pausing after this scene' : 'Pause' }}
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- PAUSED -->
    <div v-if="phase() === 'paused'" :data-test="t('paused')" class="px-4 py-4 space-y-3">
      <div class="flex items-baseline justify-between gap-3 font-ui text-xs">
        <span class="text-text-primary tabular-nums">
          Paused after scene {{ run.currentScene.value }} of {{ run.totalScenes.value }}
        </span>
        <span class="text-text-hint">held in memory</span>
      </div>
      <div class="h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          class="h-full bg-accent/50 rounded-full"
          :style="{
            width:
              run.totalScenes.value > 0
                ? (run.currentScene.value / run.totalScenes.value) * 100 + '%'
                : '0%'
          }"
        ></div>
      </div>
      <div class="flex items-center justify-between gap-2 pt-1">
        <p class="font-ui text-xs text-text-hint">Continuing picks up exactly where it stopped.</p>
        <div class="flex items-center gap-2">
          <BaseButton variant="ghost" size="sm" @click="run.reset()">Stop</BaseButton>
          <BaseButton
            :data-test="t('continue-btn')"
            variant="primary"
            size="sm"
            icon="play"
            @click="generator.continueGeneration()"
          >
            Continue
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- SYNC PREVIEW -->
    <div v-if="phase() === 'sync-preview'" class="px-4 py-4 space-y-3">
      <GenerationSyncPreview
        :changes="generator.syncPreview.value"
        :loading="false"
        @confirm="run.confirmSync"
      />
      <div class="flex justify-end">
        <BaseButton variant="ghost" size="sm" @click="run.reset()">Cancel</BaseButton>
      </div>
    </div>

    <!-- SCENE REVIEW -->
    <VolumeSceneReview
      :volume-generator="generator"
      :data-test="t('scene-review')"
      @approve="run.approve"
      @reject="run.reject"
      @rerequest="run.rerequest"
      @cancel="run.reset()"
    />

    <!-- CONSISTENCY CHECK -->
    <div v-if="phase() === 'consistency-check'" class="px-4 py-6 space-y-2" role="status">
      <div class="flex items-center gap-2 font-ui text-sm text-text-primary">
        <BaseIcon name="loader-2" :size="14" class="animate-spin text-accent" />
        Checking continuity
      </div>
      <p class="font-ui text-xs text-text-hint leading-5">
        {{ generator.progress.statusText || consistencyHint }}
      </p>
    </div>

    <!-- GATE REPORT — beside the complete panel: the gate reports, it never
         deletes, so the prose is committed either way. -->
    <ChapterGateReport v-if="phase() === 'complete' && gateReport !== null" :report="gateReport" />

    <!-- COMPLETE -->
    <VolumeCompletePanel
      v-if="phase() === 'complete'"
      :data-test="t('complete')"
      :volume-generator="generator"
      :scene-eval="sceneEval"
      :save-status="saveStatus"
      @regenerate="run.regenerateScene"
      @evaluate="run.evaluateScene"
      @revise="run.reviseScene"
      @accept-revision="run.acceptRevision"
      @reset="run.reset()"
      @save="run.saveToManuscript"
      @export-txt="run.exportTxt"
      @export-md="run.exportMd"
      @open-chapters="emit('open-chapters')"
      @open-consistency="emit('open-consistency')"
      @open-read="emit('open-read')"
    />
  </div>
</template>
