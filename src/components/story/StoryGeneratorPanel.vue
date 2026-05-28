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

const emit = defineEmits(['openChapters'])

const projectStore = useProjectStore()
const storyBibleStore = useStoryBibleStore()
const manuscriptStore = useManuscriptStore()
const volumeGenerator = useVolumeStoryGenerator()
const { exportAsText, exportAsMarkdown } = useStoryExport()
const sparkStore = useSparkStore()
const { getTurns } = useCompactConversation()

const tab = ref('brainstorm')

const mode = computed(() => tab.value === 'volume' ? 'volume' : 'chapter')
const genre = ref('')
const tone = ref('')
const wordTarget = ref(3500)

const sparkContext = ref('')

const hasSparkResponse = computed(() => {
  if (sparkStore.currentContent || sparkStore.currentStreamingContent || sparkStore.currentOutline) return true
  const turns = getTurns('spark_default')
  return turns.some(t => t.role === 'assistant')
})

function handleSendSparkToGenerator() {
  const turns = getTurns('spark_default')
  const lastAssistant = [...turns].reverse().find(t => t.role === 'assistant')
  sparkContext.value = lastAssistant?.content
    || sparkStore.currentStreamingContent
    || sparkStore.currentContent
    || ''
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

const consistencyModalOpen = ref(false)

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

// ----- Volume pipeline -----
async function handleVolumeGenerate() {
  if (!hasSynopsis.value || !projectStore.currentProjectId) return

  volumeStreamingText.value = ''
  volumeCurrentScene.value = 0
  volumeTotalScenes.value = 0
  volumeStoryArc.value = null
  volumeStoryContract.value = ''
  volumePlanEdits.value = []

  const result = await volumeGenerator.startGeneration({
    projectId: projectStore.currentProjectId,
    synopsis: synopsis.value,
    genre: genre.value,
    tone: tone.value,
    wordTarget: wordTarget.value,
    singleChapter: mode.value === 'chapter',
    sparkContext: sparkContext.value,
    onPhaseChange: (p) => {},
    onChunk: ({ sceneIndex, total, chunk, fullProse, scene }) => {
      volumeCurrentScene.value = sceneIndex
      volumeTotalScenes.value = total
      volumeStreamingText.value = fullProse
    }
  })

  if (result) {
    volumeStoryArc.value = result.storyArc
    volumeStoryContract.value = result.storyContract
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

function handleVolumeReset() {
  volumeGenerator.reset()
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
    scenes: scenes.map((s, i) => ({ number: i + 1, brief: { title: s.title }, prose: s.prose }))
  })
}

async function handleVolumeExportMd() {
  const scenes = volumeGenerator.writtenScenes.value
  if (scenes.length === 0) return
  await exportAsMarkdown({
    title: `Generated Story`,
    scenes: scenes.map((s, i) => ({ number: i + 1, brief: { title: s.title }, prose: s.prose }))
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
    bootstrapping: 'Bootstrapping Entities',
    planning: 'Planning Scenes',
    'plan-preview': 'Review Plan',
    writing: 'Writing',
    'consistency-check': 'Checking Consistency',
    complete: 'Complete',
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
      <div class="flex items-center gap-1">
        <button
          :class="[
            'px-4 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent font-ui',
            tab === 'brainstorm'
              ? 'bg-gradient-to-b from-accent to-[#c09a5e] text-bg-primary shadow-warm-sm btn-elevated'
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary btn-ghost'
          ]"
          @click="tab = 'brainstorm'"
        >Brainstorm</button>
        <button
          :class="[
            'px-4 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent font-ui',
            tab === 'chapter'
              ? 'bg-gradient-to-b from-accent to-[#c09a5e] text-bg-primary shadow-warm-sm btn-elevated'
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary btn-ghost'
          ]"
          @click="tab = 'chapter'"
        >Chapter</button>
        <button
          :class="[
            'px-4 py-2 rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent font-ui',
            tab === 'volume'
              ? 'bg-gradient-to-b from-accent to-[#c09a5e] text-bg-primary shadow-warm-sm btn-elevated'
              : 'bg-bg-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary btn-ghost'
          ]"
          @click="tab = 'volume'"
        >Volume</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <!-- ==================== BRAINSTORM TAB ==================== -->
      <div v-if="tab === 'brainstorm'" class="h-full flex flex-col">
        <div class="flex-1 overflow-y-auto">
          <SparkPanel embedded />
        </div>
        <div v-if="hasSparkResponse" class="px-4 py-3 border-t border-border-subtle bg-bg-secondary">
          <button
            class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleSendSparkToGenerator"
          >
            <span class="flex items-center justify-center gap-2">
              <BaseIcon name="send" :size="16" />
              Send to Generator
            </span>
          </button>
        </div>
      </div>

      <!-- ==================== CHAPTER / VOLUME TABS ==================== -->
      <template v-if="tab !== 'brainstorm'">
      <!-- ==================== IDLE / CONTROLS ==================== -->
      <template v-if="volumeGenerator.phase.value === 'idle' || volumeGenerator.phase.value === 'error'">
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
            <label class="block text-xs uppercase tracking-widest text-text-hint font-ui mb-2">Words per Chapter</label>
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
          <div v-if="sparkContext" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
            <BaseIcon name="sparkles" :size="14" class="text-accent shrink-0" />
            <span class="text-xs text-text-secondary font-ui flex-1">Spark context active</span>
            <button
              class="text-text-hover hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent rounded"
              @click="clearSparkContext"
            >
              <BaseIcon name="x" :size="14" />
            </button>
          </div>

          <button
            :disabled="!hasSynopsis || volumeGenerator.phase.value !== 'idle'"
            class="w-full py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-ui focus:outline-none focus:ring-2 focus:ring-accent"
            @click="handleVolumeGenerate"
          >
            <span class="flex items-center justify-center gap-2">
              <BaseIcon name="wand-2" :size="16" />
              {{ mode === 'chapter' ? 'Generate Chapter' : 'Generate Volume' }}{{ sparkContext ? ' with Spark context' : '' }}
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
        <!-- BOOTSTRAPPING / PLANNING -->
        <div v-if="volumeGenerator.phase.value === 'bootstrapping' || volumeGenerator.phase.value === 'planning'" class="p-8 text-center space-y-4">
          <div class="flex items-center justify-center gap-3 py-8">
            <BaseIcon name="loader-2" :size="24" class="animate-spin text-accent" />
            <span class="text-lg text-text-primary font-ui animate-pulse">{{ volumeGenerator.phase.value === 'bootstrapping' ? 'Bootstrapping entities...' : 'Architecting story...' }}</span>
          </div>
          <p class="text-sm text-text-hint font-body">
            {{ volumeGenerator.phase.value === 'bootstrapping' ? 'Checking story bible, generating missing entities' : 'Designing scene structure with tension arc' }}
          </p>
        </div>

        <!-- PLAN PREVIEW -->
        <div v-if="volumeGenerator.phase.value === 'plan-preview'" class="p-4 space-y-4">
          <div class="rounded-lg bg-bg-secondary border border-border-subtle p-4 space-y-3">
            <h3 class="text-sm font-semibold text-text-primary font-ui">{{ mode === 'chapter' ? 'Chapter' : 'Story' }} Plan — {{ volumeGenerator.scenePlan.value.length }} scene{{ volumeGenerator.scenePlan.value.length === 1 ? '' : 's' }}</h3>
            <p class="text-xs text-text-hint font-body">You can edit scene goals, obstacles, and characters before writing begins.</p>
          </div>

          <div class="space-y-2">
            <h3 class="text-xs uppercase tracking-widest text-text-hint font-ui">Scenes</h3>
            <div
              v-for="(scene, i) in (volumePlanEdits.length > 0 ? volumePlanEdits : volumeGenerator.scenePlan.value)"
              :key="i"
              class="rounded-lg bg-bg-secondary border border-border-subtle p-3 space-y-1.5"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-semibold text-text-primary font-ui">Scene {{ scene.sceneNumber || i + 1 }}: {{ scene.title }}</span>
                <span :class="['px-2 py-0.5 rounded text-xs font-ui', getTensionColor(scene.tension)]">{{ scene.tension }}</span>
              </div>
              <div class="space-y-1">
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-text-hint font-ui w-16 shrink-0">Goal:</span>
                  <input
                    class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                    :value="scene.goal || ''"
                    @input="handleVolumeSceneEdit(i, 'goal', $event.target.value)"
                  />
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-text-hint font-ui w-16 shrink-0">Obstacle:</span>
                  <input
                    class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                    :value="scene.obstacle || ''"
                    @input="handleVolumeSceneEdit(i, 'obstacle', $event.target.value)"
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
                  <span class="text-text-hint font-ui w-16 shrink-0">Location:</span>
                  <input
                    class="flex-1 bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary font-body focus:outline-none focus:ring-1 focus:ring-accent"
                    :value="scene.location || ''"
                    @input="handleVolumeSceneEdit(i, 'location', $event.target.value)"
                  />
                </div>
              </div>
              <p class="text-xs text-text-hint font-body">~{{ scene.estimatedWords || 800 }} words</p>
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

        <!-- CONSISTENCY CHECK STATE -->
        <div v-if="volumeGenerator.phase.value === 'consistency-check'" class="p-8 text-center space-y-4">
          <div class="flex items-center justify-center gap-3 py-8">
            <BaseIcon name="loader-2" :size="24" class="animate-spin text-accent" />
            <span class="text-lg text-text-primary font-ui animate-pulse">Checking continuity...</span>
          </div>
          <p class="text-sm text-text-hint font-body">Comparing character and location depictions across all scenes</p>
        </div>

        <!-- COMPLETE STATE -->
        <div v-if="volumeGenerator.phase.value === 'complete'" class="p-4 space-y-4">
          <div class="rounded-lg bg-bg-secondary border border-border-subtle p-4 text-center space-y-2">
            <div :class="['inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border', volumeTotalConsistencyIssues > 0 ? 'text-yellow-400 bg-yellow-950/30 border-yellow-800/30' : 'text-green-400 bg-green-950/30 border-green-800/30']">
              <BaseIcon :name="volumeTotalConsistencyIssues > 0 ? 'alert-triangle' : 'check-circle'" :size="14" />
              Consistency: {{ volumeTotalConsistencyIssues }} issue{{ volumeTotalConsistencyIssues === 1 ? '' : 's' }}
            </div>
            <p class="text-sm text-text-secondary font-body">{{ volumeGenerator.writtenScenes.value.length }} scenes written</p>
          </div>

          <div v-if="volumeTotalConsistencyIssues > 0" class="rounded-lg bg-yellow-950/10 border border-yellow-800/20 p-3">
            <button
              class="text-xs text-yellow-400 font-ui flex items-center gap-1 hover:text-yellow-300 focus:outline-none focus:ring-1 focus:ring-accent rounded"
              @click="consistencyModalOpen = true"
            >
              <BaseIcon name="list-checks" :size="12" />
              View {{ volumeTotalConsistencyIssues }} contradiction{{ volumeTotalConsistencyIssues === 1 ? '' : 's' }}
            </button>
          </div>

          <div class="flex gap-2">
            <button class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent" @click="showVolumeReadModal = true">
              <span class="flex items-center justify-center gap-2"><BaseIcon name="book-open" :size="16" /> Read Story</span>
            </button>
            <button class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent" @click="handleVolumeSaveToManuscript">
              <span class="flex items-center justify-center gap-2"><BaseIcon name="save" :size="16" /> Save to Manuscript</span>
            </button>
            <button class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent" @click="emit('openChapters')">
              <span class="flex items-center justify-center gap-2"><BaseIcon name="list" :size="16" /> View in Chapters</span>
            </button>
            <button class="flex-1 py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent" @click="handleVolumeExportTxt">
              <span class="flex items-center justify-center gap-2"><BaseIcon name="file-text" :size="16" /> Export .txt</span>
            </button>
          </div>
          <div class="flex gap-2">
            <button class="flex-1 py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent" @click="handleVolumeExportMd">
              <span class="flex items-center justify-center gap-2"><BaseIcon name="file-down" :size="16" /> Export .md</span>
            </button>
            <button class="flex-1 py-2 bg-bg-tertiary text-text-secondary rounded-lg font-medium hover:bg-surface-hover transition-colors font-ui focus:outline-none focus:ring-2 focus:ring-accent" @click="handleVolumeReset">
              <span class="flex items-center justify-center gap-2"><BaseIcon name="plus" :size="16" /> Generate Another</span>
            </button>
          </div>

          <!-- Scene list -->
          <div class="space-y-2">
            <h3 class="text-xs uppercase tracking-widest text-text-hint font-ui">Scenes</h3>
            <div
              v-for="(scene, i) in volumeGenerator.writtenScenes.value"
              :key="i"
              class="rounded-lg bg-bg-secondary border border-border-subtle p-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-text-primary font-ui">Scene {{ i + 1 }}: {{ scene.title }}</span>
                <span class="text-xs text-text-hint font-ui">{{ scene.prose.split(/\s+/).length }} words</span>
              </div>
            </div>
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
