<script setup>
import { ref, computed } from 'vue'
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
import { MODE_ARC, MODE_CHAPTER, MODE_SCENE, MODE_BRAINSTORM } from '../../constants/generationModes'

const emit = defineEmits(['openChapters'])

const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()
const manuscriptStore = useManuscriptStore()
const volumeGenerator = useVolumeStoryGenerator()
const { exportAsText, exportAsMarkdown } = useStoryExport()
const sparkStore = useSparkStore()
const { getTurns } = useCompactConversation()

const tab = ref(MODE_BRAINSTORM)

const mode = computed(() => tab.value === MODE_ARC ? MODE_ARC : (tab.value === MODE_CHAPTER ? MODE_CHAPTER : MODE_SCENE))
const genre = ref('')
const tone = ref('')
const wordTarget = ref(3500)

const sparkContext = ref('')

const hasSparkResponse = computed(() => {
  if (sparkStore.currentOutline || sparkStore.currentContent || sparkStore.currentStreamingContent) return true
  const turns = getTurns('spark_default')
  return turns.some(t => t.role === 'assistant')
})

// Human-readable label for what's about to be sent to the generator
const sparkContextLabel = computed(() => {
  if (sparkStore.currentOutline) {
    const title = sparkStore.currentOutline.title
    return title ? `Blueprint: "${title}"` : 'Chapter Blueprint'
  }
  if (sparkStore.currentContent) {
    const snippet = sparkStore.currentContent.slice(0, 60).replace(/\n/g, ' ')
    return `Content: "${snippet}${sparkStore.currentContent.length > 60 ? '…' : ''}"`
  }
  return 'Spark output'
})

function formatBlueprintAsContext(blueprint) {
  const lines = [
    blueprint.title       ? `Chapter: ${blueprint.title}`             : null,
    blueprint.openingBeat     ? `Opening beat: ${blueprint.openingBeat}`     : null,
    blueprint.turningPoint    ? `Turning point: ${blueprint.turningPoint}`   : null,
    blueprint.confrontationBeat ? `Confrontation: ${blueprint.confrontationBeat}` : null,
    blueprint.closingBeat     ? `Closing beat: ${blueprint.closingBeat}`     : null,
    blueprint.sensoryAnchor   ? `Sensory anchor: ${blueprint.sensoryAnchor}` : null,
    blueprint.dialogueHook    ? `Dialogue hook: ${blueprint.dialogueHook}`   : null,
    blueprint.writingNotes    ? `Notes: ${blueprint.writingNotes}`           : null,
  ].filter(Boolean)
  return lines.join('\n')
}

function handleSendSparkToGenerator() {
  // Priority 1: blueprint — the most structured context; must be formatted from the object,
  // not from the conversation turn (turns only store a compact summary string)
  if (sparkStore.currentOutline) {
    sparkContext.value = formatBlueprintAsContext(sparkStore.currentOutline)
    tab.value = MODE_CHAPTER
    return
  }

  // Priority 2: generated chapter content
  if (sparkStore.currentContent) {
    sparkContext.value = sparkStore.currentContent
    tab.value = MODE_SCENE
    return
  }

  // Priority 3: last assistant turn in the conversation (prompt / partial streaming)
  const turns = getTurns('spark_default')
  const lastAssistant = [...turns].reverse().find(t => t.role === 'assistant')
  sparkContext.value = lastAssistant?.content || sparkStore.currentStreamingContent || ''
  tab.value = 'chapter'
}

function clearSparkContext() {
  sparkContext.value = ''
}

const showVolumeReadModal = ref(false)

const volumeStreamingText = ref('')
const volumeCurrentScene = ref(0)
const volumeTotalScenes = ref(0)
const volumeStoryArc = ref(null)
const volumeStoryContract = ref('')
const volumePlanEdits = ref([])
const liveEntities = ref([])

const consistencyModalOpen = ref(false)
const selectedSceneIndex = ref(0)

const pitchOpen = ref(-1)
const showReRequestInput = ref(false)
const reRequestEdits = ref('')
const sceneReviewEnabled = computed({
  get: () => volumeGenerator.sceneReviewMode.value,
  set: (val) => { volumeGenerator.sceneReviewMode.value = val }
})
function togglePitch(i) {
  pitchOpen.value = pitchOpen.value === i ? -1 : i
}
function formatWants(wants) {
  if (!wants || typeof wants !== 'object') return ''
  return Object.entries(wants).map(([name, goal]) => `${name} → ${goal}`).join(', ')
}

const previewScenes = computed(() =>
  volumePlanEdits.value.length > 0 ? volumePlanEdits.value : volumeGenerator.scenePlan.value
)

function getTensionBarClass(tension) {
  switch (tension) {
    case 'peak': return 'bg-red-400'
    case 'high': return 'bg-orange-400'
    case 'medium': return 'bg-yellow-400'
    case 'low': return 'bg-gray-400'
    default: return 'bg-gray-400'
  }
}

const genres = ['Fantasy', 'Sci-Fi', 'Thriller', 'Romance', 'Horror', 'Literary', 'Mystery', 'Historical']
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

const totalWordsWritten = computed(() =>
  volumeGenerator.writtenScenes.value.reduce((sum, s) => sum + (s.prose?.split(/\s+/).length || 0), 0)
)

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
      onPhaseChange: (p) => {},
      onPartialData: (type, name) => {
        liveEntities.value.push({
          id: Date.now().toString(36) + performance.now().toString(36).replace('.', ''),
          type,
          name
        })
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

  const editedPlan = volumePlanEdits.value.length > 0 ? volumePlanEdits.value : volumeGenerator.scenePlan.value

  try {
    await volumeGenerator.confirmPlan({
      projectId: projectStore.currentProjectId,
      editedPlan,
      storyArc: volumeStoryArc.value,
      storyContract: volumeStoryContract.value,
      synopsis: synopsis.value,
      sparkContext: sparkContext.value,
      onPhaseChange: () => {},
      onChunk: ({ sceneIndex, total, chunk, fullProse, scene }) => {
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
  showReRequestInput.value = false
  reRequestEdits.value = ''
  await volumeGenerator.rejectScene()
}

async function handleRerequestScene() {
  if (!reRequestEdits.value.trim()) return
  await volumeGenerator.rerequestScene(reRequestEdits.value)
  reRequestEdits.value = ''
  showReRequestInput.value = false
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
  const text = scenes.map((s, i) =>
    `--- Scene ${i + 1}: ${s.title} ---\n\n${s.prose}`
  ).join('\n\n')
  await exportAsText({
    title: `Generated Story`,
    scenes: scenes.map(s => ({ title: s.title, prose: s.prose }))
  })
}

async function handleVolumeExportMd() {
  const scenes = volumeGenerator.writtenScenes.value
  if (scenes.length === 0) return
  await exportAsMarkdown({
    title: `Generated Story`,
    scenes: scenes.map(s => ({ title: s.title, prose: s.prose }))
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

async function handleRegenerateScene(sceneIndex) {
  if (!projectStore.currentProjectId) return
  await volumeGenerator.regenerateScene(projectStore.currentProjectId, sceneIndex)
}

async function handleVolumeSaveToManuscript() {
  const scenes = volumeGenerator.writtenScenes.value
  if (scenes.length === 0 || !projectStore.currentProjectId) return

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    const subsectionId = scene.subsectionId || volumeGenerator.scenePlan.value[i]?.subsectionId
    if (!subsectionId) continue

    await manuscriptStore.updateSubsectionData(subsectionId, {
      content: scene.prose,
      wordCount: scene.prose.split(/\s+/).length
    }, projectStore.currentProjectId)
  }
}

// ----- Shared -----
function getTensionColor(tension) {
  switch (tension) {
    case 'peak': return 'text-red-400 bg-red-950/30'
    case 'high': return 'text-orange-400 bg-orange-950/30'
    case 'medium': return 'text-yellow-400 bg-yellow-950/30'
    case 'low': return 'text-gray-400 bg-gray-800/30'
    default: return 'text-gray-400 bg-gray-800/30'
  }
}

function getScoreColor(score) {
  if (score >= 8) return 'text-green-400 bg-green-950/30 border-green-800/30'
  if (score >= 5) return 'text-yellow-400 bg-yellow-950/30 border-yellow-800/30'
  return 'text-red-400 bg-red-950/30 border-red-800/30'
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
  <div class="h-full flex flex-col bg-bg-primary">
    <div class="px-4 pt-4 pb-3 border-b border-border-subtle flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-text-primary font-ui">Story Tools</h2>
      </div>
      <div class="flex items-center justify-center w-full mt-2 border-b border-border-subtle/30 pb-3">
        <div class="flex items-center gap-6">
          <label
            v-for="m in [
              { id: MODE_BRAINSTORM, label: 'Ideate' },
              { id: MODE_SCENE, label: 'Scene' },
              { id: MODE_CHAPTER, label: 'Chapter' },
              { id: MODE_ARC, label: 'Arc' }
            ]"
            :key="m.id"
            class="flex items-center gap-2 cursor-pointer group"
            @click="tab = m.id"
          >
            <div class="w-3 h-3 rounded-full border flex items-center justify-center transition-all duration-300"
                 :class="tab === m.id ? 'border-accent' : 'border-text-hint/50 group-hover:border-text-secondary'">
              <div v-if="tab === m.id" class="w-1.5 h-1.5 bg-accent rounded-full"></div>
            </div>
            <span class="text-[11px] font-spark tracking-widest transition-colors duration-300"
                  :class="tab === m.id ? 'text-accent' : 'text-text-hint group-hover:text-text-primary'">
              {{ m.label }}
            </span>
          </label>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <!-- ==================== BRAINSTORM TAB ==================== -->
      <div v-if="tab === MODE_BRAINSTORM" class="h-full flex flex-col">
        <div class="flex-1 overflow-y-auto">
          <SparkPanel embedded @use-as-context="handleSendSparkToGenerator" />
        </div>
      </div>

      <!-- ==================== CHAPTER / VOLUME TABS ==================== -->
      <template v-if="tab !== MODE_BRAINSTORM">
      <!-- ==================== IDLE / CONTROLS ==================== -->
      <template v-if="volumeGenerator.phase.value === 'idle'">
        <div class="p-4 space-y-5">
          <div>
            <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">Story Synopsis</label>
            <div v-if="hasSynopsis" class="w-full min-h-20 px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-body whitespace-pre-wrap">
              {{ synopsis }}
            </div>
            <div v-else class="w-full min-h-20 px-3 py-2.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-hint italic font-body flex items-center justify-center">
              <span>No synopsis set — open Project Settings to add a category and description</span>
            </div>
          </div>

          <div>
            <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">Genre</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="g in genres"
                :key="g"
                :class="[
                  'px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent',
                  genre === g ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
                ]"
                @click="genre = genre === g ? '' : g"
              >{{ g }}</button>
            </div>
          </div>

          <div>
            <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">Tone</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="t in tones"
                :key="t"
                :class="[
                  'px-3 py-1.5 text-xs rounded-md transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent',
                  tone === t ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-hint hover:text-text-secondary hover:bg-surface-hover'
                ]"
                @click="tone = tone === t ? '' : t"
              >{{ t }}</button>
            </div>
          </div>

          <div>
            <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">{{ mode === MODE_SCENE ? 'Words per Scene' : 'Total Word Target' }}</label>
            <input
              v-model.number="wordTarget"
              type="number"
              min="500"
              max="10000"
              step="100"
              class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <!-- Spark context badge -->
          <div v-if="sparkContext" class="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2.5 space-y-1">
            <div class="flex items-center gap-2">
              <BaseIcon name="sparkles" :size="14" class="text-accent shrink-0" />
              <span class="text-xs text-accent font-semibold font-ui flex-1 truncate">Spark context active</span>
              <button
                class="text-text-hint hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent rounded"
                title="Remove Spark context"
                @click="clearSparkContext"
              >
                <BaseIcon name="x" :size="14" />
              </button>
            </div>
            <p class="text-[10px] text-text-hint font-ui truncate pl-5" :title="sparkContext">{{ sparkContextLabel }}</p>
          </div>

          <div class="flex items-center gap-2 px-1">
            <label class="flex items-center gap-2 text-xs text-text-hint font-ui cursor-pointer select-none">
              <input
                type="checkbox"
                v-model="sceneReviewEnabled"
                class="rounded border-border-subtle bg-bg-tertiary text-accent focus:ring-accent"
              />
              Pause per scene for review
            </label>
          </div>

          <button
            :disabled="!hasSynopsis || volumeGenerator.phase.value !== 'idle'"
            class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeGenerate"
          >
            <span class="flex items-center justify-center gap-2">
              <BaseIcon name="wand-2" :size="16" />
              {{ mode === MODE_SCENE ? 'Generate Scene' : (mode === MODE_CHAPTER ? 'Generate Chapter' : 'Generate Arc') }}{{ sparkContext ? ' with Spark context' : '' }}
            </span>
          </button>

          <p class="text-xs text-text-hint text-center font-ui">
            Powered by your story bible
            <span v-if="characterCount > 0 || locationCount > 0 || threadCount > 0">
              ({{ characterCount }} characters, {{ locationCount }} locations, {{ threadCount }} plot threads)
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
          <p class="text-sm text-red-300 bg-red-950/20 p-4 rounded-lg font-body border border-red-900/30 max-w-lg mx-auto whitespace-pre-wrap">{{ volumeGenerator.error || 'An unknown error occurred.' }}</p>
          <div class="pt-4">
            <button
              class="px-6 py-2 bg-bg-tertiary text-text-secondary hover:text-text-primary rounded-lg transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="handleVolumeReset"
            >Try Again</button>
          </div>
        </div>

        <!-- BOOTSTRAPPING / PLANNING -->
        <div v-if="volumeGenerator.phase.value === 'bootstrapping' || volumeGenerator.phase.value === 'planning'" class="p-8 text-center space-y-4">
          <GenerationLoadingScreen 
            :phase="volumeGenerator.phase.value"
            :progress="volumeGenerator.progress"
            :streamed-entities="liveEntities"
            @cancel="handleVolumeReset"
          />
        </div>

        <!-- PLAN PREVIEW -->
        <div v-if="volumeGenerator.phase.value === 'plan-preview'" class="p-4 space-y-4">
          <div class="rounded-lg bg-bg-secondary border border-border-subtle p-4 space-y-3">
            <h3 class="text-sm font-semibold text-text-primary font-ui">{{ mode === MODE_SCENE ? 'Scene' : (mode === MODE_CHAPTER ? 'Chapter' : 'Arc') }} Plan — {{ volumeGenerator.scenePlan.value.length }} scene{{ volumeGenerator.scenePlan.value.length === 1 ? '' : 's' }}</h3>
            <p class="text-xs text-text-hint font-body">Edit scene fields before writing begins. Narrative pitches are auto-generated previews — edit the underlying fields to update them.</p>
          </div>

          <div class="space-y-2">
            <h3 class="text-xs uppercase tracking-widest text-text-hint font-ui">Scenes</h3>

            <!-- Tension arc visualization -->
            <div class="flex gap-0.5 h-3 rounded overflow-hidden bg-bg-tertiary" title="Tension arc across scenes">
              <div
                v-for="(scene, j) in previewScenes"
                :key="j"
                :class="getTensionBarClass(scene.tension)"
                class="h-full transition-colors"
                :style="{ width: (100 / previewScenes.length) + '%' }"
                :title="'Scene ' + (j + 1) + ': ' + scene.tension"
              />
            </div>

            <div
              v-for="(scene, i) in previewScenes"
              :key="i"
              class="rounded-lg bg-bg-secondary border border-border-subtle p-3 space-y-2"
            >
              <!-- Header -->
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-text-primary font-ui">Scene {{ scene.sceneNumber || i + 1 }}: {{ scene.title }}</span>
                <span :class="['px-2 py-0.5 rounded text-xs font-ui', getTensionColor(scene.tension)]">{{ scene.tension }}</span>
              </div>

              <!-- Collapsible narrative pitch -->
              <div class="rounded-lg bg-bg-tertiary/50 border border-border-subtle">
                <button
                  class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-hover hover:text-text-primary transition-colors font-ui focus:outline-none"
                  @click="togglePitch(i)"
                >
                  <BaseIcon :name="pitchOpen === i ? 'chevron-down' : 'chevron-right'" :size="12" />
                  <span class="font-medium">Narrative Pitch</span>
                </button>
                <div v-if="pitchOpen === i" class="px-3 pb-2.5 text-xs text-text-secondary font-body leading-relaxed space-y-1 border-t border-border-subtle pt-2">
                  <p v-if="scene.goal">This scene aims to make the reader feel <span class="text-text-primary font-medium">{{ scene.goal }}</span>.</p>
                  <p v-if="scene.setup || scene.payoff">
                    <template v-if="scene.setup">It sets up: <span class="text-text-primary">{{ scene.setup }}</span></template>
                    <template v-if="scene.setup && scene.payoff"> — </template>
                    <template v-if="scene.payoff">pays off: <span class="text-text-primary">{{ scene.payoff }}</span></template>
                    <template v-if="!scene.setup && !scene.payoff">No setup or payoff defined.</template>
                  </p>
                  <p v-if="scene.sensoryAnchor">Anchored by the sensory detail: <span class="text-text-primary italic">{{ scene.sensoryAnchor }}</span>.</p>
                  <p v-if="!scene.goal && !scene.setup && !scene.payoff && !scene.sensoryAnchor" class="text-text-hint italic">No narrative details yet.</p>
                </div>
              </div>

              <!-- 2-column editable field grid -->
              <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <!-- Left column -->
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Goal:</span>
                    <input
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.goal || ''"
                      @input="handleVolumeSceneEdit(i, 'goal', $event.target.value)"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Characters:</span>
                    <input
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.characters ? scene.characters.join(', ') : (scene.charactersPresent || []).join(', ')"
                      @input="handleVolumeSceneEdit(i, 'characters', $event.target.value.split(',').map(s => s.trim()))"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Setup:</span>
                    <input
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.setup || ''"
                      @input="handleVolumeSceneEdit(i, 'setup', $event.target.value)"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Sensory:</span>
                    <input
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.sensoryAnchor || ''"
                      @input="handleVolumeSceneEdit(i, 'sensoryAnchor', $event.target.value)"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Tension:</span>
                    <select
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.tension || 'medium'"
                      @change="handleVolumeSceneEdit(i, 'tension', $event.target.value)"
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="peak">peak</option>
                    </select>
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Arc Pos:</span>
                    <select
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.arcPosition || ''"
                      @change="handleVolumeSceneEdit(i, 'arcPosition', $event.target.value)"
                    >
                      <option value="">—</option>
                      <option value="opening">opening</option>
                      <option value="rising">rising</option>
                      <option value="climax">climax</option>
                      <option value="falling">falling</option>
                      <option value="resolution">resolution</option>
                    </select>
                  </div>
                </div>

                <!-- Right column -->
                <div class="space-y-1.5">
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Changes:</span>
                    <input
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.obstacle || ''"
                      @input="handleVolumeSceneEdit(i, 'obstacle', $event.target.value)"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Location:</span>
                    <input
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.location || ''"
                      @input="handleVolumeSceneEdit(i, 'location', $event.target.value)"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Payoff:</span>
                    <input
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.payoff || ''"
                      @input="handleVolumeSceneEdit(i, 'payoff', $event.target.value)"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Words:</span>
                    <input
                      type="number"
                      min="100"
                      max="5000"
                      step="50"
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.estimatedWords || 800"
                      @input="handleVolumeSceneEdit(i, 'estimatedWords', parseInt($event.target.value) || 800)"
                    />
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-text-hint font-ui w-16 shrink-0">Pacing:</span>
                    <select
                      class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                      :value="scene.pacing || 'medium'"
                      @change="handleVolumeSceneEdit(i, 'pacing', $event.target.value)"
                    >
                      <option value="slow">slow</option>
                      <option value="medium">medium</option>
                      <option value="fast">fast</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Read-only characterWants full-width display -->
              <div v-if="scene.characterWants && Object.keys(scene.characterWants).length > 0" class="text-xs text-text-hint font-body border-t border-border-subtle pt-1.5">
                <span class="font-ui text-text-hover">Character Wants:</span>
                <span class="ml-1">{{ formatWants(scene.characterWants) }}</span>
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <button
              class="flex-1 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="handleVolumeConfirmPlan"
            >
              <span class="flex items-center justify-center gap-2">
                <BaseIcon name="play" :size="16" />
                Confirm & Start Writing
              </span>
            </button>
            <button
              class="px-4 py-2.5 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="handleVolumeReset"
            >Cancel</button>
          </div>
        </div>

        <!-- WRITING STATE -->
        <div v-if="volumeGenerator.phase.value === 'writing'" class="p-4 space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-text-hint font-ui">
              <span>{{ getPhaseLabel(volumeGenerator.phase.value) }} — Scene {{ volumeCurrentScene }} of {{ volumeTotalScenes }}</span>
              <span>{{ volumeTotalScenes > 0 ? Math.round((volumeCurrentScene / volumeTotalScenes) * 100) : 0 }}%</span>
            </div>
            <div class="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div class="h-full bg-accent rounded-full transition-all duration-300 ease-out" :style="{ width: volumeTotalScenes > 0 ? (volumeCurrentScene / volumeTotalScenes) * 100 + '%' : '0%' }"></div>
            </div>
            <div v-if="volumeGenerator.progress.statusText" class="text-[11px] text-text-hint font-ui text-center italic mt-1.5">
              {{ volumeGenerator.progress.statusText }}
            </div>
          </div>

          <div class="rounded-lg bg-bg-tertiary border border-border-subtle max-h-64 overflow-y-auto scrollbar-thin">
            <div class="p-3 text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">
              {{ volumeStreamingText || 'Writing...' }}
              <BaseIcon v-if="volumeStreamingText" name="loader-2" :size="12" class="animate-spin inline ml-1 text-accent" />
            </div>
          </div>

          <button
            class="w-full py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeReset"
          >Cancel</button>
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
          >Cancel</button>
        </div>

        <!-- SCENE REVIEW STATE -->
        <div v-if="volumeGenerator.phase.value === 'scene-review'" class="p-4 space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-text-hint font-ui">
              <span>Scene Review — Scene {{ volumeGenerator.currentSceneResult.value?.scene?.sceneNumber || '...' }}: {{ volumeGenerator.currentSceneResult.value?.scene?.title || '...' }}</span>
            </div>
            <div class="rounded-lg bg-bg-tertiary border border-border-subtle max-h-64 overflow-y-auto scrollbar-thin">
              <div class="p-3 text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">
                {{ volumeGenerator.currentSceneResult.value?.fullProse || '...' }}
                <BaseIcon v-if="volumeGenerator.currentSceneResult.value?.fullProse" name="loader-2" :size="12" class="animate-spin inline ml-1 text-accent" />
              </div>
            </div>
          </div>

          <div v-if="!showReRequestInput" class="flex gap-2">
            <button
              class="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="handleApproveScene"
            >
              <span class="flex items-center justify-center gap-2"><BaseIcon name="check" :size="16" /> Approve</span>
            </button>
            <button
              class="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="handleRejectScene"
            >
              <span class="flex items-center justify-center gap-2"><BaseIcon name="x" :size="16" /> Reject</span>
            </button>
            <button
              class="flex-1 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-500 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
              @click="showReRequestInput = true"
            >
              <span class="flex items-center justify-center gap-2"><BaseIcon name="pencil" :size="16" /> Re-request</span>
            </button>
          </div>

          <div v-if="showReRequestInput" class="space-y-2">
            <textarea
              v-model="reRequestEdits"
              placeholder="Describe what to change in this scene..."
              class="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
              rows="3"
            />
            <div class="flex gap-2">
              <button
                class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
                :disabled="!reRequestEdits.trim()"
                @click="handleRerequestScene"
              >
                <span class="flex items-center justify-center gap-2"><BaseIcon name="refresh" :size="16" /> Submit Revisions</span>
              </button>
              <button
                class="px-4 py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
                @click="showReRequestInput = false"
              >Cancel</button>
            </div>
          </div>

          <button
            class="w-full py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeReset"
          >Cancel</button>
        </div>

        <!-- CONSISTENCY CHECK STATE -->
        <div v-if="volumeGenerator.phase.value === 'consistency-check'" class="p-8 text-center space-y-4">
          <div class="flex items-center justify-center gap-3 py-8">
            <BaseIcon name="loader-2" :size="24" class="animate-spin text-accent" />
            <span class="text-lg text-text-primary font-ui animate-pulse">Checking continuity...</span>
          </div>
          <p class="text-sm text-text-hint font-body">
            {{ volumeGenerator.progress.statusText || 'Comparing character and location depictions across all scenes' }}
          </p>
        </div>

        <!-- COMPLETE STATE -->
        <div v-if="volumeGenerator.phase.value === 'complete'" class="p-4 space-y-4">

          <!-- Scene list header with inline stats -->
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs uppercase tracking-widest text-text-hint font-ui">
              Scenes ({{ volumeGenerator.writtenScenes.value.length }})
              <span class="font-normal tracking-normal text-text-hint/60">· {{ totalWordsWritten.toLocaleString() }} words</span>
            </h3>
            <div class="flex items-center gap-1.5">
              <div v-if="volumeTotalConsistencyIssues > 0">
                <button
                  class="text-[10px] text-yellow-400 font-ui flex items-center gap-1 hover:text-yellow-300 focus:outline-none focus:ring-1 focus:ring-accent rounded"
                  @click="consistencyModalOpen = true"
                >
                  <BaseIcon name="alert-triangle" :size="10" />
                  {{ volumeTotalConsistencyIssues }}
                </button>
              </div>
              <div v-else class="text-[10px] text-green-400/60 font-ui flex items-center gap-1">
                <BaseIcon name="check-circle" :size="10" />
                ok
              </div>
            </div>
          </div>

          <!-- Scene list -->
          <div class="rounded-lg border border-border-subtle overflow-hidden">
            <div
              v-for="(scene, i) in volumeGenerator.writtenScenes.value"
              :key="i"
              class="px-3 py-2.5 border-b border-border-subtle last:border-b-0 cursor-pointer transition-colors hover:bg-surface-hover"
              :class="i === selectedSceneIndex ? 'border-l-2 border-accent bg-bg-secondary' : 'border-l-2 border-transparent'"
              @click="selectedSceneIndex = i"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold text-text-primary font-ui truncate">Scene {{ i + 1 }}: {{ scene.title }}</span>
                <span class="text-[10px] text-text-hint/60 font-ui whitespace-nowrap">{{ scene.prose.split(/\s+/).length }} words</span>
              </div>
            </div>
          </div>

          <!-- Selected scene actions -->
          <div v-if="selectedSceneIndex >= 0" class="flex gap-1.5">
            <button
              class="flex-1 py-1.5 px-2 bg-yellow-600/20 text-yellow-400 rounded-md text-xs font-medium hover:bg-yellow-600/30 transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5"
              @click="handleRegenerateScene(selectedSceneIndex)"
            >
              <BaseIcon name="refresh-cw" :size="12" /> Re-generate Scene {{ selectedSceneIndex + 1 }}
            </button>
          </div>

          <!-- Primary action -->
          <button
            class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeReset"
          >
            <span class="flex items-center justify-center gap-2"><BaseIcon name="plus" :size="16" /> Generate Another</span>
          </button>

          <!-- Secondary actions -->
          <div class="flex gap-1.5">
            <button class="flex-1 py-1.5 px-2 bg-bg-tertiary text-text-secondary rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5" @click="showVolumeReadModal = true">
              <BaseIcon name="book-open" :size="12" /> Read
            </button>
            <button class="flex-1 py-1.5 px-2 bg-bg-tertiary text-text-secondary rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5" @click="handleVolumeSaveToManuscript">
              <BaseIcon name="save" :size="12" /> Save
            </button>
            <button class="flex-1 py-1.5 px-2 bg-bg-tertiary text-text-secondary rounded-md text-xs font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1.5" @click="emit('openChapters')">
              <BaseIcon name="list" :size="12" /> Chapters
            </button>
          </div>

          <!-- Tertiary / Export actions -->
          <div class="flex gap-1.5">
            <button class="flex-1 py-1 px-2 bg-transparent text-text-hint rounded text-[10px] font-medium hover:text-text-secondary hover:bg-bg-tertiary transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1" @click="handleVolumeExportTxt">
              <BaseIcon name="file-text" :size="10" /> .txt
            </button>
            <button class="flex-1 py-1 px-2 bg-transparent text-text-hint rounded text-[10px] font-medium hover:text-text-secondary hover:bg-bg-tertiary transition-colors font-ui focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-center gap-1" @click="handleVolumeExportMd">
              <BaseIcon name="file-down" :size="10" /> .md
            </button>
          </div>

        </div>

        <!-- ERROR STATE -->
        <div v-if="volumeGenerator.phase.value === 'error'" class="p-4 space-y-4">
          <div class="rounded-lg bg-red-950/20 border border-red-800/30 p-4 text-center space-y-2">
            <BaseIcon name="alert-triangle" :size="24" class="mx-auto text-red-400" />
            <p class="text-sm font-medium text-red-400 font-ui">Generation Failed</p>
            <p class="text-xs text-red-300/70 font-body">{{ volumeGenerator.error.value || 'An unexpected error occurred.' }}</p>
          </div>
          <button
            class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeReset"
          >Try Again</button>
        </div>
      </template>
    </div>

    <!-- ==================== VOLUME READ MODAL ==================== -->
    <div
      v-if="showVolumeReadModal && volumeGenerator.writtenScenes.value.length > 0"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      @click.self="showVolumeReadModal = false"
    >
      <div class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto m-4 scrollbar-thin">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-text-primary font-ui">Generated Story</h2>
          <button class="text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded" @click="showVolumeReadModal = false">
            <BaseIcon name="x" :size="20" />
          </button>
        </div>
        <div class="space-y-6">
          <div v-for="(scene, i) in volumeGenerator.writtenScenes.value" :key="i" class="space-y-2">
            <h3 class="text-sm font-semibold text-accent font-ui">Scene {{ i + 1 }}: {{ scene.title }}</h3>
            <div class="text-sm text-text-primary whitespace-pre-wrap font-body leading-relaxed">{{ scene.prose }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== CONSISTENCY REPORT MODAL ==================== -->
    <div
      v-if="consistencyModalOpen && volumeGenerator.consistencyReport.value"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      @click.self="consistencyModalOpen = false"
    >
      <div class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto m-4 scrollbar-thin">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-text-primary font-ui">Consistency Report</h2>
          <button class="text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded" @click="consistencyModalOpen = false">
            <BaseIcon name="x" :size="20" />
          </button>
        </div>

        <div v-if="volumeGenerator.consistencyReport.value.characterIssues?.length > 0" class="mb-4">
          <h3 class="text-sm font-semibold text-text-primary font-ui mb-2">Character Contradictions</h3>
          <div v-for="(item, i) in volumeGenerator.consistencyReport.value.characterIssues" :key="'char-' + i" class="mb-3 p-3 bg-yellow-950/10 border border-yellow-800/20 rounded-lg">
            <p class="text-xs font-semibold text-yellow-400 font-ui mb-1">{{ item.character }}</p>
            <div v-for="(c, j) in item.contradictions" :key="j" class="text-xs text-text-secondary font-body space-y-0.5 mb-1">
              <p><span class="text-text-hint">[{{ c.type }}]</span> {{ c.description }}</p>
            </div>
          </div>
        </div>

        <div v-if="volumeGenerator.consistencyReport.value.locationIssues?.length > 0">
          <h3 class="text-sm font-semibold text-text-primary font-ui mb-2">Location Contradictions</h3>
          <div v-for="(item, i) in volumeGenerator.consistencyReport.value.locationIssues" :key="'loc-' + i" class="mb-3 p-3 bg-yellow-950/10 border border-yellow-800/20 rounded-lg">
            <p class="text-xs font-semibold text-yellow-400 font-ui mb-1">{{ item.location }}</p>
            <div v-for="(c, j) in item.contradictions" :key="j" class="text-xs text-text-secondary font-body space-y-0.5 mb-1">
              <p><span class="text-text-hint">[{{ c.type }}]</span> {{ c.description }}</p>
            </div>
          </div>
        </div>

        <div v-if="volumeTotalConsistencyIssues === 0" class="text-center py-4">
          <BaseIcon name="check-circle" :size="24" class="mx-auto text-green-400 mb-2" />
          <p class="text-sm text-green-400 font-ui">No contradictions found</p>
        </div>
      </div>
    </div>
  </div>
</template>
