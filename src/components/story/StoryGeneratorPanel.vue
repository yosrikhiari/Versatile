<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useStoryDocuments } from '../../composables/useStoryDocuments'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useVolumeStoryGenerator } from '../../composables/useVolumeStoryGenerator'
import { useChapterStoryGenerator } from '../../composables/generation/useChapterStoryGenerator'
import { useGenerationRunController } from '../../composables/generation/useGenerationRunController'
import { useStoryExport } from '../../composables/useStoryExport'
import { useSparkStore } from '../../stores/sparkStore'
import { useCompactConversation } from '../../composables/useOllama'
import SparkPanel from '../spark/SparkPanel.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSection from '../ui/BaseSection.vue'
import GenerationRunView from './GenerationRunView.vue'
import GenerationSetupView from './GenerationSetupView.vue'
import PreviousGenerationsList from './PreviousGenerationsList.vue'
import VolumeReadModal from './VolumeReadModal.vue'
import StoryContextModal from './StoryContextModal.vue'
import ConsistencyReportModal from './ConsistencyReportModal.vue'
import GenerationSettingsForm from './GenerationSettingsForm.vue'
import ContinueStoryCard from './ContinueStoryCard.vue'
import {
  MODE_ARC,
  MODE_CHAPTER,
  MODE_SCENE,
  MODE_BRAINSTORM,
  MODE_BLURB
} from '../../constants/generationModes'
import { useStoryBlurb } from '../../composables/useStoryBlurb'
import { useSceneEval } from '../../composables/useSceneEval'
import { useDriftTriggeredEval } from '../../composables/useDriftTriggeredEval'
import { useResearchScope } from '../../composables/useResearchScope'
import { useGenerationHistory } from '../../composables/useGenerationHistory'
import { useSparkContext } from '../../composables/useSparkContext'
import { useGenerationSettings } from '../../composables/useGenerationSettings'
import { useSettingsStore } from '../../stores/settingsStore'
import { t as tChapter } from '../../composables/useChapterI18n'

const emit = defineEmits(['openChapters'])

const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()
const storyDocuments = useStoryDocuments()
const manuscriptStore = useManuscriptStore()
const volumeGenerator = useVolumeStoryGenerator()
// A second, fully independent pipeline: its own delegator, its own AgentMemory,
// its own session budget. Created once at mount rather than per tab switch, so
// switching tabs mid-run cannot tear a run down or spawn a second one.
const chapterGenerator = useChapterStoryGenerator()
const { exportAsText, exportAsMarkdown } = useStoryExport()
const sparkStore = useSparkStore()
const { getTurns } = useCompactConversation()

const settingsStore = useSettingsStore()

// Zero-deploy rollback: with the flag off the Chapter tab is gone and the arc
// path is untouched. A run already in flight is not killed by flipping it —
// only the way in disappears.
const chapterTabEnabled = computed(() => settingsStore.enableChapterGeneration !== false)

const tabs = computed(() =>
  [
    { id: MODE_BRAINSTORM, label: 'Ideate' },
    { id: MODE_SCENE, label: 'Scene' },
    chapterTabEnabled.value ? { id: MODE_CHAPTER, label: 'Chapter' } : null,
    { id: MODE_ARC, label: 'Arc' },
    { id: MODE_BLURB, label: 'Blurb' }
  ].filter(Boolean)
)

const tab = ref(MODE_BRAINSTORM)

/** Research library state for the setup view; null hides the Sources section. */
const researchState = computed(() =>
  hasResearchDocs.value
    ? {
        docs: researchDocs.value,
        use: useResearch.value,
        selectedIds: selectedResearchDocIds.value,
        selectedCount: selectedResearchCount.value
      }
    : null
)

const bibleFootnote = computed(() => {
  const parts = []
  if (characterCount.value) parts.push(`${characterCount.value} characters`)
  if (locationCount.value) parts.push(`${locationCount.value} locations`)
  if (threadCount.value) parts.push(`${threadCount.value} plot threads`)
  return parts.length ? `Draws on ${parts.join(', ')}.` : 'Draws on your story bible.'
})

/** One line under the tab strip saying what the current tab is for. */
const TAB_HINTS = {
  [MODE_BRAINSTORM]: 'prompts and blueprints',
  [MODE_SCENE]: 'one scene',
  [MODE_CHAPTER]: 'one chapter, scene by scene',
  [MODE_ARC]: 'a whole book',
  [MODE_BLURB]: 'back-cover copy'
}
const tabHint = computed(() => TAB_HINTS[tab.value] || '')

// If the flag is turned off while the chapter tab is open, fall back rather
// than leaving the panel on a tab that renders nothing.
watch(chapterTabEnabled, (enabled) => {
  if (!enabled && tab.value === MODE_CHAPTER) tab.value = MODE_BRAINSTORM
})

const mode = computed(() =>
  tab.value === MODE_ARC ? MODE_ARC : tab.value === MODE_CHAPTER ? MODE_CHAPTER : MODE_SCENE
)
const {
  genre,
  tone,
  focus,
  wordTarget,
  usePreciseStructure,
  volumes,
  chaptersPerVolume,
  wordsPerChapter,
  scenesPerChapter,
  estimatedTotalWords
} = useGenerationSettings()

const { sparkContext, sparkContextLabel, handleSendSparkToGenerator, clearSparkContext } =
  useSparkContext({
    sparkStore,
    getTurns,
    setTab: (v) => {
      tab.value = v
    }
  })

const blurbTone = ref('dramatic')
const blurbLength = ref('standard')
const blurbResult = ref('')
const blurbHistory = ref([])
const blurbToneOptions = [
  { id: 'dramatic', label: 'Dramatic' },
  { id: 'mysterious', label: 'Mysterious' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'literary', label: 'Literary' }
]
const blurbLengthOptions = [
  { id: 'short', label: 'Short (50-80w)' },
  { id: 'standard', label: 'Standard (120-180w)' },
  { id: 'long', label: 'Long (250-350w)' }
]

const {
  generating: blurbGenerating,
  error: blurbError,
  generateBlurb,
  getBlurbHistory,
  deleteBlurb
} = useStoryBlurb()

async function loadBlurbHistory() {
  blurbHistory.value = await getBlurbHistory()
}

async function handleGenerateBlurb() {
  blurbResult.value = ''
  const result = await generateBlurb({ tone: blurbTone.value, length: blurbLength.value })
  if (result.success) {
    blurbResult.value = result.blurb
    await loadBlurbHistory()
  }
}

async function handleCopyBlurb(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // clipboard not available
  }
}

async function handleDeleteBlurb(id) {
  await deleteBlurb(id)
  await loadBlurbHistory()
}

const showVolumeReadModal = ref(false)
const showStoryContextModal = ref(false)

const consistencyModalOpen = ref(false)
const selectedSceneIndex = ref(0)
const saveStatus = ref(null)

const sceneEval = useSceneEval()
const driftTriggeredEval = useDriftTriggeredEval(sceneEval)

// One controller per pipeline. They share no state — a chapter run and an arc
// run used to overwrite each other's streams and plan edits when they did —
// but they share every line of code (see useGenerationRunController).
const runDeps = {
  projectStore,
  manuscriptStore,
  storyDocuments,
  sceneEval,
  exportAsText,
  exportAsMarkdown,
  selectedSceneIndex,
  saveStatus
}
const volumeRun = useGenerationRunController(volumeGenerator, {
  ...runDeps,
  exportTitle: 'Generated Story',
  onAfterEvaluate: () => checkDriftAfterEval()
})
const chapterRun = useGenerationRunController(chapterGenerator, {
  ...runDeps,
  exportTitle: 'Generated Chapter'
})

// Top-level aliases: the idle forms bind these with v-model, and a ref only
// unwraps in a template when it is a top-level binding.
const autoRun = volumeRun.autoRun
const sceneReviewEnabled = volumeRun.sceneReviewEnabled
const inlineEvalEnabled = volumeRun.inlineEvalEnabled
const chapterAutoRun = chapterRun.autoRun
const chapterSceneReviewEnabled = chapterRun.sceneReviewEnabled
const chapterInlineEvalEnabled = chapterRun.inlineEvalEnabled
const chapterResumableRun = chapterRun.resumableRun
const resetVolumeStreams = volumeRun.resetStreams
const handleVolumeChunk = volumeRun.handleChunk
// The arc tab's "Unfinished draft" card reads useGenerationHistory's
// resumableRun, not the controller's — clear it here so the card goes away.
const handleVolumeResume = () => {
  resumableRun.value = null
  return volumeRun.resume()
}
const handleChapterResume = () => chapterRun.resume()

/** What confirmPlan hands back to the generator alongside the edited plan. */
const planContext = computed(() => ({
  synopsis: synopsis.value,
  sparkContext: sparkContext.value,
  focus: focus.value
}))

async function checkDriftAfterEval() {
  const pid = projectStore.currentProjectId
  if (!pid || volumeGenerator.writtenScenes.value.length === 0) return
  const ws = projectStore.activeWorkspaceType || 'creative'
  const storyBible = await storyDocuments.getStoryDocumentContext(pid)
  const chapterLog = volumeGenerator.writtenScenes.value
    .filter(Boolean)
    .map((s) => `Scene ${s.sceneNumber} ("${s.title}"): ${s.summary || '(written)'}`)
    .slice(-20)
    .join('\n')
  await driftTriggeredEval.check({
    projectId: pid,
    scenes: volumeGenerator.writtenScenes.value,
    workspaceType: ws,
    scenePlanItems: volumeGenerator.scenePlan.value,
    storyBible,
    chapterLog
  })
}

async function runDriftCheck() {
  await checkDriftAfterEval()
}

const genres = [
  'Fantasy',
  'Sci-Fi',
  'Thriller',
  'Romance',
  'Horror',
  'Literary',
  'Mystery',
  'Historical'
]
const tones = ['Tense', 'Melancholic', 'Hopeful', 'Dark', 'Playful', 'Atmospheric']
const synopsis = computed(() => {
  const parts = []
  if (projectStore.currentCategory) parts.push(`Category: ${projectStore.currentCategory}`)
  if (projectStore.currentGenre) parts.push(`Genre: ${projectStore.currentGenre}`)
  if (projectStore.currentDescription) parts.push(projectStore.currentDescription)
  return parts.join('\n') || ''
})

const hasSynopsis = computed(() => synopsis.value.length >= 10)

const characterCount = computed(() => storyBibleStore.characters.length)
const locationCount = computed(() => storyBibleStore.locations.length)
const threadCount = computed(() => storyBibleStore.plotThreads.length)

const {
  previousGenerations,
  resumableRun,
  loadPreviousGenerations,
  checkResumable,
  handleDiscardResumable
} = useGenerationHistory(() => projectStore.currentProjectId, volumeGenerator)

// ----- Research sources: let the user pick which imported documents inform the plan -----
const {
  researchDocs,
  useResearch,
  selectedResearchDocIds,
  hasResearchDocs,
  selectedResearchCount,
  loadResearchSources,
  toggleResearchDoc,
  selectAllResearch,
  selectNoResearch,
  buildResearchScope
} = useResearchScope(() => projectStore.currentProjectId)

onMounted(() => {
  loadPreviousGenerations()
  checkResumable()
  checkChapterResumable()
  loadResearchSources()
  loadBlurbHistory()
  refreshContinuationSurvey()
})

// The panel usually outlives several trips to the Research library, so the
// source list has to be re-read rather than captured once at mount.
watch(
  () => projectStore.currentProjectId,
  () => loadResearchSources()
)

// ----- Generating on top of what already exists -----
//
// The survey is read from the manuscript, not from a run, so it stays accurate
// for a project whose generation happened in an earlier session — including one
// that stopped partway and left planned chapters with no prose in them.
const continuationSurvey = ref(null)

async function refreshContinuationSurvey() {
  if (!projectStore.currentProjectId) return
  try {
    continuationSurvey.value = await volumeGenerator.surveyContinuation(
      projectStore.currentProjectId
    )
  } catch (err) {
    console.warn('[StoryGeneratorPanel] continuation survey failed:', err)
  }
}

const continuationLabel = computed(() =>
  volumeGenerator.continuationReport.value
    ? volumeGenerator.describeContinuation(volumeGenerator.continuationReport.value)
    : ''
)

async function handleContinueDrafting({ includeShort }) {
  if (!projectStore.currentProjectId) return
  resetVolumeStreams()
  try {
    await volumeGenerator.continueDrafting({
      projectId: projectStore.currentProjectId,
      includeShort,
      onChunk: handleVolumeChunk
    })
  } catch {
    // volumeGenerator.error is set internally; the card shows the outcome.
  } finally {
    await refreshContinuationSurvey()
  }
}

async function handleExtendStory(structure) {
  if (!projectStore.currentProjectId) return
  resetVolumeStreams()
  try {
    await volumeGenerator.extendStory({
      projectId: projectStore.currentProjectId,
      ...structure,
      synopsis: synopsis.value,
      genre: genre.value,
      tone: tone.value,
      focus: focus.value,
      onChunk: handleVolumeChunk
    })
  } catch {
    // volumeGenerator.error is set internally; the card shows the outcome.
  } finally {
    await refreshContinuationSurvey()
  }
}

// ----- Volume pipeline -----
async function handleVolumeGenerate() {
  if (!hasSynopsis.value || !projectStore.currentProjectId) return

  volumeRun.beginRun()

  // Re-read the library at the moment it matters. Anything imported since this
  // panel mounted would otherwise be missing from the scope, and a project whose
  // first import happened after mount would generate with no research at all.
  await loadResearchSources()

  try {
    const result = await volumeGenerator.startGeneration({
      projectId: projectStore.currentProjectId,
      synopsis: synopsis.value,
      genre: genre.value,
      tone: tone.value,
      wordTarget: wordTarget.value,
      singleChapter: mode.value === MODE_SCENE || mode.value === MODE_CHAPTER, // Keep compatible for now until follow-up task
      sparkContext: sparkContext.value,
      focus: focus.value,
      auto: autoRun.value,
      structure: usePreciseStructure.value
        ? {
            volumes: volumes.value,
            chaptersPerVolume: chaptersPerVolume.value,
            wordsPerChapter: wordsPerChapter.value,
            scenesPerChapter: scenesPerChapter.value
          }
        : null,
      research: buildResearchScope(),
      onPhaseChange: (_p) => {},
      onPartialData: (type, name) => volumeRun.noteLiveEntity(type, name),
      // In one-click mode writing runs inside startGeneration, so stream here too
      onChunk: volumeRun.handleChunk
    })
    volumeRun.notePlanned(result)
  } catch {
    // The composable already sets phase.value = 'error' and logs the error.
  }
}

// ----- Chapter pipeline -----
async function checkChapterResumable() {
  if (!projectStore.currentProjectId) return
  try {
    chapterRun.resumableRun.value = await chapterGenerator.getResumableRun(
      projectStore.currentProjectId
    )
  } catch (err) {
    console.warn('[StoryGeneratorPanel] chapter resumable check failed:', err)
  }
}

async function handleChapterGenerate() {
  if (!hasSynopsis.value || !projectStore.currentProjectId) return

  chapterRun.beginRun()

  // Re-read the library at the moment it matters, exactly as the arc path does:
  // anything imported since this panel mounted would otherwise be missing.
  await loadResearchSources()

  try {
    const result = await chapterGenerator.startGeneration({
      projectId: projectStore.currentProjectId,
      synopsis: synopsis.value,
      genre: genre.value,
      tone: tone.value,
      wordTarget: wordTarget.value,
      scenesPerChapter: scenesPerChapter.value,
      sparkContext: sparkContext.value,
      focus: focus.value,
      auto: chapterAutoRun.value,
      research: buildResearchScope(),
      onPhaseChange: () => {},
      onPartialData: (type, name) => chapterRun.noteLiveEntity(type, name),
      onChunk: chapterRun.handleChunk
    })
    chapterRun.notePlanned(result)
  } catch {
    // The composable sets phase 'error' and populates error; the block renders it.
  }
}

// The read/consistency modals are shared chrome, so they follow whichever
// pipeline the current tab is driving.
const activeGenerator = computed(() =>
  tab.value === MODE_CHAPTER ? chapterGenerator : volumeGenerator
)

const activeTotalConsistencyIssues = computed(() => {
  const report = activeGenerator.value.consistencyReport.value
  if (!report) return 0
  return (report.characterIssues?.length || 0) + (report.locationIssues?.length || 0)
})

// A run left in flight outlives the panel otherwise: the writer keeps streaming
// into a store nothing is rendering.
onBeforeUnmount(() => {
  chapterGenerator.destroy()
})
</script>

<template>
  <div class="h-full flex flex-col bg-bg-primary overflow-hidden">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle">
      <div class="flex items-baseline justify-between mb-3">
        <h2 class="font-ui text-sm font-semibold text-text-primary">Story tools</h2>
        <span class="font-ui text-xs text-text-hint">{{ tabHint }}</span>
      </div>
      <div
        class="flex w-full gap-0.5 p-0.5 rounded-lg border border-border-subtle bg-bg-primary"
        role="tablist"
        aria-label="Story tools"
      >
        <button
          v-for="m in tabs"
          :key="m.id"
          role="tab"
          type="button"
          :data-test="`tab-${m.id}`"
          :aria-selected="tab === m.id ? 'true' : 'false'"
          class="flex-1 py-1.5 text-xs rounded-md font-ui font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          :class="
            tab === m.id
              ? 'bg-bg-elevated text-text-primary'
              : 'text-text-hint hover:bg-surface-hover hover:text-text-secondary'
          "
          @click="tab = m.id"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <!-- ==================== BRAINSTORM TAB ==================== -->
      <div v-if="tab === MODE_BRAINSTORM" class="h-full flex flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto">
          <SparkPanel embedded @use-as-context="handleSendSparkToGenerator" />
        </div>
      </div>

      <!-- ==================== BLURB TAB ==================== -->
      <div v-if="tab === MODE_BLURB" class="h-full flex flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto p-4 space-y-5">
          <!-- Tone selector -->
          <div class="space-y-2">
            <label class="text-xs text-text-primary font-semibold font-ui">Tone</label>
            <div class="flex gap-1.5 flex-wrap">
              <button
                v-for="opt in blurbToneOptions"
                :key="opt.id"
                class="px-3 py-1.5 text-xs rounded-lg border font-ui transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
                :class="
                  blurbTone === opt.id
                    ? 'border-accent text-accent'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-strong'
                "
                :style="
                  blurbTone === opt.id
                    ? { background: 'rgb(var(--vers-accent-primary-rgb) / 0.14)' }
                    : {}
                "
                @click="blurbTone = opt.id"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Length selector -->
          <div class="space-y-2">
            <label class="text-xs text-text-primary font-semibold font-ui">Length</label>
            <div class="flex gap-1.5">
              <button
                v-for="opt in blurbLengthOptions"
                :key="opt.id"
                class="flex-1 py-1.5 text-xs rounded-lg border font-ui transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
                :class="
                  blurbLength === opt.id
                    ? 'border-accent text-accent'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-strong'
                "
                :style="
                  blurbLength === opt.id
                    ? { background: 'rgb(var(--vers-accent-primary-rgb) / 0.14)' }
                    : {}
                "
                @click="blurbLength = opt.id"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Generate button -->
          <button
            :disabled="blurbGenerating"
            class="w-full py-2.5 btn-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleGenerateBlurb"
          >
            <span class="flex items-center justify-center gap-2">
              <BaseIcon name="book-open" :size="16" />
              Generate Blurb
            </span>
          </button>

          <!-- Loading -->
          <div
            v-if="blurbGenerating"
            class="flex items-center justify-center gap-2 py-4 text-text-secondary"
          >
            <BaseIcon name="loader" :size="18" class="animate-spin text-accent" />
            <span class="text-xs font-ui">Writing your blurb...</span>
          </div>

          <!-- Error -->
          <div
            v-if="blurbError && !blurbGenerating"
            class="rounded-lg bg-bg-secondary border border-border-subtle p-3 text-center"
          >
            <p class="text-xs text-danger font-ui">{{ blurbError }}</p>
          </div>

          <!-- Result -->
          <div v-if="blurbResult" class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-primary font-semibold font-ui">Generated Blurb</span>
              <button
                class="flex items-center gap-1 text-2xs text-text-hint hover:text-accent font-ui transition-colors focus:outline-none focus:ring-1 focus:ring-accent rounded px-1.5 py-0.5"
                @click="handleCopyBlurb(blurbResult)"
              >
                <BaseIcon name="copy" :size="12" />
                Copy
              </button>
            </div>
            <div
              class="rounded-lg bg-bg-tertiary border border-border-subtle p-3 text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
            >
              {{ blurbResult }}
            </div>
          </div>

          <!-- History -->
          <div v-if="blurbHistory.length > 0" class="space-y-2">
            <details class="group">
              <summary
                class="flex items-center gap-2 text-xs text-text-hover font-ui cursor-pointer select-none py-1"
              >
                <BaseIcon
                  name="chevron-right"
                  :size="14"
                  class="transition-transform group-open:rotate-90"
                />
                Previous blurbs ({{ blurbHistory.length }})
              </summary>
              <div class="mt-2 space-y-2">
                <div
                  v-for="item in blurbHistory"
                  :key="item.id"
                  class="rounded-lg border border-border-subtle p-3 space-y-1.5"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-2xs text-text-hint font-ui">
                      {{ item.tone }} · {{ item.length }}
                      <span v-if="item.generatedAt" class="ml-1">{{
                        new Date(item.generatedAt).toLocaleDateString()
                      }}</span>
                    </span>
                    <div class="flex items-center gap-2">
                      <button
                        class="text-text-hint hover:text-accent transition-colors focus:outline-none focus:ring-1 focus:ring-accent rounded"
                        title="Copy"
                        @click="handleCopyBlurb(item.blurb)"
                      >
                        <BaseIcon name="copy" :size="12" />
                      </button>
                      <button
                        class="text-text-hint hover:text-danger transition-colors focus:outline-none focus:ring-1 focus:ring-accent rounded"
                        title="Delete"
                        @click="handleDeleteBlurb(item.id)"
                      >
                        <BaseIcon name="trash-2" :size="12" />
                      </button>
                    </div>
                  </div>
                  <p class="text-xs text-text-secondary leading-relaxed line-clamp-3">
                    {{ item.blurb }}
                  </p>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      <!-- ==================== CHAPTER GENERATOR ====================
           A parallel pipeline bound to `chapterGenerator`, which owns its own
           delegator and its own AgentMemory. It sits BEFORE the arc gate and
           the arc gate is `v-else-if`, so the two never render together — a
           chapter tab satisfies `tab !== MODE_BRAINSTORM && tab !== MODE_BLURB`
           too, and the chapter block would otherwise never appear. -->
      <template v-if="tab === MODE_CHAPTER">
        <div data-test="chapter-pipeline">
          <!-- IDLE / CONTROLS -->
          <template v-if="chapterGenerator.phase.value === 'idle'">
            <GenerationSetupView
              v-model:auto-run="chapterAutoRun"
              v-model:scene-review="chapterSceneReviewEnabled"
              v-model:inline-eval="chapterInlineEvalEnabled"
              test-prefix="chapter"
              :resumable="chapterResumableRun"
              :research="researchState"
              :spark-context="sparkContext"
              :spark-context-label="sparkContextLabel"
              :generate-label="
                tChapter('chapter.generate') + (sparkContext ? ' with Spark context' : '')
              "
              :disabled="!hasSynopsis || chapterGenerator.phase.value !== 'idle'"
              :footnote="
                tChapter('chapter.perScene', {
                  scenes: scenesPerChapter,
                  words: chapterGenerator
                    .getSceneBudget(wordTarget, scenesPerChapter)
                    .toLocaleString()
                })
              "
              @resume="handleChapterResume"
              @discard-resume="chapterResumableRun = null"
              @clear-spark="clearSparkContext"
              @generate="handleChapterGenerate"
              @toggle-research="useResearch = $event"
              @select-all-research="selectAllResearch"
              @select-no-research="selectNoResearch"
              @toggle-doc="toggleResearchDoc"
            >
              <GenerationSettingsForm
                v-model:genre="genre"
                v-model:tone="tone"
                v-model:focus="focus"
                v-model:word-target="wordTarget"
                v-model:use-precise-structure="usePreciseStructure"
                v-model:volumes="volumes"
                v-model:chapters-per-volume="chaptersPerVolume"
                v-model:words-per-chapter="wordsPerChapter"
                v-model:scenes-per-chapter="scenesPerChapter"
                :genres="genres"
                :tones="tones"
                :mode="MODE_CHAPTER"
                :synopsis="synopsis"
                :has-synopsis="hasSynopsis"
                :estimated-total-words="estimatedTotalWords"
                @open-context="showStoryContextModal = true"
              />
            </GenerationSetupView>
          </template>

          <GenerationRunView
            :run="chapterRun"
            :scene-eval="sceneEval"
            :save-status="saveStatus"
            plan-label="Chapter"
            :failed-title="tChapter('chapter.failed')"
            test-prefix="chapter"
            :gate-report="chapterGenerator.chapterGateReport.value"
            consistency-hint="Comparing character and location depictions across the chapter"
            :plan-context="planContext"
            @open-chapters="emit('openChapters')"
            @open-consistency="consistencyModalOpen = true"
            @open-read="showVolumeReadModal = true"
          />
        </div>
      </template>

      <!-- ==================== CHAPTER / VOLUME TABS ==================== -->
      <template v-else-if="tab !== MODE_BRAINSTORM && tab !== MODE_BLURB">
        <!-- ==================== IDLE / CONTROLS ==================== -->
        <template v-if="volumeGenerator.phase.value === 'idle'">
          <div data-test="volume-pipeline">
            <GenerationSetupView
              v-model:auto-run="autoRun"
              v-model:scene-review="sceneReviewEnabled"
              v-model:inline-eval="inlineEvalEnabled"
              :resumable="resumableRun"
              :research="researchState"
              :spark-context="sparkContext"
              :spark-context-label="sparkContextLabel"
              :generate-label="
                (mode === MODE_SCENE
                  ? 'Generate scene'
                  : mode === MODE_CHAPTER
                    ? 'Generate chapter'
                    : 'Generate arc') + (sparkContext ? ' with Spark context' : '')
              "
              :disabled="!hasSynopsis || volumeGenerator.phase.value !== 'idle'"
              :footnote="bibleFootnote"
              @resume="handleVolumeResume"
              @discard-resume="handleDiscardResumable"
              @clear-spark="clearSparkContext"
              @generate="handleVolumeGenerate"
              @toggle-research="useResearch = $event"
              @select-all-research="selectAllResearch"
              @select-no-research="selectNoResearch"
              @toggle-doc="toggleResearchDoc"
            >
              <template #before>
                <!-- Add to a manuscript that already has work in it -->
                <ContinueStoryCard
                  :survey="continuationSurvey"
                  :busy="volumeGenerator.isContinuing.value"
                  :report="volumeGenerator.continuationReport.value"
                  :report-label="continuationLabel"
                  @continue="handleContinueDrafting"
                  @extend="handleExtendStory"
                  @stop="volumeGenerator.stop()"
                />
              </template>
              <GenerationSettingsForm
                v-model:genre="genre"
                v-model:tone="tone"
                v-model:focus="focus"
                v-model:word-target="wordTarget"
                v-model:use-precise-structure="usePreciseStructure"
                v-model:volumes="volumes"
                v-model:chapters-per-volume="chaptersPerVolume"
                v-model:words-per-chapter="wordsPerChapter"
                v-model:scenes-per-chapter="scenesPerChapter"
                :genres="genres"
                :tones="tones"
                :mode="mode"
                :synopsis="synopsis"
                :has-synopsis="hasSynopsis"
                :estimated-total-words="estimatedTotalWords"
                @open-context="showStoryContextModal = true"
              />
            </GenerationSetupView>
          </div>
        </template>

        <!-- ==================== ARC / SCENE RUN ==================== -->
        <GenerationRunView
          :run="volumeRun"
          :scene-eval="sceneEval"
          :save-status="saveStatus"
          :plan-label="mode === MODE_SCENE ? 'Scene' : mode === MODE_CHAPTER ? 'Chapter' : 'Arc'"
          failed-title="Conjuration Failed"
          consistency-hint="Comparing character and location depictions across all scenes"
          :plan-context="planContext"
          @open-chapters="emit('openChapters')"
          @open-consistency="consistencyModalOpen = true"
          @open-read="showVolumeReadModal = true"
        />

        <!-- DRIFT TRIGGER: a section like the ones inside the complete panel,
             so the run's tail reads as one column rather than a stray card. -->
        <BaseSection
          v-if="volumeGenerator.phase.value === 'complete'"
          title="Drift"
          description="Re-evaluate recent scenes against earlier verdicts to catch quality sliding over a long run."
          dense
        >
          <template #actions>
            <BaseButton
              variant="ghost"
              size="sm"
              icon="activity"
              :loading="driftTriggeredEval.isChecking.value"
              :disabled="driftTriggeredEval.isChecking.value"
              @click="runDriftCheck"
            >
              {{ driftTriggeredEval.isChecking.value ? 'Checking' : 'Check for drift' }}
            </BaseButton>
          </template>

          <p
            v-if="driftTriggeredEval.lastCheckResult.value"
            class="font-ui text-xs leading-5"
            :class="
              driftTriggeredEval.lastCheckResult.value.triggered ? 'text-warning' : 'text-text-hint'
            "
          >
            <template v-if="driftTriggeredEval.lastCheckResult.value.triggered">
              Drift detected —
              {{ driftTriggeredEval.lastCheckResult.value.action.regressedDims.length }}
              dimension(s) regressed,
              {{ driftTriggeredEval.lastCheckResult.value.action.reEvaluatedScenes }}
              scene(s) re-evaluated.
              <button
                type="button"
                class="ml-1 text-text-hint hover:text-text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                @click="driftTriggeredEval.clearTriggers()"
              >
                Clear
              </button>
            </template>
            <template v-else>{{ driftTriggeredEval.lastCheckResult.value.reason }}</template>
          </p>
          <p
            v-else-if="driftTriggeredEval.hasRecentTriggers.value"
            class="font-ui text-xs text-text-hint leading-5"
          >
            {{ driftTriggeredEval.triggeredActions.value.length }} prior drift trigger(s).
          </p>
          <p v-else class="font-ui text-xs text-text-hint leading-5">Not checked yet.</p>
        </BaseSection>
      </template>

      <!-- Past runs scroll with the form; they used to be pinned under the
           scroll area and painted over whatever was at the bottom of it. -->
      <PreviousGenerationsList
        v-if="tab !== MODE_BRAINSTORM && tab !== MODE_BLURB"
        :generations="previousGenerations"
      />
    </div>

    <!-- ==================== VOLUME READ MODAL ==================== -->
    <VolumeReadModal
      v-if="showVolumeReadModal"
      :scenes="activeGenerator.writtenScenes.value"
      @close="showVolumeReadModal = false"
    />

    <!-- ==================== STORY CONTEXT MODAL ==================== -->
    <StoryContextModal
      :show="showStoryContextModal"
      :project-id="projectStore.currentProjectId"
      @close="showStoryContextModal = false"
    />

    <!-- ==================== CONSISTENCY REPORT MODAL ==================== -->
    <ConsistencyReportModal
      v-if="consistencyModalOpen"
      :report="activeGenerator.consistencyReport.value"
      :total-issues="activeTotalConsistencyIssues"
      @close="consistencyModalOpen = false"
    />
  </div>
</template>
