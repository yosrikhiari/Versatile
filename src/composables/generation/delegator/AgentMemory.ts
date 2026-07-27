import { ref, computed } from 'vue'

export function createAgentMemory() {
  // ── Reactive State ─────────────────────────────────────────
  const writeParams = ref(null as any)
  const scenePlan = ref([] as any[])
  const chapterPlan = ref([] as any[])
  const spineArray = ref([] as any[])
  const spineContext = ref('')
  const progress = ref({ statusText: '', percent: 0 } as any)
  const phase = ref('idle')

  const sceneEvalResults = ref([] as any[])
  const inlineEvalEnabled = ref(false)
  const writtenScenes = ref([] as any[])
  const structuredResults = ref([] as any[])
  const hasPendingBatches = ref(false)
  const pendingBatchStart = ref(0)
  const sceneInconsistencies = ref([] as any[])
  const error = ref(null as any)
  const consistencyReport = ref(null as any)
  const currentSceneResult = ref(null as any)
  const currentWriteIndex = ref(0)
  const lastSyncedResultIndex = ref(-1)
  const syncPreview = ref(null as any)
  const rejectedPatterns = ref([] as any[])
  const autoMode = ref(true)
  const sceneReviewMode = ref('auto' as any)
  const currentTaskId = ref(null as any)
  const volumeId = ref(null as any)
  const projectId = ref(null as any)

  // ── Derived State ──────────────────────────────────────────
  const phaseFlags = {
    isIdle: computed(() => phase.value === 'idle'),
    isPlanning: computed(() => phase.value === 'planning'),
    isBootstrapping: computed(() => phase.value === 'bootstrapping'),
    isConfirming: computed(() => phase.value === 'plan-preview'),
    isWriting: computed(() => phase.value === 'writing'),
    isSceneReview: computed(() => phase.value === 'scene-review'),
    isSyncPreview: computed(() => phase.value === 'sync-preview'),
    isConsistencyAudit: computed(() => phase.value === 'consistency-check'),
    isConsistencyFix: computed(() => phase.value === 'consistency-fix'),
    isCommitting: computed(() => phase.value === 'committing'),
    isError: computed(() => phase.value === 'error'),
    isComplete: computed(() => phase.value === 'complete')
  }

  const derived = {
    writtenCount: computed(() => writtenScenes.value.filter((s) => s !== null).length),
    totalSceneCount: computed(() => scenePlan.value.length),
    progressPercent: computed(() => progress.value.percent),
    hasRemainingScenes: computed(() => currentWriteIndex.value < scenePlan.value.length),
    currentScene: computed(() => scenePlan.value[currentWriteIndex.value] ?? null),
    pendingBatchCount: computed(() =>
      Math.max(0, writtenScenes.value.length - lastSyncedResultIndex.value)
    ),
    hasSyncPreview: computed(() => syncPreview.value !== null),
    hasInconsistencies: computed(() => sceneInconsistencies.value.length > 0),
    hasStructuredResults: computed(() => structuredResults.value.length > 0)
  }

  // ── Non-reactive Instances (injected at init) ──────────────
  const instances: Record<string, any> = {
    storyBibleStore: null,
    manuscriptStore: null,
    volumeStore: null,
    storyGraphStore: null,
    director: null,
    bootstrapper: null,
    writer: null,
    critic: null,
    sync: null,
    actLog: null,
    storyDocuments: null,
    consistencyService: null,
    commitService: null,
    sceneInteractionService: null,
    graphBuilder: null
  }

  // ── Service Constants ─────────────────────────────────────
  const constants = {
    SYNC_BATCH_SIZE: 3,
    SCENE_MAX_ATTEMPTS: 2,
    QUALITY_FLOOR_CONSECUTIVE: 3,
    PARALLEL_CHAPTER_LIMIT: 5,
    CONSISTENCY_FIX_ROUNDS: 2
  }

  // ── Convenience Mutators ──────────────────────────────────
  function setPhase(newPhase: any) {
    phase.value = newPhase
  }

  function setProgress(text: any, pct: any) {
    progress.value = { statusText: text, percent: pct }
  }

  function appendScene(sceneData: any) {
    writtenScenes.value = [...writtenScenes.value, sceneData]
  }

  function appendStructured(data: any) {
    structuredResults.value = [...structuredResults.value, data]
  }

  function reset() {
    writeParams.value = null
    scenePlan.value = []
    chapterPlan.value = []
    spineArray.value = []
    spineContext.value = ''
    progress.value = { statusText: '', percent: 0 }
    phase.value = 'idle'
    sceneEvalResults.value = []
    inlineEvalEnabled.value = false
    writtenScenes.value = []
    structuredResults.value = []
    hasPendingBatches.value = false
    pendingBatchStart.value = 0
    sceneInconsistencies.value = []
    error.value = null
    consistencyReport.value = null
    currentSceneResult.value = null
    currentWriteIndex.value = 0
    lastSyncedResultIndex.value = -1
    syncPreview.value = null
    rejectedPatterns.value = []
  }

  return {
    writeParams,
    scenePlan,
    chapterPlan,
    spineArray,
    spineContext,
    progress,
    phase,
    sceneEvalResults,
    inlineEvalEnabled,
    writtenScenes,
    structuredResults,
    hasPendingBatches,
    pendingBatchStart,
    sceneInconsistencies,
    error,
    consistencyReport,
    currentSceneResult,
    currentWriteIndex,
    lastSyncedResultIndex,
    syncPreview,
    rejectedPatterns,
    autoMode,
    sceneReviewMode,
    currentTaskId,
    volumeId,
    projectId,
    phaseFlags,
    derived,
    constants,
    instances,
    setPhase,
    setProgress,
    appendScene,
    appendStructured,
    reset
  }
}
