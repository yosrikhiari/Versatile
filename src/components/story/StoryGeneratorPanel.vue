<script setup>
import { ref, computed, onMounted } from 'vue'
import { db } from '../../services/db-core'
import { useProjectStore } from '../../stores/projectStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useVolumeStoryGenerator } from '../../composables/useVolumeStoryGenerator'
import { useStoryExport } from '../../composables/useStoryExport'
import { useSparkStore } from '../../stores/sparkStore'
import { useCompactConversation } from '../../composables/useOllama'
import SparkPanel from '../spark/SparkPanel.vue'
import BaseIcon from '../shared/BaseIcon.vue'
import GenerationSyncPreview from './GenerationSyncPreview.vue'
import GenerationLoadingScreen from './GenerationLoadingScreen.vue'
import PreviousGenerationsList from './PreviousGenerationsList.vue'
import VolumeReadModal from './VolumeReadModal.vue'
import StoryContextModal from './StoryContextModal.vue'
import ConsistencyReportModal from './ConsistencyReportModal.vue'
import GenerationSettingsForm from './GenerationSettingsForm.vue'
import {
  MODE_ARC,
  MODE_CHAPTER,
  MODE_SCENE,
  MODE_BRAINSTORM,
  MODE_BLURB
} from '../../constants/generationModes'
import { useStoryBlurb } from '../../composables/useStoryBlurb'
import { useSceneEval } from '../../composables/useSceneEval'
import { useResearchScope } from '../../composables/useResearchScope'
import { useGenerationHistory } from '../../composables/useGenerationHistory'
import { useSparkContext } from '../../composables/useSparkContext'
import { useGenerationSettings } from '../../composables/useGenerationSettings'
import VolumeCompletePanel from './VolumeCompletePanel.vue'
import VolumeSceneReview from './VolumeSceneReview.vue'
import VolumePlanPreview from './VolumePlanPreview.vue'

const emit = defineEmits(['openChapters'])

const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()
const manuscriptStore = useManuscriptStore()
const volumeGenerator = useVolumeStoryGenerator()
const { exportAsText, exportAsMarkdown } = useStoryExport()
const sparkStore = useSparkStore()
const { getTurns } = useCompactConversation()

const tab = ref(MODE_BRAINSTORM)

const mode = computed(() =>
  tab.value === MODE_ARC ? MODE_ARC : tab.value === MODE_CHAPTER ? MODE_CHAPTER : MODE_SCENE
)
const {
  genre,
  tone,
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

const volumeStreamingText = ref('')
const volumeCurrentScene = ref(0)
const volumeTotalScenes = ref(0)
const volumeStoryArc = ref(null)
const volumeStoryContract = ref('')
const volumePlanEdits = ref([])
const liveEntities = ref([])

const consistencyModalOpen = ref(false)
const selectedSceneIndex = ref(0)
const showDashboard = ref(false)

const sceneReviewEnabled = computed({
  get: () => volumeGenerator.sceneReviewMode.value,
  set: (val) => {
    volumeGenerator.sceneReviewMode.value = val
  }
})
const inlineEvalEnabled = computed({
  get: () => volumeGenerator.inlineEvalEnabled.value,
  set: (val) => {
    volumeGenerator.inlineEvalEnabled.value = val
  }
})
const autoRun = computed({
  get: () => volumeGenerator.autoMode.value,
  set: (val) => {
    volumeGenerator.autoMode.value = val
  }
})
const previewScenes = computed(() =>
  volumePlanEdits.value.length > 0 ? volumePlanEdits.value : volumeGenerator.scenePlan.value
)

const sceneEval = useSceneEval()

function handleEvaluateScene(idx) {
  const scene = volumeGenerator.writtenScenes.value?.[idx]
  const planItem = volumeGenerator.scenePlan.value?.[idx]
  if (!scene) return
  const ws = projectStore.activeWorkspaceType || 'creative'
  sceneEval.evaluate(scene, ws, planItem, idx, projectStore.currentProjectId)
}

function handleReviseScene(idx) {
  const scene = volumeGenerator.writtenScenes.value?.[idx]
  const planItem = volumeGenerator.scenePlan.value?.[idx]
  if (!scene || !sceneEval.critiqueResult.value) return
  const ws = projectStore.activeWorkspaceType || 'creative'
  sceneEval.revise(scene, ws, planItem, idx, projectStore.currentProjectId)
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
  if (projectStore.currentDescription) parts.push(projectStore.currentDescription)
  return parts.join('\n') || ''
})

const hasSynopsis = computed(() => synopsis.value.length >= 10)

const characterCount = computed(() => storyBibleStore.characters.length)
const locationCount = computed(() => storyBibleStore.locations.length)
const threadCount = computed(() => storyBibleStore.plotThreads.length)

const volumeTotalConsistencyIssues = computed(() => {
  const report = volumeGenerator.consistencyReport.value
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
  () => volumeGenerator.consistencyReport.value?.characterIssues?.length || 0
)
const totalLocationIssues = computed(
  () => volumeGenerator.consistencyReport.value?.locationIssues?.length || 0
)

const totalWordsWritten = computed(() =>
  volumeGenerator.writtenScenes.value.reduce(
    (sum, s) => sum + (s.prose?.split(/\s+/).length || 0),
    0
  )
)

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
  loadResearchSources()
  loadBlurbHistory()
})

async function handleVolumeResume() {
  if (!projectStore.currentProjectId) return
  resumableRun.value = null
  volumeStreamingText.value = ''
  try {
    await volumeGenerator.resumeGeneration({
      projectId: projectStore.currentProjectId,
      onPhaseChange: () => {},
      onChunk: ({ sceneIndex, total, fullProse }) => {
        volumeCurrentScene.value = sceneIndex
        volumeTotalScenes.value = total
        volumeStreamingText.value = fullProse
      }
    })
  } catch {
    /* phase/error set internally */
  }
}

// ----- Volume pipeline -----
async function handleVolumeGenerate() {
  if (!hasSynopsis.value || !projectStore.currentProjectId) return

  volumeStreamingText.value = ''
  volumeCurrentScene.value = 0
  volumeTotalScenes.value = 0
  volumeStoryArc.value = null
  volumeStoryContract.value = ''
  volumePlanEdits.value = []
  liveEntities.value = []

  try {
    const result = await volumeGenerator.startGeneration({
      projectId: projectStore.currentProjectId,
      synopsis: synopsis.value,
      genre: genre.value,
      tone: tone.value,
      wordTarget: wordTarget.value,
      singleChapter: mode.value === MODE_SCENE || mode.value === MODE_CHAPTER, // Keep compatible for now until follow-up task
      sparkContext: sparkContext.value,
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
      onPartialData: (type, name) => {
        liveEntities.value.push({
          id: Date.now().toString(36) + performance.now().toString(36).replace('.', ''),
          type,
          name
        })
      },
      // In one-click mode writing runs inside startGeneration, so stream here too
      onChunk: ({ sceneIndex, total, fullProse }) => {
        volumeCurrentScene.value = sceneIndex
        volumeTotalScenes.value = total
        volumeStreamingText.value = fullProse
      }
    })

    if (result) {
      volumeStoryArc.value = result.storyArc
      volumeStoryContract.value = result.storyContract
    }
  } catch (err) {
    // The composable already sets phase.value = 'error' and logs the error.
    // Swallowing it here to prevent Uncaught Promise Rejection in Vue.
  }
}

async function handleVolumeConfirmPlan() {
  if (!projectStore.currentProjectId) return

  const editedPlan =
    volumePlanEdits.value.length > 0 ? volumePlanEdits.value : volumeGenerator.scenePlan.value

  try {
    await volumeGenerator.confirmPlan({
      projectId: projectStore.currentProjectId,
      editedPlan,
      storyArc: volumeStoryArc.value,
      storyContract: volumeStoryContract.value,
      synopsis: synopsis.value,
      sparkContext: sparkContext.value,
      onPhaseChange: () => {},
      onChunk: ({ sceneIndex, total, _chunk, fullProse, _scene }) => {
        volumeCurrentScene.value = sceneIndex
        volumeTotalScenes.value = total
        volumeStreamingText.value = fullProse
      }
    })
  } catch {
    // error.value and phase already set internally
  }
}

async function handleVolumeConfirmSync(acceptedEntities) {
  if (!projectStore.currentProjectId) return
  try {
    await volumeGenerator.confirmSync({
      acceptedEntities,
      projectId: projectStore.currentProjectId,
      volumeId: volumeGenerator.volumeId.value,
      chapterId: null
    })
  } catch {
    // error handled internally
  }
}

async function handleApproveScene() {
  await volumeGenerator.approveScene()
}

async function handleRejectScene() {
  await volumeGenerator.rejectScene()
}

async function handleRerequestScene(edits) {
  if (!edits?.trim()) return
  await volumeGenerator.rerequestScene(edits)
}

function handleVolumeReset() {
  volumeGenerator.reset()
  selectedSceneIndex.value = 0
  volumeStreamingText.value = ''
  volumeCurrentScene.value = 0
  volumeTotalScenes.value = 0
  volumeStoryArc.value = null
  volumeStoryContract.value = ''
  volumePlanEdits.value = []
  sparkContext.value = ''
}

async function handleVolumeExportTxt() {
  const scenes = volumeGenerator.writtenScenes.value
  if (scenes.length === 0) return
  await exportAsText({
    title: `Generated Story`,
    scenes: scenes.map((s) => ({ title: s.title, prose: s.prose }))
  })
}

async function handleVolumeExportMd() {
  const scenes = volumeGenerator.writtenScenes.value
  if (scenes.length === 0) return
  await exportAsMarkdown({
    title: `Generated Story`,
    scenes: scenes.map((s) => ({ title: s.title, prose: s.prose }))
  })
}

function handleVolumeSceneEdit(sceneIndex, field, value) {
  if (!volumePlanEdits.value.length) {
    volumePlanEdits.value = JSON.parse(JSON.stringify(volumeGenerator.scenePlan.value))
  }
  if (volumePlanEdits.value[sceneIndex]) {
    volumePlanEdits.value[sceneIndex][field] = value
  }
}
function handleWantsEdit(sceneIndex, text) {
  const wants = {}
  if (text) {
    text.split(',').forEach((part) => {
      const trimmed = part.trim()
      const sep = trimmed.indexOf('→')
      if (sep > 0) {
        const name = trimmed.slice(0, sep).trim()
        const goal = trimmed.slice(sep + 1).trim()
        if (name && goal) wants[name] = goal
      }
    })
  }
  handleVolumeSceneEdit(sceneIndex, 'characterWants', wants)
}

async function handleRegenerateScene(sceneIndex) {
  if (!projectStore.currentProjectId) return
  await volumeGenerator.regenerateScene(projectStore.currentProjectId, sceneIndex)
}

const saveStatus = ref(null)

async function handleVolumeSaveToManuscript() {
  const scenes = volumeGenerator.writtenScenes.value
  if (scenes.length === 0 || !projectStore.currentProjectId) return

  saveStatus.value = { type: 'saving', message: `Saving ${scenes.length} scene(s)...` }
  let saved = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    const subsectionId = scene.subsectionId || volumeGenerator.scenePlan.value[i]?.subsectionId
    if (!subsectionId) {
      skipped++
      continue
    }

    try {
      await manuscriptStore.updateSubsectionData(
        subsectionId,
        {
          content: scene.prose,
          wordCount: scene.prose.split(/\s+/).length
        },
        projectStore.currentProjectId
      )
      saved++
    } catch (err) {
      console.error('[StoryGeneratorPanel] failed to save scene', i, err)
      errors++
    }
  }

  saveStatus.value = {
    type: 'done',
    message: `Saved ${saved} scene(s)${skipped > 0 ? `, ${skipped} skipped (no subsection)` : ''}${errors > 0 ? `, ${errors} error(s)` : ''}`
  }
  setTimeout(() => {
    saveStatus.value = null
  }, 5000)
}

function acceptRevision() {
  if (selectedSceneIndex.value === null || selectedSceneIndex.value === undefined) return
  volumeGenerator.writtenScenes.value[selectedSceneIndex.value].prose =
    sceneEval.revisionResult.value.revisedProse
}

function getPhaseLabel(phase) {
  const labels = {
    bootstrapping: 'Preparing Story Elements',
    planning: 'Planning Chapter Arc',
    'plan-preview': 'Review the Plan',
    writing: 'Writing Scenes',
    'sync-preview': 'Reviewing New Characters',
    'consistency-check': 'Checking for Contradictions',
    complete: 'Done',
    error: 'Error'
  }
  return labels[phase] || phase
}
</script>

<template>
  <div class="h-full flex flex-col bg-bg-primary overflow-hidden">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle">
      <h2 class="text-base font-semibold text-text-primary font-ui mb-3">Story Tools</h2>
      <div class="flex w-full gap-0.5 p-0.5 bg-bg-secondary border border-border-subtle rounded-lg">
        <button
          v-for="m in [
            { id: MODE_BRAINSTORM, label: 'Ideate' },
            { id: MODE_SCENE, label: 'Scene' },
            { id: MODE_CHAPTER, label: 'Chapter' },
            { id: MODE_ARC, label: 'Arc' },
            { id: MODE_BLURB, label: 'Blurb' }
          ]"
          :key="m.id"
          class="flex-1 py-1.5 text-xs rounded-md font-ui transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-accent"
          :class="tab === m.id ? 'text-accent' : 'text-text-secondary hover:text-text-primary'"
          :style="tab === m.id ? { background: 'rgba(var(--vers-accent-primary-rgb),0.14)' } : {}"
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
                    ? { background: 'rgba(var(--vers-accent-primary-rgb),0.14)' }
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
                    ? { background: 'rgba(var(--vers-accent-primary-rgb),0.14)' }
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
            class="w-full py-2.5 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
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
            class="rounded-lg bg-red-950/20 border border-red-800/30 p-3 text-center"
          >
            <p class="text-xs text-red-400 font-ui">{{ blurbError }}</p>
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
                        class="text-text-hint hover:text-red-400 transition-colors focus:outline-none focus:ring-1 focus:ring-accent rounded"
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

      <!-- ==================== CHAPTER / VOLUME TABS ==================== -->
      <template v-if="tab !== MODE_BRAINSTORM && tab !== MODE_BLURB">
        <!-- ==================== IDLE / CONTROLS ==================== -->
        <template v-if="volumeGenerator.phase.value === 'idle'">
          <div class="p-4 space-y-5">
            <!-- Story Context: the canonical grounding doc fed to the writer -->
            <button
              class="w-full flex items-center gap-2 py-2 px-3 text-xs text-text-secondary hover:text-text-primary border border-border-subtle rounded-lg font-ui transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
              @click="showStoryContextModal = true"
            >
              <BaseIcon name="book-open" :size="15" class="text-accent shrink-0" />
              <span class="flex-1 text-left">Story Context</span>
              <span class="text-[10px] text-text-hint">keeps the writer grounded</span>
            </button>

            <!-- Resume an interrupted one-click run -->
            <div
              v-if="resumableRun"
              class="rounded-lg border border-accent/40 bg-accent/10 p-3 space-y-2"
            >
              <p class="text-xs text-text-primary font-ui">
                Unfinished draft — {{ resumableRun.written }} of {{ resumableRun.total }} scenes
                written.
              </p>
              <div class="flex items-center gap-2">
                <button
                  class="flex-1 py-1.5 text-xs bg-accent text-accent-foreground rounded-md font-medium hover:bg-accent/90 font-ui focus:outline-none focus:ring-1 focus:ring-accent"
                  @click="handleVolumeResume"
                >
                  Resume
                </button>
                <button
                  class="py-1.5 px-3 text-xs text-text-hint hover:text-text-primary font-ui focus:outline-none focus:ring-1 focus:ring-accent rounded-md"
                  @click="handleDiscardResumable"
                >
                  Discard
                </button>
              </div>
            </div>

            <GenerationSettingsForm
              v-model:genre="genre"
              v-model:tone="tone"
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
            />

            <!-- Research sources: choose which imported documents inform the novel -->
            <div
              v-if="hasResearchDocs"
              class="rounded-lg border border-border-subtle p-3 space-y-3"
            >
              <label
                class="flex items-center gap-2 text-xs text-text-primary font-ui cursor-pointer select-none"
              >
                <input
                  v-model="useResearch"
                  type="checkbox"
                  class="rounded border-border-subtle bg-bg-tertiary text-accent focus:ring-accent"
                />
                Use research to inform this novel
              </label>

              <div v-if="useResearch" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-2xs uppercase tracking-widest text-text-hint font-ui">
                    {{ selectedResearchCount }} of {{ researchDocs.length }} sources
                  </span>
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      class="text-2xs font-ui text-text-hint hover:text-accent focus:outline-none focus:ring-1 focus:ring-accent rounded"
                      @click="selectAllResearch"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      class="text-2xs font-ui text-text-hint hover:text-accent focus:outline-none focus:ring-1 focus:ring-accent rounded"
                      @click="selectNoResearch"
                    >
                      None
                    </button>
                  </div>
                </div>

                <ul class="max-h-40 overflow-y-auto space-y-1 pr-1">
                  <li v-for="doc in researchDocs" :key="doc.id">
                    <label
                      class="flex items-center gap-2 text-xs text-text-secondary font-ui cursor-pointer select-none hover:text-text-primary"
                    >
                      <input
                        type="checkbox"
                        :checked="selectedResearchDocIds.has(doc.id)"
                        class="rounded border-border-subtle bg-bg-tertiary text-accent focus:ring-accent shrink-0"
                        @change="toggleResearchDoc(doc.id)"
                      />
                      <span class="flex-1 truncate">{{ doc.fileName }}</span>
                      <span class="text-2xs text-text-hint tabular-nums shrink-0">{{
                        doc.chunkCount
                      }}</span>
                    </label>
                  </li>
                </ul>

                <p v-if="selectedResearchCount === 0" class="text-2xs text-text-hint font-ui">
                  No sources selected — generation will proceed without research context.
                </p>
              </div>
            </div>

            <!-- Spark context badge -->
            <div
              v-if="sparkContext"
              class="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2.5 space-y-1"
            >
              <div class="flex items-center gap-2">
                <BaseIcon name="sparkles" :size="14" class="text-accent shrink-0" />
                <span class="text-xs text-accent font-semibold font-ui flex-1 truncate"
                  >Spark context active</span
                >
                <button
                  class="text-text-hint hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent rounded"
                  title="Remove Spark context"
                  @click="clearSparkContext"
                >
                  <BaseIcon name="x" :size="14" />
                </button>
              </div>
              <p class="text-2xs text-text-hint font-ui truncate pl-5" :title="sparkContext">
                {{ sparkContextLabel }}
              </p>
            </div>

            <div class="flex items-center gap-2 px-1">
              <label
                class="flex items-center gap-2 text-xs text-text-hint font-ui cursor-pointer select-none"
              >
                <input
                  v-model="autoRun"
                  type="checkbox"
                  class="rounded border-border-subtle bg-bg-tertiary text-accent focus:ring-accent"
                />
                One-click: write the whole thing (no stops)
              </label>
            </div>
            <div class="flex items-center gap-2 px-1">
              <label
                class="flex items-center gap-2 text-xs font-ui select-none"
                :class="
                  autoRun ? 'text-text-hint/40 cursor-not-allowed' : 'text-text-hint cursor-pointer'
                "
              >
                <input
                  v-model="sceneReviewEnabled"
                  type="checkbox"
                  :disabled="autoRun"
                  class="rounded border-border-subtle bg-bg-tertiary text-accent focus:ring-accent disabled:opacity-40"
                />
                Pause per scene for review
              </label>
            </div>
            <div class="flex items-center gap-2 px-1">
              <label
                class="flex items-center gap-2 text-xs text-text-hint font-ui cursor-pointer select-none"
              >
                <input
                  v-model="inlineEvalEnabled"
                  type="checkbox"
                  class="rounded border-border-subtle bg-bg-tertiary text-accent focus:ring-accent"
                />
                Auto-evaluate scenes
              </label>
            </div>

            <button
              :disabled="!hasSynopsis || volumeGenerator.phase.value !== 'idle'"
              class="w-full py-2.5 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="handleVolumeGenerate"
            >
              <span class="flex items-center justify-center gap-2">
                <BaseIcon name="wand-2" :size="16" />
                {{
                  mode === MODE_SCENE
                    ? 'Generate Scene'
                    : mode === MODE_CHAPTER
                      ? 'Generate Chapter'
                      : 'Generate Arc'
                }}{{ sparkContext ? ' with Spark context' : '' }}
              </span>
            </button>

            <p class="text-xs text-text-hint text-center font-ui">
              Powered by your story bible
              <span v-if="characterCount > 0 || locationCount > 0 || threadCount > 0">
                ({{ characterCount }} characters, {{ locationCount }} locations,
                {{ threadCount }} plot threads)
              </span>
            </p>
          </div>
        </template>

        <!-- ==================== CHAPTER GENERATOR ==================== -->
        <!-- ERROR STATE -->
        <div v-if="volumeGenerator.phase.value === 'error'" class="p-8 text-center space-y-4">
          <div class="flex items-center justify-center gap-3 text-red-400 py-4">
            <BaseIcon name="alert-triangle" :size="32" />
          </div>
          <div class="text-lg font-ui text-text-primary">Conjuration Failed</div>
          <p
            class="text-sm text-red-300 bg-red-950/20 p-4 rounded-lg border border-red-900/30 max-w-lg mx-auto whitespace-pre-wrap"
          >
            {{ volumeGenerator.error || 'An unknown error occurred.' }}
          </p>
          <div class="pt-4">
            <button
              class="px-6 py-2 bg-bg-tertiary text-text-secondary hover:text-text-primary rounded-lg transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="handleVolumeReset"
            >
              Try Again
            </button>
          </div>
        </div>

        <!-- BOOTSTRAPPING / PLANNING -->
        <div
          v-if="
            volumeGenerator.phase.value === 'bootstrapping' ||
            volumeGenerator.phase.value === 'planning'
          "
          class="p-8 text-center space-y-4"
        >
          <GenerationLoadingScreen
            :phase="volumeGenerator.phase.value"
            :progress="volumeGenerator.progress"
            :streamed-entities="liveEntities"
            @cancel="handleVolumeReset"
          />
        </div>

        <!-- PLAN PREVIEW -->
        <VolumePlanPreview
          v-if="volumeGenerator.phase.value === 'plan-preview'"
          :scenes="previewScenes"
          :plan-label="mode === MODE_SCENE ? 'Scene' : mode === MODE_CHAPTER ? 'Chapter' : 'Arc'"
          :scene-count="volumeGenerator.scenePlan.value.length"
          @scene-edit="handleVolumeSceneEdit"
          @wants-edit="handleWantsEdit"
          @confirm="handleVolumeConfirmPlan"
          @cancel="handleVolumeReset"
        />

        <!-- WRITING STATE -->
        <div v-if="volumeGenerator.phase.value === 'writing'" class="p-4 space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-text-hint font-ui">
              <span
                >{{ getPhaseLabel(volumeGenerator.phase.value) }} — Scene
                {{ volumeCurrentScene }} of {{ volumeTotalScenes }}</span
              >
              <span
                >{{
                  volumeTotalScenes > 0
                    ? Math.round((volumeCurrentScene / volumeTotalScenes) * 100)
                    : 0
                }}%</span
              >
            </div>
            <div class="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                class="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                :style="{
                  width:
                    volumeTotalScenes > 0
                      ? (volumeCurrentScene / volumeTotalScenes) * 100 + '%'
                      : '0%'
                }"
              ></div>
            </div>
            <div
              v-if="volumeGenerator.progress.statusText"
              class="text-11px text-text-hint font-ui text-center italic mt-1.5"
            >
              {{ volumeGenerator.progress.statusText }}
            </div>
          </div>

          <div
            class="rounded-lg bg-bg-tertiary border border-border-subtle max-h-64 overflow-y-auto scrollbar-thin"
          >
            <div class="p-3 text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
              {{ volumeStreamingText || 'Writing...' }}
              <BaseIcon
                v-if="volumeStreamingText"
                name="loader-2"
                :size="12"
                class="animate-spin inline ml-1 text-accent"
              />
            </div>
          </div>

          <button
            class="w-full py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeReset"
          >
            Cancel
          </button>
        </div>

        <!-- SYNC PREVIEW STATE -->
        <div v-if="volumeGenerator.phase.value === 'sync-preview'" class="p-4 space-y-4">
          <GenerationSyncPreview
            :changes="volumeGenerator.syncPreview.value"
            :loading="false"
            @confirm="handleVolumeConfirmSync"
          />
          <button
            class="w-full py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeReset"
          >
            Cancel
          </button>
        </div>

        <!-- SCENE REVIEW STATE -->
        <VolumeSceneReview
          :volume-generator="volumeGenerator"
          @approve="handleApproveScene"
          @reject="handleRejectScene"
          @rerequest="handleRerequestScene"
          @cancel="handleVolumeReset"
        />

        <!-- CONSISTENCY CHECK STATE -->
        <div
          v-if="volumeGenerator.phase.value === 'consistency-check'"
          class="p-8 text-center space-y-4"
        >
          <div class="flex items-center justify-center gap-3 py-8">
            <BaseIcon name="loader-2" :size="24" class="animate-spin text-accent" />
            <span class="text-lg text-text-primary font-ui animate-pulse"
              >Checking continuity...</span
            >
          </div>
          <p class="text-sm text-text-hint">
            {{
              volumeGenerator.progress.statusText ||
              'Comparing character and location depictions across all scenes'
            }}
          </p>
        </div>

        <!-- COMPLETE STATE -->
        <VolumeCompletePanel
          v-if="volumeGenerator.phase.value === 'complete'"
          :volume-generator="volumeGenerator"
          :scene-eval="sceneEval"
          :save-status="saveStatus"
          @regenerate="handleRegenerateScene"
          @evaluate="handleEvaluateScene"
          @revise="handleReviseScene"
          @accept-revision="acceptRevision"
          @reset="handleVolumeReset"
          @save="handleVolumeSaveToManuscript"
          @export-txt="handleVolumeExportTxt"
          @export-md="handleVolumeExportMd"
          @open-chapters="emit('openChapters')"
          @open-consistency="consistencyModalOpen = true"
          @open-read="showVolumeReadModal = true"
        />

        <!-- ERROR STATE -->
        <div v-if="volumeGenerator.phase.value === 'error'" class="p-4 space-y-4">
          <div class="rounded-lg bg-red-950/20 border border-red-800/30 p-4 text-center space-y-2">
            <BaseIcon name="alert-triangle" :size="24" class="mx-auto text-red-400" />
            <p class="text-sm font-medium text-red-400 font-ui">Generation Failed</p>
            <p class="text-xs text-red-300/70">
              {{ volumeGenerator.error.value || 'An unexpected error occurred.' }}
            </p>
          </div>
          <button
            class="w-full py-2.5 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeReset"
          >
            Try Again
          </button>
        </div>
      </template>
    </div>

    <!-- ==================== PREVIOUS GENERATIONS ==================== -->
    <PreviousGenerationsList :generations="previousGenerations" />

    <!-- ==================== VOLUME READ MODAL ==================== -->
    <VolumeReadModal
      v-if="showVolumeReadModal"
      :scenes="volumeGenerator.writtenScenes.value"
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
      :report="volumeGenerator.consistencyReport.value"
      :total-issues="volumeTotalConsistencyIssues"
      @close="consistencyModalOpen = false"
    />
  </div>
</template>
