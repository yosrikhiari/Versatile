import { ref, computed, readonly } from 'vue'

export function createAgentMemory() {
  // ── Reactive State ─────────────────────────────────────────
  const writeParams = ref(null as any)
  const scenePlan = ref([] as any[])
  const chapterPlan = ref([] as any[])
  const spineArray = ref([] as any[])
  const spineContext = ref('')
  const progress = ref({ statusText: '', percent: 0 } as any)
  const phase = ref('idle')

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
    graphBuilder: null,
    sessionBudget: null
  }

  // No `constants` block here. It used to carry a second copy of
  // SYNC_BATCH_SIZE / SCENE_MAX_ATTEMPTS / QUALITY_FLOOR_CONSECUTIVE /
  // PARALLEL_CHAPTER_LIMIT / CONSISTENCY_FIX_ROUNDS that nothing ever read, and
  // two of the five had already drifted from the values that actually run:
  // PARALLEL_CHAPTER_LIMIT said 5 where `context/spine.ts` computes 1 or 3 by
  // provider, and SYNC_BATCH_SIZE said 3 after batching became chapter-aligned.
  // The real ones live next to the code that uses them — `useVolumeStoryGenerator`
  // for the first three, `context/spine.ts` and `context/sceneContext.ts` for the
  // last two. Import from there rather than restating them.

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
    instances.sessionBudget?.reset()
    writeParams.value = null
    scenePlan.value = []
    chapterPlan.value = []
    spineArray.value = []
    spineContext.value = ''
    progress.value = { statusText: '', percent: 0 }
    phase.value = 'idle'
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
    // Read-only on the way out. `phase` is the state machine's own ref, and
    // handing it out writable is how six real transitions ended up bypassing
    // the machine entirely — `SceneInteractionService` simply assigned to it.
    // Everything outside the Delegator reads this; only `setPhase` (and so only
    // `transitionTo`, and so only `dispatch`/`restore`) can move it.
    phase: readonly(phase),
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
    instances,
    setPhase,
    setProgress,
    appendScene,
    appendStructured,
    reset
  }
}
