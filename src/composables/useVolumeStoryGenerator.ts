import { ref, reactive, computed } from 'vue'
import { formatEvalFeedback } from '../services/evalFeedback'
import { useAutoPromptAdjuster } from './useAutoPromptAdjuster'
import { autoAdjustPrompt } from '../evaluation/autoPromptAdjuster'
import { deriveVerdict } from '../services/criticVerdict'
import { getDefaultThreshold } from '../config/evalDimensions'
import {
  gateDimensionCoverage,
  gateScoreDistribution,
  gateProseQuality,
  countWords,
  duplicateRatio
} from '../services/evalGates'
import { useProjectStore } from '../stores/projectStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useEvalStore } from '../stores/evalStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStore } from '../stores/volumeStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useBranchStore } from '../stores/branchStore'
import { useStoryDirector } from './useStoryDirector'
import { useEntityBootstrapper } from './useEntityBootstrapper'
import { useStoryWriter, isUnsalvageableProse } from './useStoryWriter'
import { useStoryCritic } from './useStoryCritic'
import { useChapterGenerationSync } from './useChapterGenerationSync'
import { useStoryDocuments } from './useStoryDocuments'
import { useActivityLog } from './useActivityLog'
import { useEvalPersistence } from './useEvalPersistence'
import { langfuseService } from '../services/langfuseService'
import { generateRelationships } from './generation/generators/relationships'
import { groupNetworkByVolume } from './useVolumeGrouping'
import { scopeBibleToVolume } from '../services/volumeScope'
import { rollupProjectDigests, buildEarlierChaptersBlock } from '../services/generation/digestContext'

// How many recent scenes stay in the writer's log at full detail. Chapters that
// fall entirely outside this window are carried by their digests instead — the
// boundary has to be one number, or the two blocks overlap or leave a gap.
const RECENT_SCENE_LOG_LIMIT = 20
import { shouldChunkScene, splitSceneIntoChunks, mergeChunkProse } from './generation/sceneChunker'
import { getFailedSubsections, batchCreatePlanStructure } from '../services/db-structure'
import {
  saveGenRun,
  clearGenRun,
  getGenRun,
  updateGenRunStage,
  runStageWithHeartbeat,
  makeInitialGenState,
  STAGE_IDLE_TIMEOUT_MS
} from '../services/db-generation'
import { aiGenerate, aiGenerateJson, resolveFeatureConfig } from './useAiService'
import { FEATURES, PROVIDERS } from '../config/ai'
import { getEmbedding } from '../services/embeddingService'
import { cosineSimilarity } from '../services/ollamaService'
import {
  isOllamaProvider,
  PARALLEL_CHAPTER_LIMIT,
  formatFullSpineEntry,
  SPINE_ENTRY_SCHEMA,
  compressSpine,
  SPINE_TIMEOUT_MS,
  fallbackSpineEntry,
  generateSpine
} from './generation/context/spine'
import {
  buildExistingEntitiesBlob,
  buildSceneEntitiesBlob,
  EMBEDDING_CONTEXT_MAX_TOKENS,
  PROSE_EXCERPT_MAX_SCENES,
  buildEmbeddingContext,
  selectRelevantPriorScenes,
  buildRetrievalContext,
  buildResearchContext
} from './generation/context/sceneContext'
import { buildRagOptions } from '../services/researchScope'
import { parallelWithLimit, computeSummary } from './generation/utils'
import { CommitService } from './generation/commit'
import { ConsistencyService } from './generation/consistency'
import {
  createAbortScope,
  isAbortError,
  isFatalRunError,
  rethrowIfFatal,
  isConfigurationError
} from './generation/lifecycle'
import { LiveDraftBridge, proseToHtml, countProseWords } from './generation/writing'
import { SceneInteractionService } from './generation/interaction'
import { SceneSpeculativeCache } from '../services/speculativeGenManager'
import { SessionBudgetExceededError } from '../services/aiProviderBudget'
import {
  surveyManuscript,
  briefForScene,
  neighbourContext,
  emptyReport,
  describeReport
} from './generation/continuation'
import { useDelegatorGeneration } from './generation/delegator'
import { useDriftTriggeredEval } from './useDriftTriggeredEval'
import { ActiveLearningBridge } from './generation/activeLearning'
import { buildCloudDisclosure, canUseCloudEscalation, requestCloudEscalation } from '../services/cloudEscalation'

import { getResumableRun } from './generation/checkpoint'
import { buildPreliminaryEdges } from './generation/graph'
import {
  finalizeStoryArtifacts,
  describeFinalizeReport
} from '../services/generation/finalizeArtifacts'
import { RunHealth, describeRunHealth } from '../services/generation/runHealth'
import {
  snapshotBeforeRun,
  saveRunStateSnapshot,
  archiveRun
} from '../services/generation/runArtifacts'
import { useStateSummarizer } from './useStateSummarizer'

// Map a global scene index to its section (chapter) index using each section's
// actual scene count — replaces the old Math.floor(i / 3) that silently assumed
// exactly 3 scenes per chapter and mis-attributed word counts otherwise.
function sectionIndexForScene(sections: any, sceneIndex: any) {
  let offset = 0
  for (let i = 0; i < sections.length; i++) {
    const count = (sections[i].scenes && sections[i].scenes.length) || 0
    if (sceneIndex < offset + count) return i
    offset += count
  }
  return Math.max(0, sections.length - 1)
}

const MAX_REJECTED_PATTERNS = 5
const SYNC_BATCH_SIZE = 3
const PARALLEL_SCENE_LIMIT = 2
// One-click quality guardrails: rewrite a scene that fails critique up to this
// many times, and abort the whole run if this many scenes fail back-to-back
// (signals a broken model/critic rather than letting it churn out garbage).
const SCENE_MAX_ATTEMPTS = 2
const QUALITY_FLOOR_CONSECUTIVE = 3
// Consecutive scenes that may fail to produce ANY prose before the run gives up.
// Distinct from the quality floor above: that judges prose the model wrote, this
// catches a pipeline that is not writing prose at all.
const WRITE_FAILURE_STREAK_ABORT = 4

/**
 * A scene with no words is a failed scene, not a finished one.
 *
 * Nothing used to assert this. The writer can return an empty string — every
 * chunked section failing produced exactly that — and the commit path only
 * checked for a thrown error, so it wrote `content: ''` with
 * `contentStatus: 'generated'` and reported success. A whole book generated that
 * way looks, to every downstream check, like a book that was written.
 */
function assertProse(prose: any, scene: any) {
  if (prose && String(prose).trim()) return
  throw new Error(
    `Scene "${scene?.title || scene?.sceneNumber || '?'}" returned no prose — treating as failed.`
  )
}

function attemptScore(ev: any) {
  return ev && !ev.evalUnavailable && typeof ev.score === 'number' ? ev.score : -1
}
function isCleanPass(ev: any) {
  return !!(ev && !ev.evalUnavailable && ev.pass)
}

function detectSceneConflicts(results: any) {
  if (results.length < 2) return []
  const allFacts = []
  for (const r of results) {
    if (!r.success) continue
    for (const f of r.keyFacts || []) {
      allFacts.push({ fact: f, sceneIndex: r.sceneIndex })
    }
  }
  const conflicts = []
  for (let i = 0; i < allFacts.length; i++) {
    for (let j = i + 1; j < allFacts.length; j++) {
      const af = allFacts[i],
        bf = allFacts[j]
      if (af.sceneIndex === bf.sceneIndex) continue
      const normA = af.fact
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
      const normB = bf.fact
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
      if (normA === normB) continue
      const wordsA = normA.split(/\s+/).filter((w: any) => w.length > 3)
      const wordsB = normB.split(/\s+/).filter((w: any) => w.length > 3)
      if (wordsA.length < 2 || wordsB.length < 2) continue
      const overlap = wordsA.filter((w: any) => wordsB.includes(w)).length
      const ratio = overlap / Math.min(wordsA.length, wordsB.length)
      if (ratio >= 0.5) {
        conflicts.push({
          sceneA: af.sceneIndex,
          sceneB: bf.sceneIndex,
          factA: af.fact,
          factB: bf.fact
        })
      }
    }
  }
  return conflicts
}

async function resolveSceneConflicts(conflicts: any[], results: any[]) {
  let changed = false
  for (const c of conflicts) {
    const resultA = results.find((r) => r.sceneIndex === c.sceneA)
    const resultB = results.find((r) => r.sceneIndex === c.sceneB)
    if (!resultA?.success || !resultB?.success) continue

    const scoreA = resultA.eval?.score ?? 0
    const scoreB = resultB.eval?.score ?? 0

    if (scoreA >= scoreB) {
      const idx = resultB.keyFacts.indexOf(c.factB)
      if (idx !== -1) {
        resultB.keyFacts.splice(idx, 1)
        changed = true
      }
    } else {
      const idx = resultA.keyFacts.indexOf(c.factA)
      if (idx !== -1) {
        resultA.keyFacts.splice(idx, 1)
        changed = true
      }
    }
  }
  return changed
}

/**
 * Load evaluation history for a project and seed the prompt adjuster with
 * cumulative focus instructions. This enables cross-run learning by
 * feeding past evaluation data into the adjuster at run start.
 */
async function seedPromptAdjusterFromHistory(projectId: string, workspaceType: string, promptAdjuster: any) {
  if (!projectId) return
  try {
    const evalPersistence = (await import('./useEvalPersistence')).useEvalPersistence()
    const evalHistory = await evalPersistence.loadHistory(projectId)
    if (evalHistory && evalHistory.length > 0) {
      const result = autoAdjustPrompt(evalHistory, {
        workspaceType,
        pastGivenHints: promptAdjuster.allGivenHints.value
      })
      promptAdjuster.focusInstructions.value = result.focusInstructions
      promptAdjuster.givenHints.value = result.givenHints
      promptAdjuster.allGivenHints.value = [...promptAdjuster.allGivenHints.value, ...result.givenHints]
    }
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Failed to seed prompt adjuster from history:', err)
  }
}

/**
 * Rehydrate the prompt adjuster from persisted history instead of clearing.
 * Used when resetting the generator to preserve cross-run hint history.
 */
async function rehydratePromptAdjuster(projectId: string, workspaceType: string, promptAdjuster: any) {
  if (!projectId) {
    promptAdjuster.reset()
    return
  }
  try {
    const evalPersistence = (await import('./useEvalPersistence')).useEvalPersistence()
    const evalHistory = await evalPersistence.loadHistory(projectId)
    promptAdjuster.allGivenHints.value = []
    promptAdjuster.focusInstructions.value = ''
    promptAdjuster.givenHints.value = []
    if (evalHistory && evalHistory.length > 0) {
      const result = autoAdjustPrompt(evalHistory, {
        workspaceType,
        pastGivenHints: []
      })
      promptAdjuster.focusInstructions.value = result.focusInstructions
      promptAdjuster.givenHints.value = result.givenHints
      promptAdjuster.allGivenHints.value = result.givenHints
    }
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Failed to rehydrate prompt adjuster:', err)
    promptAdjuster.reset()
  }
}

/**
 * Clear the evalStore and seed it from persisted history for the current project.
 * This scopes evalStore by project and prevents cross-project contamination.
 */
async function clearAndSeedEvalStore(projectId: string, evalStore: any) {
  if (!projectId) {
    evalStore.clearResults()
    return
  }
  try {
    const evalPersistence = (await import('./useEvalPersistence')).useEvalPersistence()
    const evalHistory = await evalPersistence.loadHistory(projectId)
    evalStore.clearResults()
    if (evalHistory && evalHistory.length > 0) {
      // Convert persisted eval results to the format expected by evalStore
      // The evalStore expects entries with sceneIndex, score, dimensionScores, etc.
      evalStore.setResults(evalHistory.map((e: any) => ({
        sceneIndex: e.sceneId,
        passed: e.score != null && e.score >= 7,
        score: e.score,
        dimensionScores: e.dimensionScores,
        topIssues: e.issues || [],
        workspaceType: e.workspaceType
      })))
    }
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Failed to seed evalStore from history:', err)
    evalStore.clearResults()
  }
}

export function useVolumeStoryGenerator() {
  const settings = useSettingsStore()
  const progress = reactive({ current: 0, total: 0, sceneLabel: '', statusText: '' })
  const error = ref<string | null>(null)
  const volumeId = ref<string | null>(null)
  const scenePlan = ref<any[]>([])
  const chapterPlan = ref<any[]>([])
  const spineArray = ref<any[]>([])
  const spineContext = ref('')
  const writtenScenes = ref<any[]>([])
  const runCreatedSectionIds = ref<Set<string>>(new Set())
  const consistencyReport = ref<any | null>(null)
  const rejectedPatterns = ref<any[]>([])
  const syncPreview = ref<any[]>([])
  let structuredResults: any[] = []
  const hasPendingBatches = ref(false)
  const pendingBatchStart = ref(0)
  const lastSyncedResultIndex = ref(0)
  const writeParams = ref<any | null>(null)

  // The run's research scope, held here rather than only on writeParams because
  // the plan-preview flow returns control to the user between startGeneration
  // and confirmPlan — writeParams does not exist yet at that point.
  const activeResearchScope = ref<any>(null)

  // The research sources this run should retrieve from, in the shape
  // buildRetrievalContext wants. Returns undefined when research is off or there
  // is no project, which is exactly the "continuity context only" path.
  function researchRagOptions() {
    const params = writeParams.value
    if (!params) return undefined
    return buildRagOptions(params.projectId, params.research)
  }

  // Research citations only, for paths that already have their own continuity
  // context (the continuation writer works from the prose on either side of the
  // gap, not from a retrieval pass).
  function researchCitationsFor(scene: any, projectId: any) {
    return buildResearchContext(scene, buildRagOptions(projectId, writeParams.value?.research))
  }

  const sceneReviewMode = ref(false)
  const autoMode = ref(false)
  const evalUnavailableCount = ref(0)
  const evalPersistence = useEvalPersistence()
  // Continuation runs (fill / extend / expand) add to an existing manuscript
  // rather than owning a pipeline run, so they carry their own busy flag instead
  // of driving the delegator's phase machine.
  const isContinuing = ref(false)
  const continuationReport = ref<any | null>(null)

  async   function persistCritiqueEval(entry: any, pid: any, sceneTitle: any, subsectionId?: string) {
    if (!pid || !entry || entry.score == null) return
    try {
      await evalPersistence.saveRecord({
        projectId: pid,
        sceneId: subsectionId || String(entry.sceneIndex),
        evalType: 'critique',
        score: entry.score,
        dimensionScores: entry.dimensionScores || null,
        issues: entry.topIssues || null,
        workspaceType: workspaceType.value,
        sceneTitle: sceneTitle || null
      })
    } catch (err: any) {
      console.warn('[evalPersistence] save failed:', err)
    }
  }

  // Run-level cancellation.
  //
  // A volume is 130-230 LLM calls. Until now the only way to stop one was to
  // reload the page: `reset()` cleared the refs while in-flight fetches kept
  // running and completed writers kept writing into the store behind it.
  //
  // `options.signal` was already plumbed all the way to the providers — no
  // generation caller ever passed one. (Note it could not safely be passed
  // before: `onAbort` was block-scoped inside the providers' try blocks, so any
  // error raised while a signal was attached threw a ReferenceError that masked
  // the real one. That is fixed; this is now safe to turn on.)
  const abort = createAbortScope()
  function throwIfAborted() { abort.throwIfAborted() }
  const isCancelling = ref(false)
  const runConsecutiveFailures = ref(0)
  const runFailedScenes = ref(0)
  const currentSceneResult = ref<any | null>(null)
  const currentWriteIndex = ref(0)
  const inlineEvalEnabled = ref(false)
  const promptAdjuster = useAutoPromptAdjuster()
  const driftSceneEval = {
    evaluate: async (
      scene: any,
      _workspaceType: any,
      _scenePlanItem: any,
      _index: any,
      _projectId: any,
      _storyBible: any,
      _chapterLog: any,
      extraFocus: any
    ) => {
      if (!scene?.prose) return null
      return critic.evaluateScene({
        draft: scene.prose,
        sceneBrief: scene,
        storyBible: _storyBible,
        chapterLog: _chapterLog,
        existingEntitiesJson: null,
        focusInstructions: extraFocus
      })
    }
  }
  const driftTriggeredEval = useDriftTriggeredEval(driftSceneEval)
  // Declared here (not further down) because ActiveLearningBridge needs
  // workspaceType at construction — a later `const` would hit the TDZ.
  const projectStore = useProjectStore()
  const workspaceType = computed(() => projectStore.activeWorkspaceType)
  const evalStore = useEvalStore()
  const activeLearningBridge = new ActiveLearningBridge({
    promptAdjuster,
    workspaceType
  })
  const actLog = useActivityLog()
  const generationTraceId = ref<string | null>(null)
  const generationSpanIds: Record<string, any> = {}
  let currentTaskId: any = null

  const director = useStoryDirector()
  const bootstrapper = useEntityBootstrapper()
  const writer = useStoryWriter()
  const critic = useStoryCritic()

  const sync = useChapterGenerationSync()
  const storyBibleStore = useStoryBibleStore()
  const volumeStore = useVolumeStore()
  const manuscriptStore = useManuscriptStore()
  const storyGraphStore = useStoryGraphStore()
  const storyDocuments = useStoryDocuments()
  const branchStore = useBranchStore()

  const delegatorApi = useDelegatorGeneration()
  const phase = delegatorApi.memory.phase

  /** Every entity the plan names, so scoping can never hide someone a scene must cast. */
  function plannedEntityNames(): string[] {
    const names = new Set<string>()
    for (const s of (scenePlan.value as any[]) || []) {
      for (const n of s?.characters || []) if (n) names.add(String(n))
      if (s?.location) names.add(String(s.location))
    }
    return [...names]
  }

  /**
   * The entity blob handed to the writer, narrowed to the volume being written.
   *
   * This is rebuilt on every scene from `storyBibleStore`, which holds the whole
   * project — so writing volume 5 used to ship volume 1's entire cast with it.
   * The narrowing reads the same `volumeEntities` rows the Story Network groups
   * by, so what the volume box shows is what the model is told about.
   *
   * Falls back to the full cast whenever scoping cannot be trusted: one volume,
   * no assignments, or a filter that would leave the writer with nobody.
   */
  async function scopedEntitiesBlob(projectId: any) {
    try {
      const scoped = await scopeBibleToVolume({
        projectId,
        volumeId: volumeId.value,
        characters: storyBibleStore.characters as any[],
        locations: storyBibleStore.locations as any[],
        plotThreads: storyBibleStore.plotThreads as any[],
        alwaysInclude: plannedEntityNames()
      })
      if (scoped.scoped) {
        console.info(
          `[useVolumeStoryGenerator] entity context scoped to volume ${volumeId.value}: ` +
            `${scoped.omitted} entit${scoped.omitted === 1 ? 'y' : 'ies'} from other volumes withheld`
        )
      }
      return buildExistingEntitiesBlob(scoped.characters, scoped.locations, scoped.plotThreads)
    } catch (err) {
      console.warn('[useVolumeStoryGenerator] volume scoping failed; using full cast:', err)
      return buildExistingEntitiesBlob(
        storyBibleStore.characters,
        storyBibleStore.locations,
        storyBibleStore.plotThreads
      )
    }
  }

  /**
   * Re-point the run's session budget at the work that was actually requested.
   *
   * `useDelegatorGeneration` builds one `SessionBudget` per generator, with the
   * single-exchange defaults, and shares it with the director, writer and critic
   * by reference. Nothing resized it, so the ceiling that made sense for one
   * chat turn was also the ceiling for a ten-volume novel.
   *
   * @param {{chapters: number, scenes: number}} size Work this run will do.
   */
  function sizeSessionBudget(size: { chapters: number; scenes: number }) {
    const budget = delegatorApi.memory.instances.sessionBudget
    if (!budget) return null
    budget.configureForRun({ ...size, localProvider: isOllamaProvider() })

    // Hand it to the instances that actually do the work.
    //
    // `useDelegatorGeneration` wires the budget into its OWN director/writer/critic,
    // but `useStoryWriter()` and friends are factories, not singletons — the
    // instances this composable calls are different objects that never received
    // it. Every generation call therefore passed `sessionBudget: null`, so the
    // budget counted nothing and capped nothing while still being reported as a
    // limit. A ceiling that cannot fire is worse than no ceiling, because it
    // reads like protection.
    ;(director as any).sessionBudget = budget
    ;(writer as any).sessionBudget = budget
    ;(critic as any).sessionBudget = budget
    return budget
  }

  /** Chapters and scenes implied by a run request, for budgeting. */
  function runSizeFor(structureSpec: any, singleChapter?: boolean) {
    if (structureSpec) {
      return {
        chapters: structureSpec.chapters,
        scenes: structureSpec.chapters * structureSpec.scenesPerChapter
      }
    }
    if (singleChapter) return { chapters: 1, scenes: 1 }
    // Freeform: the director decides the shape, so size for the largest plan it
    // is allowed to return rather than guessing low and truncating the book.
    return { chapters: 12, scenes: 36 }
  }

  /**
   * Turn a run failure into something the author can act on.
   *
   * "An unknown error occurred" was the whole report for a run that had spent
   * ten hours and written nothing. What matters is how far it got and whether
   * the work already on disk can be picked back up — a budget stop leaves a
   * resumable draft, which is a completely different situation from a crash.
   */
  function describeRunFailure(err: any) {
    const written = writtenScenes.value.filter(Boolean).length
    const total = scenePlan.value.length
    const progressNote = total ? ` Wrote ${written} of ${total} scene(s).` : ''

    if (isAbortError(err)) return `Generation stopped.${progressNote}`
    if (isConfigurationError(err)) {
      // Actionable, and stated once — not three hundred times in the console.
      return (
        `${err.message}\n\n` +
        `Generation stopped immediately, so nothing was wasted.${progressNote} ` +
        `Either add that key, or point Story Generation at your local model in Settings > AI Providers.`
      )
    }
    if (err?.name === 'SessionBudgetExceededError' || err instanceof SessionBudgetExceededError) {
      return (
        `Generation stopped — this run hit its size ceiling (${err.reason || 'budget exceeded'}).` +
        `${progressNote} Everything written so far is saved; use Continue drafting to finish the rest.`
      )
    }
    return (err?.message || 'Generation failed during initial phases') + progressNote
  }

  // Streams each scene into its own manuscript subsection as it is written and
  // keeps the editor pointed at the scene currently being drafted. Without this
  // the editor showed nothing until the user hunted down the generated scene by
  // hand — and the only live view was a shared preview buffer that parallel
  // scenes overwrote at random.
  const followInEditor = ref(true)
  const liveDraft = new LiveDraftBridge(manuscriptStore, { enabled: followInEditor.value })

  const commitService = new CommitService({
    writeParams,
    volumeId,
    scenePlan,
    chapterPlan,
    spineArray,
    spineContext,
    autoMode,
    writtenScenes,
    lastSyncedResultIndex,
    progress,
    manuscriptStore,
    getGenRun,
    saveGenRun,
    makeInitialGenState
  })

  const consistencyService = new ConsistencyService({
    writeParams,
    scenePlan,
    chapterPlan,
    spineArray,
    autoMode,
    writtenScenes,
    consistencyReport,
    phase,
    progress,
    storyBibleStore,
    critic,
    writer,
    manuscriptStore,
    updateGenRunStage,
    actLog
  })

  const sceneInteractionService = new SceneInteractionService({
    writeParams,
    scenePlan,
    phase,
    progress,
    writer,
    sync,
    actLog,
    writtenScenes,
    structuredResults,
    hasPendingBatches,
    pendingBatchStart,
    manuscriptStore,
    storyBibleStore,
    commitService,
    rejectedPatterns,
    autoMode,
    sceneReviewMode,
    currentSceneResult,
    currentWriteIndex,
    lastSyncedResultIndex,
    syncPreview,
    currentTaskId,
    volumeId,
    consistencyService
  })
  ;(sceneInteractionService as any).onWriteNextBatch = (i: any) => writeNextBatch(i)
  ;(sceneInteractionService as any).onCompleteGeneration = (pid: any) => completeGeneration(pid)

  // Speculative generation cache: best-effort prefetch of next scene while the
  // user reviews the current one in scene-review mode.
  const speculativeCache = new SceneSpeculativeCache()

  // Observability for the above. A silent best-effort cache is indistinguishable
  // from a broken one — this one threw on every call for as long as it existed.
  const prefetchStats = reactive({ hits: 0, misses: 0, lastError: '' as string })

  // Whether this run is actually delivering. Every stage below degrades to a
  // valid-looking empty value rather than failing, which is deliberate and
  // mostly correct — but it left nothing able to observe that a run wrote
  // thirteen scenes of 45%-duplicate prose against a story bible that never
  // changed. See services/generation/runHealth.ts.
  const runHealth = new RunHealth()
  const runHealthViolations = ref<any[]>([])
  const stateSummarizer = useStateSummarizer()
  /** Bible changes discovered across the run — an invariant input, not a stat. */
  const bibleChangesDiscovered = ref(0)

  // Wire locally-constructed services into Delegator memory so tool wrappers
  // (commitTool, consistencyTool, sceneTool) can reach them via memory.instances.*
  const { memory } = delegatorApi
  ;(memory.instances as any).commitService = commitService
  ;(memory.instances as any).consistencyService = consistencyService
  ;(memory.instances as any).sceneInteractionService = sceneInteractionService

  function logRejectedPattern(context: any, prose: any) {
    rejectedPatterns.value.push({ context, prose, timestamp: Date.now() })
    if (rejectedPatterns.value.length > MAX_REJECTED_PATTERNS) {
      rejectedPatterns.value = rejectedPatterns.value.slice(-MAX_REJECTED_PATTERNS)
    }
  }

  // Lightweight checkpoint of an in-progress one-click run. Stores the plan +
  // progress markers (not prose — that's already in subsections) so an
  // interrupted draft can be detected and, later, resumed.

  // Resume an interrupted one-click run. Truth comes from the DB (which
  // subsections already hold prose), NOT the checkpoint counter — so we only
  // ever fill scenes that are still empty and never overwrite written prose.
  async function resumeGeneration({ projectId, onChunk, onPhaseChange }: any) {
    if (phase.value !== 'idle') return { resumed: false, reason: 'busy' }

    // Clear and seed evalStore from persisted history for project-scoped eval tracking
    await clearAndSeedEvalStore(projectId, evalStore)

    speculativeCache.flush()
    liveDraft.reset()
    const run = await getGenRun(projectId)
    if (!run || !run.state) return { resumed: false, reason: 'no-checkpoint' }

    const state = run.state
    const plan = Array.isArray(state.scenePlan) ? state.scenePlan : []
    const chapters = Array.isArray(state.chapterPlan) ? state.chapterPlan : []
    if (plan.length === 0 || chapters.length === 0) {
      return { resumed: false, reason: 'invalid-checkpoint' }
    }

    // The manuscript must still be loaded so we can read existing prose
    const subs: any[] = manuscriptStore.subsections as any[]
    const subById = new Map(subs.map((s: any) => [s.id, s]))
    // Subsections in the plan must exist in the manuscript store — if the
    // volume structure changed after the plan was saved, bail out immediately.
    const missingIds = plan.filter((s: any) => s.subsectionId && !subById.has(s.subsectionId))
    if (missingIds.length > 0) {
      return { resumed: false, reason: 'subsection-count-mismatch' }
    }
    const summaryBySub = new Map((state.writtenMeta || []).map((m: any) => [m.subsectionId, m.summary]))

    // Rebuild the section grouping exactly as confirmPlan created it, reusing the
    // existing section rows (found via each scene's subsectionId → parent section)
    const sections: any[] = []
    let offset = 0
    for (const chapter of chapters) {
      const count = (chapter.scenes && chapter.scenes.length) || 0
      const group = plan.slice(offset, offset + count)
      offset += count
      if (group.length === 0) continue
      const firstSub = subById.get(group[0].subsectionId)
      const sectionId = firstSub?.sectionId
      if (!sectionId) return { resumed: false, reason: 'manuscript-mismatch' }
      sections.push({
        id: sectionId,
        scenes: group,
        subsectionIds: group.map((g: any) => g.subsectionId),
        chapterMeta: chapter
      })
    }

    // Reconstruct already-written scenes from DB prose, stopping at the first
    // empty scene — that empty scene is where we resume.
    const rebuilt = []
    let resumeIndex = plan.length
    for (let i = 0; i < plan.length; i++) {
      const scene = plan[i]
      const sub = subById.get(scene.subsectionId)
      const prose = sub?.content
      if (prose && prose.trim()) {
        rebuilt.push({
          title: scene.title || `Scene ${scene.sceneNumber}`,
          prose,
          summary:
            summaryBySub.get(scene.subsectionId) ||
            prose.slice(0, 150).replace(/\s+\S*$/, '') + '...',
          characters: scene.charactersPresent || scene.characters || [],
          location: scene.location || '',
          sceneNumber: scene.sceneNumber,
          subsectionId: scene.subsectionId
        })
      } else {
        resumeIndex = i
        break
      }
    }
    if (resumeIndex >= plan.length) {
      // Everything is already written — nothing to resume
      await clearGenRun(projectId)
      return { resumed: false, reason: 'already-complete' }
    }

    // Size the budget for the work that is actually LEFT. A resumed run starts
    // with fresh counters, so budgeting it for the whole book would let it
    // overrun; budgeting it for the remainder is what the run will spend.
    sizeSessionBudget({ chapters: chapters.length, scenes: plan.length - resumeIndex })

    // Restore run state
    scenePlan.value = plan
    chapterPlan.value = chapters
    spineArray.value = Array.isArray(state.spineArray) ? state.spineArray : []
    spineContext.value = state.spineContext || ''
    volumeId.value = state.volumeId || null
    writtenScenes.value = rebuilt
    autoMode.value = true
    rejectedPatterns.value = []
    structuredResults = []
    lastSyncedResultIndex.value = 0
    hasPendingBatches.value = false
    pendingBatchStart.value = 0
    runConsecutiveFailures.value = 0
    runFailedScenes.value = 0
    error.value = null
    progress.total = plan.length
    progress.current = resumeIndex

    currentTaskId = actLog.addTask({ name: 'Story Generator (resumed)', type: 'generation' })

    const storyDocuments = useStoryDocuments()
    const storyBibleDocs = await storyDocuments.getStoryDocumentContext(projectId)

    writeParams.value = {
      projectId,
      storyArc: state.storyArc || null,
      storyContract: state.storyContract || '',
      synopsis: state.synopsis || '',
      onChunk,
      sections,
      storyBibleDocs,
      // Restored from the checkpoint so a resumed run keeps drawing on the same
      // sources. Checkpoints written before this field existed have none, and
      // fall back to the global preference rather than losing research entirely.
      research: state.research ?? null
    }
    activeResearchScope.value = writeParams.value.research

    // Seed prompt adjuster from persisted eval history for cross-run learning
    await seedPromptAdjusterFromHistory(projectId, workspaceType.value, promptAdjuster)

    // The plan, structure and spine all survive in the checkpoint, so this run
    // is genuinely already at `writing`. Dispatching SPINE_GENERATED from `idle`
    // (as this did) has no route — it threw before the first scene, and the
    // panel's catch swallowed it, so Resume appeared to do nothing at all.
    delegatorApi.restorePhase('writing', 'resumed from checkpoint')
    try {
      await writeNextBatch(resumeIndex)
      return { resumed: true, from: resumeIndex, total: plan.length }
    } catch (err: any) {
      await delegatorApi.dispatch('ERROR', { error: err, message: err.message || 'Resume failed' })
      error.value = err.message || 'Resume failed'
      return { resumed: false, reason: 'error', error: error.value }
    }
  }

  async function startGeneration({
    projectId,
    synopsis,
    genre,
    tone,
    wordTarget,
    singleChapter,
    sparkContext,
    auto,
    structure,
    research,
    onPhaseChange,
    onPartialData,
    onChunk
  }: any) {
    if (phase.value !== 'idle') return

    // Pinned before the first model call so the plan and every scene that
    // follows retrieve from the same sources, even across a plan-preview pause.
    activeResearchScope.value = research ?? null

    // Clear and seed evalStore from persisted history for project-scoped eval tracking
    await clearAndSeedEvalStore(projectId, evalStore)

    abort.ensure()
    isCancelling.value = false
    liveDraft.reset()

    // Normalize an explicit volumes/chapters/words request into a structure spec
    let structureSpec = null
    if (structure && structure.wordsPerChapter) {
      const volumes = Math.max(1, structure.volumes || 1)
      const chaptersPerVolume = Math.max(1, structure.chaptersPerVolume || 1)
      structureSpec = {
        volumes,
        chaptersPerVolume,
        chapters: volumes * chaptersPerVolume,
        scenesPerChapter: Math.max(1, structure.scenesPerChapter || 3),
        wordsPerChapter: Math.max(200, structure.wordsPerChapter)
      }
    }
    const effectiveWordTarget = structureSpec
      ? structureSpec.chapters * structureSpec.wordsPerChapter
      : wordTarget

    // Point the session budget at THIS run before the first model call.
    //
    // The budget is created once with the generator and defaults to a
    // single-exchange ceiling (100 calls / 100k tokens). A multi-volume request
    // blows through that during planning, and because both the planner and the
    // per-scene writer swallow their failures, the run went on to report success
    // with a full outline and no prose. Sizing it from the requested structure
    // is what makes a large book a long run instead of a silent empty one.
    sizeSessionBudget(runSizeFor(structureSpec, singleChapter))

    error.value = null
    consistencyReport.value = null
    writtenScenes.value = []
    scenePlan.value = []
    rejectedPatterns.value = []

    generationTraceId.value = `vol-gen-${projectId}-${Date.now()}`
    langfuseService.createTrace(generationTraceId.value, {
      name: 'volume-generation',
      projectId,
      genre,
      tone,
      wordTarget
    })

    // One-click mode: run every phase to completion with no human gates
    autoMode.value = !!auto
    if (auto) sceneReviewMode.value = false
    runConsecutiveFailures.value = 0
    runFailedScenes.value = 0

    currentTaskId = actLog.addTask({ name: 'Story Generator', type: 'generation' })
    let bpPhase = actLog.addPhase(currentTaskId, 'Bootstrapping')

    const enhancedSynopsis = sparkContext
      ? `${synopsis}\n\nAdditional context from brainstorming:\n${sparkContext}`
      : synopsis

    let activeStage: any = null
    try {
      progress.total = 4

      // Restore point BEFORE anything is written. A run rewrites every chapter
      // it touches, and the `snapshots` table was empty after a live 13-scene
      // run — there was no way back at all. Taken first, so it exists even if
      // the run fails during bootstrapping.
      const snapResult = await snapshotBeforeRun(projectId, manuscriptStore.sortedSections)
      if (!snapResult.ok) {
        runHealth.record('artifact_failed', { stage: 'pre-run snapshot', detail: snapResult.detail })
      }
      actLog.appendThought(currentTaskId, bpPhase, `${snapResult.detail}\n`)

      // Phase 0: Create volume first (so bootstrapping has a real volume ID)
      progress.current = 1
      progress.statusText = 'Creating volume...'
      const vId = await volumeStore.createVolume(projectId, {
        title: `${enhancedSynopsis.slice(0, 60)}...`,
        description: `Generated story — ${genre}, ${tone}`,
        // `getNextColor()` picks the first colour not already in use, from the
        // store's palette. Hardcoding `#6366f1` — which is simply VOLUME_COLORS[0]
        // — meant a generated volume always collided with whatever already held
        // that colour, and the swatch is rendered directly as the volume's
        // background in ChapterManager.
        color: volumeStore.getNextColor(),
        sectionIds: []
      })
      volumeId.value = vId

      await delegatorApi.dispatch('BOOTSTRAP_START', { projectId, volumeId: vId })

      // Load story bible context and existing manuscript as evidence for the Director
      progress.statusText = 'Loading story context for planning...'
      const storyDocs = useStoryDocuments()

      const sceneSummaries: string[] = []
      for (const section of (manuscriptStore.sortedSections as any[])) {
        const allSubs: any[] = manuscriptStore.subsections as any[]
        const sectionSubs = allSubs
          .filter((s: any) => s.sectionId === section.id)
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        for (const sub of sectionSubs) {
          if (sub.content || sub.description) {
            const excerpt = sub.content
              ? sub.content.slice(0, 300).replace(/\s+\S*$/, '') + '...'
              : ''
            sceneSummaries.push(`"${sub.title}": ${sub.description || excerpt || '(written)'}`)
          }
        }
      }

      // Evidence is re-read, not cached: entities are committed at several points
      // in this run (bible, network, cast expansion) and each consumer needs the
      // bible as it stands when *it* runs.
      const buildEvidence = async () => {
        const parts = []
        const bible = await storyDocs.getStoryDocumentContext(projectId)
        if (bible) parts.push(bible)
        if (sceneSummaries.length > 0) {
          parts.push('# Existing Manuscript Scenes\n' + sceneSummaries.slice(-20).join('\n'))
        }
        return parts.join('\n\n')
      }

      // How big a cast this story warrants. Falls back to the word target when no
      // explicit structure was requested, so freeform runs still scale.
      const castScope = structureSpec || {
        chapters: Math.round((effectiveWordTarget || 0) / 3000)
      }

      // Phase 1 (Stage A — Story Bible): Bootstrap entities
      progress.current = 2
      progress.statusText = 'Conjuring Characters & World...'
      activeStage = 'bible'
      await runStageWithHeartbeat(projectId, 'bible', (heartbeat) =>
        bootstrapper.bootstrapEntities({
          synopsis: enhancedSynopsis,
          projectId,
          volumeId: vId,
          scope: castScope,
          onPartialData: (type: any, name: any) => {
            heartbeat(name)
            onPartialData?.(type, name)
          }
        })
      ).catch((err) => {
        console.warn('[useVolumeStoryGenerator] bible stage failed or timed out:', err)
      })
      activeStage = null
      actLog.updatePhase(currentTaskId, bpPhase, { status: 'done' })
      bpPhase = -1

      // Phase 1.5 (Stage B — Story Network): with the Bible entities committed
      // (stable IDs), generate the deliberate relationships between them BEFORE
      // planning, so scenes and views can build on a populated network. Best-effort.
      progress.statusText = 'Weaving the Story Network (relationships)...'
      const networkPhase = actLog.addPhase(currentTaskId, 'Story Network')
      actLog.appendThought(
        currentTaskId,
        networkPhase,
        `Analyzing relationships across ${storyBibleStore.characters.length} characters, ` +
          `${storyBibleStore.locations.length} locations, ${storyBibleStore.plotThreads.length} plot threads...\n`
      )
      try {
        // Heartbeat on tokens, not on a wall clock. The weave is a single
        // structured call, so the only honest evidence it is alive is the stream
        // underneath it; the stage budget then only has to cover prompt
        // evaluation rather than the whole generation.
        const netResult = await runStageWithHeartbeat(
          projectId,
          'network',
          (heartbeat, stageSignal) =>
            generateRelationships({
              projectId,
              characters: storyBibleStore.characters as any[],
              locations: storyBibleStore.locations as any[],
              plotThreads: storyBibleStore.plotThreads as any[],
              synopsis: enhancedSynopsis,
              genre,
              tone,
              signal: stageSignal,
              onProgress: () => heartbeat()
            }),
          undefined,
          abort.signal()
        )
        const REASON_MESSAGES = {
          ai_empty: 'The model found no relationships to map for this cast.',
          ai_failed: 'The relationship model call failed after retry (see console).',
          all_dropped:
            "Suggested relationships were dropped — the model's names didn't match the cast.",
          all_duplicate: 'All suggested relationships already existed.',
          too_few_characters: 'Not enough characters yet to form relationships.'
        }
        const rels = netResult.characterRelationships
        const edges = netResult.graphEdges
        const droppedN = netResult.dropped || 0
        let detail = `${rels} relationships, ${edges} edges`
        if (droppedN) detail += ` · ${droppedN} dropped`
        actLog.appendThought(
          currentTaskId,
          networkPhase,
          `Created ${rels} relationships and ${edges} graph edges` +
            (droppedN ? ` (${droppedN} dropped: names didn't match the cast)` : '') +
            '.\n'
        )
        if (rels === 0 && edges === 0 && (REASON_MESSAGES as any)[netResult.reason]) {
          actLog.appendThought(
            currentTaskId,
            networkPhase,
            (REASON_MESSAGES as any)[netResult.reason] + '\n'
          )
        }
        actLog.updatePhase(currentTaskId, networkPhase, { status: 'done', detail })
      } catch (err: any) {
        console.warn('[useVolumeStoryGenerator] Story Network generation failed:', err)
        actLog.updatePhase(currentTaskId, networkPhase, { status: 'failed' })
      }

      // Reload story context so the newly generated entities are included in evidence
      const updatedEvidence = await buildEvidence()

      // Phase 2: Generate story plan using the updated context
      progress.current = 3
      progress.statusText = 'Forging the Story Graph (Planning scenes)...'
      await delegatorApi.dispatch('BOOTSTRAPPED', undefined)
      const planPhase = actLog.addPhase(currentTaskId, 'Planning')
      activeStage = 'structure'
      await updateGenRunStage(projectId, 'structure', { status: 'running' })
      actLog.appendThought(currentTaskId, planPhase, 'Outlining chapters and scenes...\n')

      // Set by the cast-expansion hook below; drives the second network weave.
      let castGrew = false

      // Planning is one call per chapter, serial on Ollama. The old wrapper passed
      // no budget, so it silently took withTimeout's 5-minute default — less time
      // than a 10-chapter plan needs on any local model, which failed the run
      // before a single scene was written. The watchdog now bounds silence
      // between planned chapters instead of total planning time.
      const directorResult = await runStageWithHeartbeat(
        projectId,
        'structure',
        (heartbeat) =>
          director.generateStoryPlan({
            goal: {
              premise: enhancedSynopsis,
              genre,
              tone,
              wordTarget: effectiveWordTarget,
              horizon: 'long_term',
              structure: structureSpec
            },
            evidence: updatedEvidence,
            research,
            // Mirror planning progress into the Planning phase so the Activity drawer
            // shows what's being outlined, then forward to the caller's handler.
            onPartialData: (type: any, name: any) => {
              heartbeat(name)
              try {
                actLog.appendThought(currentTaskId, planPhase, `• ${name}\n`)
              } catch {
                // Best-effort progress callback; a throwing consumer must not break the run.
              }
              onPartialData?.(type, name)
            },
            // The arc now exists but no scene has been cast yet — the one moment
            // where a new antagonist or subplot can still be written INTO the
            // plan rather than smuggled in by the prose writer later.
            onSkeletonReady: async ({ chapters: skeleton, storyArc: arc }: any) => {
              heartbeat('Casting the arc')
              actLog.appendThought(
                currentTaskId,
                planPhase,
                'Checking which characters, places and threads this arc still needs...\n'
              )
              const expansion = await bootstrapper
                .expandCast({
                  synopsis: enhancedSynopsis,
                  projectId,
                  volumeId: vId,
                  chapters: skeleton,
                  storyArc: arc,
                  scope: castScope,
                  onPartialData: (type: any, name: any) => {
                    heartbeat(name)
                    try {
                      actLog.appendThought(currentTaskId, planPhase, `+ ${type}: ${name}\n`)
                    } catch {
                      // Best-effort progress callback; a throwing consumer must not break the run.
                    }
                    onPartialData?.(type, name)
                  }
                })
                .catch((err: any) => {
                  console.warn('[useVolumeStoryGenerator] cast expansion failed:', err)
                  return null
                })
              heartbeat('Cast ready')
              if (!expansion?.added) return null
              castGrew = true
              // Re-read the bible so scene planning can cast the new entities by
              // name instead of the writer inventing them mid-prose.
              return await buildEvidence()
            }
          })
      )

      const scenes = directorResult.scenes
      const storyArc = directorResult.storyArc

      if (!Array.isArray(scenes) || scenes.length < 3) {
        throw new Error('Director returned insufficient scenes (need at least 3)')
      }

      // The first weave ran against the opening cast only, so anyone added for
      // the arc would sit in the bible with no edges at all. Re-weave under the
      // network stage's own budget rather than inside the planner's — a slow
      // relationship pass must not be able to kill a plan that already succeeded.
      if (castGrew) {
        const reweavePhase = actLog.addPhase(currentTaskId, 'Story Network')
        try {
          // Deliberately NOT the 'network' stage key: `updateGenRunStage` derives
          // `currentStage` from the first unfinished pipeline stage, so reusing
          // it here would rewind a resumed run back past 'structure'. An off-
          // pipeline key gets the same idle watchdog with no checkpoint effect.
          const reweave = await runStageWithHeartbeat(
            projectId,
            'network_reweave',
            (heartbeat, stageSignal) =>
              generateRelationships({
                projectId,
                characters: storyBibleStore.characters as any[],
                locations: storyBibleStore.locations as any[],
                plotThreads: storyBibleStore.plotThreads as any[],
                synopsis: enhancedSynopsis,
                genre,
                tone,
                signal: stageSignal,
                onProgress: () => heartbeat()
              }),
            STAGE_IDLE_TIMEOUT_MS.network,
            abort.signal()
          )
          actLog.updatePhase(currentTaskId, reweavePhase, {
            status: 'done',
            detail: `${reweave.characterRelationships} relationships, ${reweave.graphEdges} edges`
          })
        } catch (err: any) {
          console.warn('[useVolumeStoryGenerator] Story Network re-weave failed:', err)
          actLog.updatePhase(currentTaskId, reweavePhase, { status: 'failed' })
        }
      }

      // Cap to 1 scene for single-chapter mode (ignored when an explicit structure is requested)
      const planScenes = !structureSpec && singleChapter ? [scenes[0]] : scenes

      chapterPlan.value = directorResult.chapters

      scenePlan.value = planScenes.map((s, i) => ({
        sceneNumber: i + 1,
        sceneIndex: i + 1,
        title: s.title || `Scene ${i + 1}`,
        goal: s.emotionalGoal || '',
        obstacle: s.whatChanges || '',
        characters: s.charactersPresent || [],
        location: s.location || '',
        change: s.whatChanges || '',
        toneNote: s.tension || 'medium',
        tension: s.tension || 'medium',
        pacing: s.pacing || 'medium',
        estimatedWords:
          !structureSpec && singleChapter
            ? effectiveWordTarget
            : s.estimatedWords || Math.round(effectiveWordTarget / scenes.length),
        emotionalGoal: s.emotionalGoal || '',
        whatChanges: s.whatChanges || '',
        charactersPresent: s.charactersPresent || [],
        characterWants: s.characterWants || {},
        setup: s.setup || '',
        payoff: s.payoff || 'none',
        sensoryAnchor: s.sensoryAnchor || '',
        arcPosition: s.arcPosition || '',
        // POV anchor: use the director's choice, else the first character present.
        // Keeps narration from drifting between viewpoints across a long draft.
        pov:
          s.pov ||
          s.povCharacter ||
          (Array.isArray(s.charactersPresent) ? s.charactersPresent[0] : '') ||
          ''
      }))

      progress.current = 4
      progress.statusText = 'Sealing the Arc Contract...'
      await buildPreliminaryEdges(projectId, vId, scenePlan.value)

      // Build story contract from the plan
      const storyContract = [
        `Genre: ${genre}`,
        `Tone: ${tone}`,
        `Central conflict: ${storyArc?.centralConflict || 'unknown'}`,
        `Characters in story: ${[
          ...new Set([
            ...scenes.flatMap((s) => s.characters || s.charactersPresent || []),
            ...(storyBibleStore.characters as any[]).map((c: any) => c.name)
          ])
        ].join(', ')}`,
        `Locations in story: ${[
          ...new Set([
            ...scenes.flatMap((s) => (s.location ? [s.location] : [])),
            ...(storyBibleStore.locations as any[]).map((l: any) => l.name)
          ])
        ].join(', ')}`
      ].join('\n')

      actLog.updatePhase(currentTaskId, planPhase, { status: 'done' })

      // Phase 2.5: Pause at plan-preview for user editing
      await delegatorApi.dispatch('PLAN_READY', { projectId, volumeId: vId, plan: scenePlan.value })
      // Return control; user edits plan and calls confirmPlan() to proceed

      // In one-click mode, approve the plan as-is and run straight through to
      // completion — this await only resolves once the whole volume is written.
      if (autoMode.value) {
        await confirmPlan({
          projectId,
          editedPlan: scenePlan.value,
          storyArc,
          storyContract,
          synopsis,
          sparkContext,
          onPhaseChange,
          onChunk
        })
      }

      // Store arc for later use
      return { scenes: scenePlan.value, storyArc, volumeId: vId, storyContract }
    } catch (err: any) {
      // A user-requested stop is an outcome, not a fault. Reporting it as
      // "Generation failed" would be the app lying about its own state.
      if (isAbortError(err)) {
        progress.statusText = 'Stopped'
        if (activeStage) {
          await updateGenRunStage(projectId, activeStage, { status: 'cancelled' })
        }
        if (currentTaskId) actLog.failTask(currentTaskId, 'Stopped')
        throw err
      }
      // Record the failure BEFORE announcing it. The dispatch below can itself
      // throw (a spent budget, a phase with no ERROR route), and when it did,
      // `error.value` was never assigned and the stage was never marked failed —
      // so a run that died mid-planning surfaced as a finished one with an empty
      // manuscript. The report has to survive the reporting.
      error.value = describeRunFailure(err)
      if (activeStage) {
        await updateGenRunStage(projectId, activeStage, {
          status: 'failed',
          error: error.value
        }).catch(() => {})
      }
      // Close the Activity task too, or the drawer keeps counting.
      //
      // `failTask` marks the task AND every still-running phase failed — it was
      // written for exactly this and had no callers anywhere, so a run that died
      // mid-planning left "Planning · RUNNING" ticking next to a panel that
      // already said the run had failed. Nothing ever reconciled the two.
      if (currentTaskId) actLog.failTask(currentTaskId, error.value)
      await delegatorApi
        .dispatch('ERROR', { error: err, message: error.value })
        .catch((dispatchErr: any) => {
          console.warn('[useVolumeStoryGenerator] ERROR dispatch failed:', dispatchErr)
        })
      throw err
    }
  }

  /**
   * Build the per-scene chunk emitter.
   *
   * One place now owns what happens to a streamed token: it goes into the
   * scene's own manuscript subsection (so the editor renders it live, in the
   * right scene, without parallel scenes trampling each other) and it goes to
   * the caller's `onChunk` for the generator panel.
   *
   * Returns `{ emitChunk, done }`; `done` must be called when the scene settles
   * so the bridge flushes the last tokens and hands the editor to the next scene.
   */
  function makeSceneStream({ scene, sceneIndex, onChunk }: any) {
    const subsectionId = scene?.subsectionId ?? null
    let started = false

    const emitChunk = (proseChunk: any, fullProse: any) => {
      if (!started) {
        started = true
        liveDraft.begin({ sceneIndex, subsectionId })
      }
      liveDraft.push(subsectionId, fullProse)
      onChunk?.({
        sceneIndex: sceneIndex + 1,
        total: scenePlan.value.length,
        chunk: proseChunk,
        fullProse,
        subsectionId,
        scene
      })
    }

    return {
      emitChunk,
      done(finalProse?: any) {
        if (!started) return
        if (finalProse != null) liveDraft.push(subsectionId, finalProse)
        liveDraft.finish(subsectionId)
      },
      abandon() {
        if (started) liveDraft.abandon(subsectionId)
      }
    }
  }

  // Splits an extra-long scene into sections, generates each in parallel
  // through the full writer-critic-eval gate, then merges the prose.
  // Each section gets its own sectionRole directive in the brief so the model
  // knows which narrative beat to focus on.
  async function writeSceneChunked({
    scene,
    sceneIndex,
    storyArc,
    chapterLog = '',
    storyBible,
    storyContract,
    existingEntitiesJson,
    embeddingContext = '',
    extraRejected,
    pastEvalResults,
    focusInstructions,
    anchorRole,
    anchorConstraints,
    emitChunk
  }: any): Promise<any> {
    const sections = splitSceneIntoChunks(scene)

    // Sections are written concurrently but belong to one scene, so their live
    // output has to be recomposed in section order before it is emitted.
    // Previously each section was given `emitChunk: null` and the scene emitted
    // exactly once, at the end — a long scene showed nothing at all while it was
    // being written, which is indistinguishable from a stall.
    const sectionBuffers: string[] = sections.map(() => '')
    const emitComposed = () => {
      if (!emitChunk) return
      const composed = mergeChunkProse(sectionBuffers)
      emitChunk('', composed)
    }

    const sectionPromises: any[] = sections.map((sectionBrief: any, i: any) => {
      const phaseName = `Section ${i + 1}: ${scene.title || `Scene ${scene.sceneNumber}`}`
      const sectionPhase = actLog.addPhase(currentTaskId, phaseName)
      return writeSceneWithGate({
        scene: sectionBrief,
        sceneIndex,
        scenePhase: sectionPhase,
        storyArc,
        chapterLog,
        storyBible,
        storyContract,
        existingEntitiesJson,
        embeddingContext,
        extraRejected,
        pastEvalResults,
        focusInstructions,
        anchorRole,
        anchorConstraints,
        emitChunk: emitChunk
          ? (_proseChunk: any, sectionProse: any) => {
              sectionBuffers[i] = sectionProse || ''
              emitComposed()
            }
          : null
      })
    })

    const results: any[] = await Promise.allSettled(sectionPromises)
    const proseSections = results.map((r: any) => (r.status === 'fulfilled' ? r.value.chosenProse : ''))
    const chosenProse = mergeChunkProse(proseSections)

    // `allSettled` never rejects, so before this check a scene whose sections
    // ALL failed returned `chosenProse: ''` — and the callers, which only looked
    // for a thrown error, wrote that empty string to the manuscript and marked
    // the subsection `generated`. Every scene in a long book "succeeded" with
    // zero words, and the run finished and reported a completed novel.
    //
    // Any scene over CHUNK_THRESHOLD words takes this path, so on a 10,000-word
    // chapter that was every scene in the book.
    const rejections = results.filter((r: any) => r.status === 'rejected')
    if (!chosenProse.trim()) {
      const cause = rejections[0]?.reason
      // A budget stop or a cancel has to stay recognisable as itself so the run
      // above can end deliberately instead of treating it as one bad scene.
      if (cause && isFatalRunError(cause)) throw cause
      throw new Error(
        `Scene "${scene.title || scene.sceneNumber}" produced no prose — ` +
          `all ${sections.length} sections failed` +
          (cause?.message ? `: ${cause.message}` : '.')
      )
    }
    if (rejections.length > 0) {
      // Partial is still a scene worth keeping, but it is short by design and
      // the author should be told rather than left to find the seam.
      console.warn(
        `[useVolumeStoryGenerator] scene "${scene.title}": ${rejections.length} of ` +
          `${sections.length} sections failed; kept the rest`
      )
      actLog.appendThought(
        currentTaskId,
        0,
        `\n⚠ "${scene.title}" is incomplete — ${rejections.length} of ${sections.length} sections failed to write.\n`
      )
    }

    const best: any[] = results
      .filter((r: any) => r.status === 'fulfilled')
      .sort((a: any, b: any) => (b.value.chosenEval?.score || 0) - (a.value.chosenEval?.score || 0))
    const bestResult: any = best[0]

    emitChunk?.(chosenProse, chosenProse)

    return {
      chosenProse,
      chosenStructured: bestResult?.value?.chosenStructured || null,
      chosenEval: bestResult?.value?.chosenEval || null
    }
  }

  // Shared per-scene writer with the one-click quality gate. In autoMode it
  // writes up to SCENE_MAX_ATTEMPTS times, critiques each attempt, keeps the
  // best, applies a continuity floor, and feeds each attempt's critique into
  // the next. Manual mode writes once. Both the sequential (writeNextBatch)
  // and parallel (runParallelGeneration) paths route through this so the same
  // quality gates apply regardless of generation mode.
  async function writeSceneWithGate({
    scene,
    sceneIndex,
    scenePhase,
    storyArc,
    chapterLog = '',
    storyBible,
    storyContract,
    existingEntitiesJson,
    embeddingContext = '',
    extraRejected,
    pastEvalResults,
    focusInstructions,
    anchorRole,
    anchorConstraints,
    emitChunk
  }: any): Promise<any> {
    const retryGate = autoMode.value
    const maxAttempts = retryGate ? SCENE_MAX_ATTEMPTS : 1
    let chosenProse = ''
    let chosenStructured = null
    let chosenEval = null
    let attemptFeedback = pastEvalResults
    let attemptFocusInstructions = focusInstructions

    // Spend prompt budget on this scene's cast, not the whole bible. Falls back
    // to the caller's full dump when the scene names nobody to scope on.
    const sceneEntitiesJson =
      buildSceneEntitiesBlob(scene, {
        characters: storyBibleStore.characters,
        locations: storyBibleStore.locations,
        plotThreads: storyBibleStore.plotThreads
      }) || existingEntitiesJson

    if (shouldChunkScene(scene)) {
      return writeSceneChunked({
        scene,
        sceneIndex,
        storyArc,
        chapterLog,
        storyBible,
        storyContract,
        existingEntitiesJson: sceneEntitiesJson,
        embeddingContext,
        extraRejected,
        pastEvalResults,
        focusInstructions,
        anchorRole,
        anchorConstraints,
        emitChunk
      })
    }

    let baselineWordCount = 0
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      throwIfAborted()
      let fullProse = ''
      let result: any
      try {
        result = await (writer.writeSceneStructured as any)({
          sceneBrief: scene,
          storyArc,
          chapterLog,
          storyBible,
          spineContext: spineContext.value,
          anchorRole,
          anchorConstraints,
          signal: abort.signal(),
          onChunk: (_chunk: any, proseChunk: any) => {
            fullProse += proseChunk || ''
            emitChunk?.(proseChunk, fullProse)
          },
          onRawChunk: (chunk: any) => actLog.appendThought(currentTaskId, scenePhase, chunk),
          embeddingContext,
          storyContract,
          rejectedPatterns: extraRejected,
          existingEntitiesJson: sceneEntitiesJson,
          pastEvalResults: attemptFeedback || undefined,
          focusInstructions: attemptFocusInstructions || undefined
        })
      } catch (err: any) {
        // Repetition rejection is a failed ATTEMPT, not a failed scene. The
        // writer refuses to hand back looping prose now, so re-roll — that is
        // the response the retry loop already exists for. Anything else is a
        // real error and propagates.
        if (!isUnsalvageableProse(err)) throw err

        runHealth.record('prose_rejected', {
          stage: 'writer',
          sceneIndex,
          detail: err?.message || 'repetitive output'
        })
        actLog.appendThought(
          currentTaskId,
          scenePhase,
          `\n⚠ Attempt ${attempt + 1} produced repetitive output and was rejected. Retrying.\n`
        )
        // Out of attempts: let the caller treat the scene as failed rather than
        // committing prose the guard rejected.
        if (attempt === maxAttempts - 1) throw err
        continue
      }
      const proseText = result.prose
      if (attempt === 0) {
        baselineWordCount = countWords(proseText)
      }

      if (!retryGate) {
        chosenProse = proseText
        chosenStructured = result.structured
        break
      }

      const criticResult = await critic.evaluateScene({
        draft: proseText,
        sceneBrief: scene,
        storyBible,
        chapterLog: '',
        existingEntitiesJson: sceneEntitiesJson,
        focusInstructions: attemptFocusInstructions
      })
      if (!chosenEval || attemptScore(criticResult) > attemptScore(chosenEval)) {
        chosenProse = proseText
        chosenStructured = result.structured
        chosenEval = criticResult
      }

      const dimCov = gateDimensionCoverage(criticResult, workspaceType.value)
      const scoreDist = gateScoreDistribution(criticResult)
      if (!dimCov.pass && dimCov.warnings.length > 0) {
        console.warn('[evalGate] dimensionCoverage:', dimCov.warnings.join('; '))
      }
      if (!scoreDist.pass && scoreDist.flags.length > 0) {
        console.warn('[evalGate] scoreDistribution:', scoreDist.flags.join('; '))
      }

      const proseQ = gateProseQuality(
        criticResult,
        baselineWordCount,
        countWords(proseText),
        Number(scene?.estimatedWords) || 0,
        proseText
      )
      if (!proseQ.pass && proseQ.flags.length > 0) {
        console.warn('[evalGate] proseQuality:', proseQ.flags.join('; '))
        runHealth.record('gate_failed', {
          stage: 'proseQuality',
          sceneIndex,
          detail: proseQ.flags.join('; ')
        })
      }

      // Metadata status, recorded from the value the writer already returns.
      // This is the signal whose silent absence froze the story bible: a scene
      // that skipped extraction contributed no entities, no keyFacts, and so no
      // context for the scene after it.
      const metaStatus = chosenStructured?.metadataStatus ?? result?.structured?.metadataStatus
      if (metaStatus === 'failed' || metaStatus === 'skipped') {
        runHealth.record(`metadata_${metaStatus}` as any, { stage: 'writer', sceneIndex })
      }

      // A critic that cannot parse its own output makes the run look healthier
      // and cheaper than it is: the gate exits, the draft is accepted, and
      // nothing in the UI says the quality gate never ran. Retrying the writer
      // would not help — it is the critic that failed — so we still break, but
      // loudly, where the user is actually looking.
      if (criticResult?.evalUnavailable) {
        evalUnavailableCount.value += 1
        // `evalUnavailableCount` was incremented, reset, and exposed on the
        // return object — with no consumer anywhere in the codebase. Routing it
        // through the ledger gives it one: enough of these in a row and the run
        // stops rather than writing another ten scenes unchecked.
        runHealth.record('eval_unavailable', { stage: 'critic', sceneIndex })
        actLog.appendThought(
          currentTaskId,
          scenePhase,
          "\n⚠ Quality gate did not run for this scene — the critic's output could not be parsed. The draft was accepted unchecked.\n"
        )
      }
const continuityOk = ((criticResult.dimensionScores as any)?.continuity ?? 10) >= 6

      // Cloud escalation check: if eval is unavailable or has suspect scores and
      // user has cloud escalation enabled, offer to escalate this scene's
      // evaluation to a cloud provider for a second opinion.
      if (canUseCloudEscalation()) {
        const needsEscalation = criticResult?.evalUnavailable ||
          (criticResult?.score != null && (criticResult.score < 3 || criticResult.score > 9)) ||
          (criticResult?.issues?.length === 0 && criticResult?.score != null && criticResult.score >= 7)

        if (needsEscalation) {
          const disclosure = await buildCloudDisclosure({
            // `writeParamsVal` is runParallelGeneration's local — it does not
            // exist in this scope, so this threw a ReferenceError (optional
            // chaining does not shield an undeclared identifier) every time a
            // scene qualified for cloud escalation.
            projectId: writeParams.value?.projectId || '',
            operation: 'escalation-on-failure',
            text: proseText,
            systemPrompt: 'You are an expert fiction editor. Evaluate this scene for quality, continuity, voice, and adherence to the story bible. Provide a score 1-10, dimension scores, issues, and strengths.',
            provider: settings.aiProvider,
            model: settings.ollamaModel
          })

          // Store the disclosure for the UI to present to the user
          // This is a non-blocking offer - the user can choose to escalate or continue
          actLog.appendThought(
            currentTaskId,
            scenePhase,
            `\n☁ Cloud escalation available: ${disclosure.warning}\n` +
            `Operation: ${disclosure.operation}\n` +
            `Estimated tokens: ${disclosure.estimatedTokens}\n` +
            `Estimated cost: $${disclosure.estimatedCostUsd.toFixed(4)}\n` +
            `Provider: ${disclosure.provider} (${disclosure.model})\n`
          )
        }
      }

      if (
        !criticResult ||
        criticResult.evalUnavailable ||
        (criticResult.pass && continuityOk && proseQ.pass)
      ) {
        break
      }

      const evalSnapshot = {
        sceneIndex: sceneIndex + 1,
        passed: criticResult.pass,
        score: criticResult.score,
        dimensionScores: criticResult.dimensionScores || null,
        topIssues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss)
      }
      attemptFeedback = formatEvalFeedback([evalSnapshot])
      const retryResult = promptAdjuster.updateAdjustments([evalSnapshot], { workspaceType: workspaceType.value })
      attemptFocusInstructions = retryResult.focusInstructions
    }

  // After all retries exhausted, if we're in autoMode and the final eval still fails, throw.
  // This ensures callers (writeNextBatch, writeScenesInto) treat it as a failed scene.
  if (retryGate && chosenEval && !chosenEval.evalUnavailable && !isCleanPass(chosenEval)) {
    // Feed the verdict's weakest dimension into the adjuster so a rejected scene
    // produces a matching focus area (reconciles the two "weak dimension" rules).
    const verdict = deriveVerdict(chosenEval, getDefaultThreshold(workspaceType.value))
    if (verdict.weakestDimension) {
      promptAdjuster.updateAdjustments([{ dimensionScores: { [verdict.weakestDimension.name]: verdict.weakestDimension.score } }], { workspaceType: workspaceType.value })
    }

    const reason = chosenEval.issues?.find((i: any) => i.type === 'repetition')
      ? `Repetition detected: ${chosenEval.issues.find((i: any) => i.type === 'repetition').description}`
      // `verdictReason` names the dimension that actually failed ("voice scored
      // 6"), which is the actionable part. The score alone says nothing now that
      // the verdict is no longer derived from it.
      : `Quality gate failed after ${maxAttempts} attempt(s): ${chosenEval.verdictReason || `score ${chosenEval.score}`}${chosenEval.issues?.length ? ` — issues: ${chosenEval.issues.map((i: any) => i.description).join('; ')}` : ''}`
    throw new Error(reason)
  }

  // A scene that came through with usable metadata and no gate failure clears
  // every streak. The budget measures CONSECUTIVE failure — without this reset,
  // three failures spread across fifty healthy scenes would halt a run that is
  // fundamentally fine.
  if (chosenProse && chosenStructured?.metadataStatus === 'ok') {
    runHealth.recordSuccess()
  }

  return { chosenProse, chosenStructured, chosenEval }
}

  async function runParallelGeneration(writeParamsVal: any) {
    if (!writeParamsVal) return
    const parallelSpanId = crypto.randomUUID()
    generationSpanIds.parallel = parallelSpanId
    langfuseService.span(generationTraceId.value!, parallelSpanId, 'parallel-writing', {
      projectId: writeParamsVal.projectId
    })
    const { storyArc, storyBibleDocs, storyContract, projectId, onChunk } = writeParamsVal

    // Research scope for this run. The parallel path — the one a one-click volume
    // actually takes — passed no retrieval context at all, so every scene in a
    // full-book run was written with the story bible and nothing retrieved.
    const ragOptions = buildRagOptions(projectId, writeParamsVal.research)

    const existingEntitiesJson = await scopedEntitiesBlob(projectId)

    writtenScenes.value = new Array(scenePlan.value.length).fill(null)

    // Scenes-completed, tracked explicitly. `progress.current` used to be driven
    // only by whichever scene emitted the last token, so under parallel writing
    // the bar jumped backwards whenever a lower-numbered scene streamed.
    progress.total = scenePlan.value.length
    progress.current = 0
    const markSceneComplete = () => {
      progress.current = Math.min(progress.total, progress.current + 1)
    }

    // Stop a run that is producing nothing.
    //
    // Every per-scene failure is caught and recorded, which is right for one
    // flaky scene and catastrophic in aggregate: a misconfigured model or a
    // prompt that overflows the context window fails every scene the same way,
    // and the run walked through all 300 of them, marked the stage done, and
    // reported a finished novel. Consecutive failures with nothing written is
    // the signal that this is not bad luck.
    let consecutiveWriteFailures = 0
    const noteSceneOutcome = (ok: boolean) => {
      if (ok) {
        consecutiveWriteFailures = 0
        return
      }
      runFailedScenes.value++
      consecutiveWriteFailures++
      if (
        consecutiveWriteFailures >= WRITE_FAILURE_STREAK_ABORT &&
        writtenScenes.value.every((s: any) => !s)
      ) {
        throw new Error(
          `Aborting: the first ${consecutiveWriteFailures} scenes all failed to produce prose. ` +
            `Check the model and context settings for this project — nothing has been written, ` +
            `so no work is lost.`
        )
      }
    }

    const chaptersWithScenes: any[] = []
    let offset = 0
    for (const c of chapterPlan.value) {
      const group = scenePlan.value.slice(offset, offset + c.scenes.length)
      chaptersWithScenes.push({ chapterMeta: c, scenes: group, startIndex: offset })
      offset += c.scenes.length
    }

    progress.statusText = 'Phase 1: Generating chapter anchors in parallel...'

    async function generateAnchor(scene: any, role: any, constraints: any, sceneIndex: any, chapterIndex: any) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      const stream = makeSceneStream({ scene, sceneIndex, onChunk })
      try {
        const embeddingContext = await buildRetrievalContext(
          scene,
          writtenScenes.value.filter(Boolean),
          5,
          ragOptions
        )
        const { chosenProse, chosenStructured, chosenEval } = await writeSceneWithGate({
          scene,
          sceneIndex,
          scenePhase,
          storyArc,
          chapterLog: '',
          storyBible: storyBibleDocs,
          storyContract,
          existingEntitiesJson,
          embeddingContext,
          anchorRole: role,
          anchorConstraints: constraints,
          emitChunk: stream.emitChunk
        })
        const fullProse = chosenProse
        assertProse(fullProse, scene)
        stream.done(fullProse)

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        // The writer already returned a summary in its structured output; this
        // only falls back to a separate LLM call if it didn't.
        const summary = await computeSummary(fullProse, chosenStructured)
        const wordCount = countProseWords(fullProse)

        if (scene.subsectionId) {
          await manuscriptStore.updateSubsectionData(
            scene.subsectionId,
            { content: proseToHtml(fullProse), wordCount, contentStatus: 'generated' },
            projectId
          )
        }

        const chapterNumber = chaptersWithScenes[chapterIndex].chapterMeta.chapterNumber
        writtenScenes.value[sceneIndex] = {
          title: scene.title || `Scene ${scene.sceneNumber}`,
          prose: fullProse,
          summary,
          characters: scene.characters || scene.charactersPresent || [],
          location: scene.location || '',
          sceneNumber: scene.sceneNumber,
          subsectionId: scene.subsectionId,
          chapterId: chapterNumber,
          keyFacts: Array.isArray(chosenStructured?.keyFacts) ? chosenStructured.keyFacts : []
        }
        markSceneComplete()
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })
        // Checkpoint per scene. Without this the parallel writer — the path a
        // one-click volume actually takes — never wrote a resumable checkpoint
        // at all, so `getResumableRun` always returned null and the "Unfinished
        // draft" resume control could never appear no matter how far a run got.
        await commitService.persistCheckpoint(projectId)
        noteSceneOutcome(true)
        return { success: true, sceneIndex, structured: chosenStructured, eval: chosenEval }
      } catch (err: any) {
        stream.abandon()
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
        // A spent budget or a stop is not this scene's failure — every remaining
        // scene would fail the same way, instantly. Swallowing it here is what
        // turned an exhausted run into 300 no-ops and a false "complete".
        rethrowIfFatal(err)
        if (scene?.subsectionId) {
          await manuscriptStore
            .updateSubsectionData(scene.subsectionId, { contentStatus: 'failed' }, projectId)
            .catch(() => {})
        }
        noteSceneOutcome(false)
        return { success: false, sceneIndex, error: err.message }
      }
    }

    const anchorTasks = chaptersWithScenes.map((chGroup, chapterIndex) => {
      return async () => {
        const { chapterMeta, scenes, startIndex } = chGroup
        const prevSpine = chapterIndex > 0 ? spineArray.value[chapterIndex - 1] : null
        const prevEmotion = prevSpine?.emotionalStateAtEnd || 'story beginning'

        const openingConstraints = `Previous chapter ended with: ${prevEmotion}\\nThis scene must begin where the previous chapter left off emotionally.`
        const closingConstraints = `This scene MUST end on this exact hook:\\n"${chapterMeta.hookEnding}"\\nDo not soften it. Do not add resolution. End there.`

        const openingScene = scenes[0]
        const closingScene = scenes.length > 1 ? scenes[scenes.length - 1] : null

        const promises = [
          generateAnchor(
            openingScene,
            "Opening scene — this is the chapter's entry point.",
            openingConstraints,
            startIndex,
            chapterIndex
          )
        ]
        if (closingScene) {
          promises.push(
            generateAnchor(
              closingScene,
              'Closing scene — this scene MUST end on this exact hook.',
              closingConstraints,
              startIndex + scenes.length - 1,
              chapterIndex
            )
          )
        }

        const results = await Promise.all(promises)
        const failed = results.filter((r) => !r.success)
        return { chapterNumber: chapterMeta.chapterNumber, results, failed: failed.length > 0 }
      }
    })

    throwIfAborted()
    const limit = PARALLEL_CHAPTER_LIMIT()
    const anchorOutcomes = await parallelWithLimit(anchorTasks, limit)
    throwIfAborted()

    // Same damping term the batch path has. The anchor phase writes every
    // chapter opener before any bridge scene exists, so a model looping here
    // poisons the context of everything that follows it — this is the worst
    // possible place to keep going.
    if (runHealth.shouldAbort()) {
      await haltRun(
        writeParamsVal.projectId,
        runHealth.getAbortReason() || 'run health budget exceeded'
      )
      return
    }

    let anchorEvalFeedback = ''
    let anchorFocusInstructions = ''
    if (inlineEvalEnabled.value) {
      progress.statusText = 'Evaluating chapter anchors...'
      const anchorResults = []
      for (let idx = 0; idx < writtenScenes.value.length; idx++) {
        const s = writtenScenes.value[idx]
        if (!s) continue
        const sceneBrief = scenePlan.value.find((sp) => sp.sceneNumber === s.sceneNumber) || {}
        const criticResult = await critic.evaluateScene({
          draft: s.prose,
          sceneBrief,
          storyBible: storyBibleDocs,
          chapterLog: '',
          existingEntitiesJson: '',
          focusInstructions: ''
        })
        anchorResults.push({
          sceneIndex: idx + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          topIssues: (criticResult.issues || []).slice(0, 3).map((i) => i.text || i),
          dimensionScores: criticResult.dimensionScores || null
        })
      }
      evalStore.setResults(anchorResults)
      for (const ae of anchorResults) {
        const sb = scenePlan.value.find((sp) => sp.sceneNumber === ae.sceneIndex)
        persistCritiqueEval(ae, projectId, sb?.title, sb?.subsectionId)
      }
      anchorEvalFeedback = formatEvalFeedback(anchorResults)
      const anchorResult = promptAdjuster.updateAdjustments(anchorResults, { workspaceType: workspaceType.value })
      anchorFocusInstructions = anchorResult.focusInstructions
    }

    // Phase 2: Per-chapter wave-based parallel scene generation.
    // Within each chapter, scenes are grouped into waves of PARALLEL_SCENE_LIMIT.
    // Scenes within a wave run concurrently, then conflict detection scans the
    // wave's key facts for contradictions. If conflicts are found, a resolution
    // pass corrects them before any scene is committed — so later waves (and
    // readers) never see inconsistent state.
    progress.statusText = 'Phase 2: Generating chapter scenes in parallel waves...'

    async function generateMiddleScene(scene: any, sceneIndex: any, chapterMeta: any) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      const stream = makeSceneStream({ scene, sceneIndex, onChunk })
      try {
        // Chapter-scoped log: only scenes from this chapter (Fix #2 — never cross-chapter)
        const logEntries = writtenScenes.value
          .filter((s) => s && s.chapterId === chapterMeta.chapterNumber && s.summary)
          .map((s) => `Scene ${s.sceneNumber} ("${s.title}"): ${s.summary}`)
        const chapterLog = logEntries.join('\n')

        const embeddingContext = await buildRetrievalContext(
          scene,
          writtenScenes.value.filter(Boolean),
          5,
          ragOptions
        )

        const { chosenProse, chosenStructured, chosenEval } = await writeSceneWithGate({
          scene,
          sceneIndex,
          scenePhase,
          storyArc,
          chapterLog,
          storyBible: storyBibleDocs,
          storyContract,
          existingEntitiesJson,
          embeddingContext,
          pastEvalResults: anchorEvalFeedback || undefined,
          focusInstructions: anchorFocusInstructions || undefined,
          emitChunk: stream.emitChunk
        })
        const fullProse = chosenProse
        assertProse(fullProse, scene)
        stream.done(fullProse)

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse, chosenStructured)
        const wordCount = countProseWords(fullProse)

        markSceneComplete()
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })
        noteSceneOutcome(true)
        return {
          success: true,
          sceneIndex,
          scene,
          prose: fullProse,
          summary,
          wordCount,
          characters: scene.characters || scene.charactersPresent || [],
          location: scene.location || '',
          sceneNumber: scene.sceneNumber,
          subsectionId: scene.subsectionId,
          chapterId: chapterMeta.chapterNumber,
          keyFacts: Array.isArray(chosenStructured?.keyFacts) ? chosenStructured.keyFacts : [],
          structured: chosenStructured,
          eval: chosenEval
        }
      } catch (err: any) {
        stream.abandon()
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
        rethrowIfFatal(err)
        if (scene?.subsectionId) {
          await manuscriptStore
            .updateSubsectionData(scene.subsectionId, { contentStatus: 'failed' }, projectId)
            .catch(() => {})
        }
        noteSceneOutcome(false)
        return { success: false, sceneIndex, error: err.message }
      }
    }

    async function commitSceneResult(result: any) {
      if (!result.success) return
      if (result.subsectionId) {
        await manuscriptStore.updateSubsectionData(
          result.subsectionId,
          {
            content: proseToHtml(result.prose),
            wordCount: result.wordCount,
            contentStatus: 'generated'
          },
          projectId
        )
      }
      writtenScenes.value[result.sceneIndex] = {
        title: result.title || result.scene?.title || `Scene ${result.sceneNumber}`,
        prose: result.prose,
        summary: result.summary,
        characters: result.characters,
        location: result.location,
        sceneNumber: result.sceneNumber,
        subsectionId: result.subsectionId,
        chapterId: result.chapterId,
        keyFacts: result.keyFacts
      }
    }

    const middleOutcomes = []
    for (let chapterIndex = 0; chapterIndex < chaptersWithScenes.length; chapterIndex++) {
      const { chapterMeta, scenes, startIndex } = chaptersWithScenes[chapterIndex]
      const unwritten: any[] = []
      for (let j = 0; j < scenes.length; j++) {
        const sceneIndex = startIndex + j
        if (writtenScenes.value[sceneIndex] !== null) continue
        unwritten.push({ scene: scenes[j], sceneIndex })
      }
      if (unwritten.length === 0) continue

      for (let waveStart = 0; waveStart < unwritten.length; waveStart += PARALLEL_SCENE_LIMIT) {
        const waveEnd = Math.min(waveStart + PARALLEL_SCENE_LIMIT, unwritten.length)
        const wave = unwritten.slice(waveStart, waveEnd)

        throwIfAborted()

        const waveResults = await Promise.all(
          wave.map(({ scene, sceneIndex }) => generateMiddleScene(scene, sceneIndex, chapterMeta))
        )

        const conflicts = detectSceneConflicts(waveResults)
        if (conflicts.length > 0) {
          const changed = await resolveSceneConflicts(conflicts, waveResults)
          if (changed) {
            progress.statusText = `Reconciled ${conflicts.length} fact conflict(s) in parallel wave`
          }
        }

        for (let wi = 0; wi < wave.length; wi++) {
          const result = waveResults[wi]
          if (result.success) {
            await commitSceneResult(result)
            middleOutcomes.push(result)
          }
        }
        await commitService.persistCheckpoint(projectId)
      }
    }

    if (inlineEvalEnabled.value) {
      progress.statusText = 'Evaluating middle scenes...'
      const middleResults = []
      for (let idx = 0; idx < writtenScenes.value.length; idx++) {
        const s = writtenScenes.value[idx]
        if (!s || evalStore.results.some((r) => r.sceneIndex === idx + 1)) continue
        const sceneBrief = scenePlan.value.find((sp) => sp.sceneNumber === s.sceneNumber) || {}
        const criticResult = await critic.evaluateScene({
          draft: s.prose,
          sceneBrief,
          storyBible: storyBibleDocs,
          chapterLog: '',
          existingEntitiesJson: null,
          focusInstructions: null
        })
        middleResults.push({
          sceneIndex: idx + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          dimensionScores: criticResult.dimensionScores || null,
          topIssues: (criticResult.issues || []).slice(0, 3).map((i) => i.text || i)
        })
      }
      evalStore.setResults([...evalStore.results, ...middleResults])
      for (const me of middleResults) {
        const sb = scenePlan.value.find((sp) => sp.sceneNumber === me.sceneIndex)
        persistCritiqueEval(me, projectId, sb?.title, sb?.subsectionId)
      }
    }

    // Parallel-safe quality floor. The sequential path aborts on N *consecutive*
    // gate failures, which is undefined under parallel execution — so here we
    // use an aggregate fail-ratio over judged scenes. Only meaningful when the
    // gate actually ran (autoMode); otherwise no per-scene evals were produced.
    if (autoMode.value) {
      const QUALITY_FLOOR_FAIL_RATIO = 0.5
      const QUALITY_FLOOR_MIN_JUDGED = 4
      const anchorEvals = anchorOutcomes.flatMap((o: any) => (o?.results || []).map((r: any) => r?.eval))
      const gateEvals = [...anchorEvals, ...middleOutcomes.map((r: any) => r?.eval)].filter(Boolean)
      const judged = gateEvals.filter((e: any) => !e.evalUnavailable && e.score != null)
      const failed = judged.filter((e) => !isCleanPass(e))
      runFailedScenes.value = failed.length
      if (
        judged.length >= QUALITY_FLOOR_MIN_JUDGED &&
        failed.length / judged.length >= QUALITY_FLOOR_FAIL_RATIO
      ) {
        error.value = `Quality floor breached: ${failed.length}/${judged.length} scenes failed critique after retries. The writer or critic model is likely misconfigured. ${writtenScenes.value.filter(Boolean).length} scene(s) written and saved.`
        commitService.persistCheckpoint(projectId)
        await updateGenRunStage(projectId, 'prose', { status: 'failed', error: error.value })
        await delegatorApi.dispatch('ERROR', { error: error.value, message: error.value })
        return
      }
    }

    langfuseService.endSpan(parallelSpanId)
    await completeGeneration(projectId)
  }

  /**
   * Best-effort speculative prefetch of a single scene.
   * Fails silently — the cache is an optimisation, never a correctness requirement.
   */
  async function prefetchNextScene(index: any) {
    if (speculativeCache.has(index)) return
    if (!writeParams.value) return
    const { projectId, storyArc, storyContract, onChunk, storyBibleDocs, sections } =
      writeParams.value
    const scene = scenePlan.value[index]
    if (!scene) return

    speculativeCache.reserve(index)

    try {
      // Running chapter log, same shape the batch path builds. Previously '',
      // which meant a prefetched scene was written with no knowledge of the
      // scenes before it — a cache hit would have been worse than a miss.
      const chapterLog = writtenScenes.value
        .filter(Boolean)
        .map((ws: any) => `Scene ${ws.sceneNumber} ("${ws.title}"): ${ws.summary || '(written)'}`)
        .join('\n')

      // Was called with one argument — the written scenes — against a signature
      // of (characterList, locationList, plotThreadList), and `as any` hid it
      // from the typechecker. `locationList.map` threw on every single call, the
      // bare catch below swallowed it AND flushed the cache, so speculative
      // prefetch never once produced a hit.
      const existingEntitiesJson = await scopedEntitiesBlob(projectId)
      const scenePhase = null
      const result = await writeSceneWithGate({
        scene,
        sceneIndex: index,
        scenePhase,
        storyArc,
        chapterLog,
        storyBible: storyBibleDocs,
        storyContract,
        existingEntitiesJson,
        emitChunk: () => {}
      })
      speculativeCache.set(index, result)
      prefetchStats.hits++
    } catch (err: any) {
      // Still non-fatal — the cache is an optimisation, never a correctness
      // requirement — but no longer invisible. A permanently-dead cache used to
      // look identical to a cache that was simply never warm.
      prefetchStats.misses++
      prefetchStats.lastError = err?.message || String(err)
      runHealth.record('prefetch_failed', { stage: 'prefetch', sceneIndex: index })
      console.debug('[useVolumeStoryGenerator] speculative prefetch failed:', err)
      speculativeCache.flush()
    }
  }

  async function writeNextBatch(startIndex: any, incomingFocusInstructions = '') {
    if (!writeParams.value) return

    const { projectId, storyArc, storyContract, onChunk, storyBibleDocs, sections } =
      writeParams.value
    const endIndex = Math.min(startIndex + SYNC_BATCH_SIZE, scenePlan.value.length)

    // Build running chapter log once from existing scenes (Fix #2 — avoids O(n²) rebuild per scene)
    const runningChapterLog = writtenScenes.value
      .filter(Boolean)
      .map((ws) => `Scene ${ws.sceneNumber} ("${ws.title}"): ${ws.summary || '(written)'}`)

    // Build entities JSON once per batch (Fix #3 — entities don't change within a batch)
    const existingEntitiesJson = await scopedEntitiesBlob(projectId)

    // Everything older than the last 20 scenes used to leave the writer's view
    // entirely. Roll the committed scene digests up into chapter digests and
    // hand back the chapters that window no longer reaches. Pure aggregation —
    // no model call — so it is cheap enough to redo each batch.
    await rollupProjectDigests({ projectId, volumeId: volumeId.value })
    const earlierChapters = await buildEarlierChaptersBlock({
      projectId,
      recentSceneCount: RECENT_SCENE_LOG_LIMIT
    })

    let batchEvalFeedback = ''
    let batchFocusInstructions = incomingFocusInstructions

    for (let i = startIndex; i < endIndex; i++) {
      throwIfAborted()
      const scene = scenePlan.value[i]
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      progress.current = i + 1
      progress.sceneLabel = scene.title || `Scene ${scene.sceneNumber}`
      progress.statusText = `Drafting scene details, building continuity context, and streaming prose...`

      // Retrieve continuity context — prose excerpts for short drafts, semantic
      // retrieval once the story grows past the prose-excerpt ceiling — plus the
      // research chunks this scene is about.
      const embeddingContext = await buildRetrievalContext(
        scene,
        writtenScenes.value,
        5,
        researchRagOptions()
      )

      // Build chapter log from running array (O(1) slice instead of O(n) rebuild),
      // preceded by the summarised chapters that fall outside that window.
      const chapterLog = [earlierChapters, runningChapterLog.slice(-RECENT_SCENE_LOG_LIMIT).join('\n')]
        .filter(Boolean)
        .join('\n\n')

      // Retrieve rejected patterns for Writer
      const extraRejected = rejectedPatterns.value.length > 0 ? rejectedPatterns.value : undefined

      // Attach total scene count for context
      scene.totalScenes = scenePlan.value.length

      // Write the scene with structured output
      const effectiveStoryContract = scene.reRequestInstruction
        ? storyContract +
          `\n\nUser revision request for scene ${scene.sceneNumber}: ${scene.reRequestInstruction}`
        : storyContract
      if (scene.reRequestInstruction) delete scene.reRequestInstruction

      // Route through the shared per-scene quality gate (retry + critique +
      // best-attempt selection) — identical logic to the parallel path.
      // First check the speculative cache: if the user reviewed the previous
      // scene quickly enough, we may already have this scene pre-generated.
      let written
      let retryGate: any
      let maxAttempts: any
      if (speculativeCache.has(i)) {
        // Prefetched while the user was reviewing the previous scene — there is
        // nothing left to stream, so open it in the editor directly.
        written = speculativeCache.consume(i)
        if (scene.subsectionId) liveDraft.focusSubsection(scene.subsectionId)
      } else {
        retryGate = autoMode.value
        maxAttempts = retryGate ? SCENE_MAX_ATTEMPTS : 1
        const stream = makeSceneStream({ scene, sceneIndex: i, onChunk })
        try {
          written = await writeSceneWithGate({
            scene,
            sceneIndex: i,
            scenePhase,
            storyArc,
            chapterLog,
            storyBible: storyBibleDocs,
            storyContract: effectiveStoryContract,
            existingEntitiesJson,
            embeddingContext,
            extraRejected,
            pastEvalResults: batchEvalFeedback,
            focusInstructions: batchFocusInstructions,
            emitChunk: stream.emitChunk
          })
        } catch (err) {
          stream.abandon()
          throw err
        }
        stream.done(written?.chosenProse)
      }
      const { chosenProse, chosenStructured, chosenEval } = written
      // Before the phase is marked done: an empty result reaching this point
      // committed an empty scene and logged it as a success.
      assertProse(chosenProse, scene)
      actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })

      const fullProse = chosenProse
      structuredResults.push({ sceneIndex: i, structured: chosenStructured })

      if (sceneReviewMode.value && i < scenePlan.value.length - 1) {
        currentSceneResult.value = {
          scene,
          sceneIndex: i,
          fullProse,
          structured: chosenStructured,
          sectionIdx: sectionIndexForScene(sections, i)
        }
        currentWriteIndex.value = i + 1
        await delegatorApi.dispatch('SCENE_WRITTEN', {
          sceneResult: currentSceneResult.value,
          sceneIndex: i
        })
        void prefetchNextScene(i + 1)
        return
      }

      await commitService.commitAndStoreScene(
        scene,
        fullProse,
        sectionIndexForScene(sections, i),
        sections,
        projectId,
        chosenStructured,
        i
      )
      commitService.persistCheckpoint(projectId)

      if (retryGate && chosenEval) {
        const retryEntry = {
          sceneIndex: i + 1,
          passed: chosenEval.pass,
          score: chosenEval.score,
          dimensionScores: chosenEval.dimensionScores || null,
          topIssues: (chosenEval.issues || []).slice(0, 3).map((iss: any) => iss.text || iss)
        }
        evalStore.addResult(retryEntry)
        persistCritiqueEval(retryEntry, projectId, scene.title, scene.subsectionId)
        batchEvalFeedback = formatEvalFeedback(evalStore.results)
        const batchResult = promptAdjuster.updateAdjustments(evalStore.results, { workspaceType: workspaceType.value })
        batchFocusInstructions = batchResult.focusInstructions

        // Quality floor: a scene that still fails after all retries counts against
        // the run; too many in a row aborts (work so far is already saved).
        const judged = chosenEval && !chosenEval.evalUnavailable && chosenEval.score != null
        if (judged && !isCleanPass(chosenEval)) {
          runFailedScenes.value++
          runConsecutiveFailures.value++
          logRejectedPattern(
            `Scene ${scene.sceneNumber} failed critique after ${maxAttempts} attempt(s)`,
            fullProse.slice(0, 200)
          )
          if (runConsecutiveFailures.value >= QUALITY_FLOOR_CONSECUTIVE) {
            error.value = `Quality floor breached: ${runConsecutiveFailures.value} scenes in a row failed critique after retries. The writer or critic model is likely misconfigured. ${writtenScenes.value.filter(Boolean).length} scene(s) written and saved.`
            commitService.persistCheckpoint(projectId)
            await updateGenRunStage(projectId, 'prose', { status: 'failed', error: error.value })
            await delegatorApi.dispatch('ERROR', { error: error.value, message: error.value })
            actLog.updatePhase(currentTaskId, scenePhase, { status: 'error' })
            return
          }
        } else {
          runConsecutiveFailures.value = 0
        }
      } else if (inlineEvalEnabled.value) {
        const criticResult = await critic.evaluateScene({
          draft: scene.prose,
          sceneBrief: scene,
          storyBible: storyBibleDocs,
          chapterLog: '',
          existingEntitiesJson: null,
          focusInstructions: null
        })
        const evalEntry = {
          sceneIndex: i + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          dimensionScores: criticResult.dimensionScores || null,
          topIssues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss)
        }
        evalStore.addResult(evalEntry)
        persistCritiqueEval(evalEntry, projectId, scene.title, scene.subsectionId)
        batchEvalFeedback = formatEvalFeedback(evalStore.results)
        const batchResult2 = promptAdjuster.updateAdjustments(evalStore.results, { workspaceType: workspaceType.value })
        batchFocusInstructions = batchResult2.focusInstructions
      }

      // Append to running log after scene completes (avoids full rebuild next
      // iteration). Indexed by scene position — `at(-1)` read the last *slot*,
      // which on the positional array is a later, still-unwritten scene.
      const latestScene = writtenScenes.value[i]
      runningChapterLog.push(
        `Scene ${scene.sceneNumber} ("${scene.title || `Scene ${scene.sceneNumber}`}"): ${latestScene?.summary || '(written)'}`
      )
    }

    // Drift-triggered re-evaluation: check for regressions across the whole project
    // and append any regressed dimensions to the next batch's focus instructions.
    const batchScenes = writtenScenes.value.slice(startIndex).filter(Boolean)
    const driftResult = await driftTriggeredEval.check({
      projectId,
      scenes: batchScenes,
      workspaceType: workspaceType.value,
      scenePlanItems: scenePlan.value.slice(startIndex),
      storyBible: storyBibleDocs,
      chapterLog: ''
    })
    if (driftResult && (driftResult as any).triggered) {
      const regressed = (driftResult as any).action.regressedDims
      if (regressed.length > 0) {
        const driftFocus = `Quality regressions detected in: ${regressed.join(', ')}. Focus on improving these dimensions in the next batch.`
        batchFocusInstructions = batchFocusInstructions
          ? `${driftFocus}\n\n${batchFocusInstructions}`
          : driftFocus
      }
    }

    // Active learning bridge: periodic deep analysis (every 3 batches, once ≥5 evals)
    // merges its focus instructions and hint history into the prompt adjuster.
    const bridgeResult = activeLearningBridge.afterBatchEval(evalStore.results)
    if (bridgeResult?.focusInstructions) {
      batchFocusInstructions = batchFocusInstructions
        ? `${bridgeResult.focusInstructions}\n\n${batchFocusInstructions}`
        : bridgeResult.focusInstructions
    }
    if (bridgeResult?.givenHints?.length) {
      promptAdjuster.allGivenHints.value.push(...bridgeResult.givenHints)
    }

    // Early continuity audit at chapter boundaries (detection only).
    await consistencyService.maybeRunIncrementalConsistency(endIndex)

    // Discover entities from this batch only
    const freshStructured = structuredResults.slice(lastSyncedResultIndex.value)
    lastSyncedResultIndex.value = structuredResults.length

    const batchChanges = []
    for (const sr of freshStructured) {
      if (sr.structured) {
        const sceneChanges = sync.discoverSync(sr.structured)
        batchChanges.push(...sceneChanges)
        // A scene whose metadata extraction SUCCEEDED and still yielded nothing
        // for the bible is the signature of the frozen-bible failure. Recorded
        // separately from a metadata failure so the two are distinguishable:
        // "the extractor found nothing" and "the extractor never ran" produced
        // identical downstream state before `metadataStatus` existed.
        if (sceneChanges.length === 0 && sr.structured.metadataStatus === 'ok') {
          runHealth.record('sync_empty', { stage: 'sync' })
        }
      }
    }
    bibleChangesDiscovered.value += batchChanges.length

    if (endIndex < scenePlan.value.length) {
      if (batchChanges.length > 0) {
        hasPendingBatches.value = true
        pendingBatchStart.value = endIndex
        syncPreview.value = batchChanges
        await delegatorApi.dispatch('BATCH_COMPLETE', {
          batchStart: pendingBatchStart.value,
          batchEnd: endIndex,
          preview: batchChanges
        })
        // One-click mode: accept every discovered entity and keep writing
        if (autoMode.value) {
          await confirmSync({ acceptedEntities: batchChanges, projectId, volumeId: volumeId.value })
        }
        return
      }
      // The damping term. Without it the feedback loop has none: a degraded
      // scene degrades the next scene's context, so continuing past a run of
      // failures manufactures more of them. Stopping here costs the author the
      // scenes in the budget; not stopping cost them a whole volume.
      if (runHealth.shouldAbort()) {
        await haltRun(projectId, runHealth.getAbortReason() || 'run health budget exceeded')
        return
      }
      // Note: recursive — max depth = ceil(totalScenes / SYNC_BATCH_SIZE). Not a stack risk for typical volumes (<100 scenes) but consider a while-loop refactor if volumes scale significantly.
      await writeNextBatch(endIndex, batchFocusInstructions)
      return
    }

    if (batchChanges.length > 0) {
      syncPreview.value = batchChanges
      await delegatorApi.dispatch('BATCH_COMPLETE', {
        batchStart: pendingBatchStart.value,
        batchEnd: endIndex,
        preview: batchChanges
      })
      if (autoMode.value) {
        await confirmSync({ acceptedEntities: batchChanges, projectId, volumeId: volumeId.value })
      }
      return
    }

    await completeGeneration(projectId)
  }

  async function confirmPlan({
    projectId,
    editedPlan,
    storyArc,
    storyContract,
    synopsis,
    sparkContext,
    onPhaseChange,
    onChunk
  }: any) {
    if (phase.value !== 'plan-preview') return

    // Clear and seed evalStore from persisted history for project-scoped eval tracking
    await clearAndSeedEvalStore(projectId, evalStore)

    scenePlan.value = editedPlan
    progress.total = editedPlan.length
    progress.statusText =
      'Building manuscript structure, initializing sections, and assigning chapters...'

    // Create sections using Director-provided chapter boundaries
    const sections = []

    // Multi-volume: ensure a volume record exists for each requested volume,
    // so chapters land in the right volume. Volume 1 reuses the primary record.
    const volumeIdByIndex: Record<number, any> = { 1: volumeId.value }
    const maxVolumeIndex = Math.max(1, ...(chapterPlan.value || []).map((c) => c.volumeIndex || 1))
    for (let v = 2; v <= maxVolumeIndex; v++) {
      const vid = await volumeStore.createVolume(projectId, {
        title: `Volume ${v}`,
        description: `Volume ${v}`,
        // This is a LOOP over volumes 2..N. With the colour hardcoded, a
        // five-volume story produced five identically-coloured volumes — the
        // exact thing `getNextColor()` exists to prevent. It reads
        // `volumes.value`, which `createVolume` has already updated by the next
        // iteration, so each volume here gets a distinct colour.
        color: volumeStore.getNextColor(),
        sectionIds: []
      })
      volumeIdByIndex[v] = vid
    }

    // Build chapter groups for batch creation
    const groups = []
    if (chapterPlan.value && chapterPlan.value.length > 0) {
      let offset = 0
      for (const chapter of chapterPlan.value) {
        const group = editedPlan.slice(offset, offset + chapter.scenes.length)
        if (group.length === 0) {
          offset += chapter.scenes.length
          continue
        }
        groups.push({
          title: chapter.title || `Chapter ${chapter.chapterNumber || groups.length + 1}`,
          scenes: group,
          volumeId: volumeIdByIndex[chapter.volumeIndex || 1] || volumeId.value,
          chapterMeta: chapter
        })
        offset += chapter.scenes.length
      }
    } else {
      for (let i = 0; i < editedPlan.length; i += 3) {
        const group = editedPlan.slice(i, i + 3)
        groups.push({
          title: group[0].title
            ? `Part ${groups.length + 1}: ${group[0].title}`
            : `Part ${groups.length + 1}`,
          scenes: group,
          volumeId: volumeId.value,
          chapterMeta: null
        })
      }
    }

    // Batch-create all sections + subsections + volume assignments atomically.
    //
    // The branch id is not optional here. `loadManuscript` reads sections and
    // subsections through the `[projectId+branchId]` compound index, so rows
    // written without one are not in that index at all: the generated chapters
    // showed up in memory for the rest of the session and then vanished on the
    // next load, which is the "my generated chapters aren't in the editor" bug.
    const branchId = (branchStore as any).activeBranch?.id
    const batchResults = await batchCreatePlanStructure({ projectId, groups, branchId })

    // Update Pinia reactive state
    for (const sec of batchResults) {
      ;(manuscriptStore.sections as any[]).push({
        id: sec.id,
        projectId,
        branchId,
        order: (manuscriptStore.sections as any[]).length,
        status: 'planning',
        title: sec.title,
        summary: sec.summary,
        wordCount: 0
      })
      for (let j = 0; j < sec.subsectionIds.length; j++) {
        const scene = sec.scenes[j]
        ;(manuscriptStore.subsections as any[]).push({
          id: sec.subsectionIds[j],
          projectId,
          branchId,
          sectionId: sec.id,
          title: scene.title || `Scene ${scene.sceneNumber}`,
          description: `Scene ${scene.sceneNumber}`,
          content: '',
          wordCount: 0,
          type: 'scene',
          sceneNumber: scene.sceneNumber,
          contentStatus: 'pending',
          order: j
        })
      }
    }
    manuscriptStore.triggerStyleGuideRegen()

    // Build the sections array expected by the write pipeline
    sections.push(
      ...batchResults.map((sec: any) => ({
        id: sec.id,
        scenes: sec.scenes,
        subsectionIds: sec.subsectionIds,
        chapterMeta: sec.chapterMeta
      }))
    )

    // Structure (volumes/sections/subsections) is now materialized.
    await updateGenRunStage(projectId, 'structure', { status: 'done' })

    // Phase 0: Spine Generation
    progress.statusText = 'Generating hierarchical narrative spine...'
    await delegatorApi.dispatch('CONFIRMED', {
      autoMode: autoMode.value,
      sceneReviewMode: sceneReviewMode.value,
      inlineEval: inlineEvalEnabled.value
    })
    const spinePhase = actLog.addPhase(currentTaskId, 'Spine Generation')
    const spineSpanId = crypto.randomUUID()
    generationSpanIds.spine = spineSpanId
    langfuseService.span(generationTraceId.value!, spineSpanId, 'spine-generation', { projectId })
    try {
      // One model call per chapter, so a long book legitimately exceeds any fixed
      // budget; the per-chapter callback is the progress signal to bound instead.
      spineArray.value = await runStageWithHeartbeat(projectId, 'spine', (heartbeat) =>
        generateSpine(chapterPlan.value, storyArc, (done: any, total: any) => {
          heartbeat(`spine ${done}/${total}`)
          progress.statusText = `Generating narrative spine (${done}/${total} chapters)...`
          actLog.updatePhase(currentTaskId, spinePhase, {
            detail: `${done}/${total} chapter spine entries`
          })
        })
      )
      spineContext.value = compressSpine(spineArray.value)
      actLog.updatePhase(currentTaskId, spinePhase, { status: 'done' })
      langfuseService.endSpan(spineSpanId, { output: { chapters: spineArray.value?.length } })
    } catch (err: any) {
      error.value = describeRunFailure(err)
      actLog.updatePhase(currentTaskId, spinePhase, { status: 'failed' })
      // This catch rethrows past the prose handler below rather than into it, so
      // it has to close the task itself.
      if (currentTaskId) actLog.failTask(currentTaskId, error.value)
      await delegatorApi
        .dispatch('ERROR', { error: err, message: error.value })
        .catch(() => {})
      throw err
    }

    // Phase 3: Incremental writing
    await delegatorApi.dispatch('SPINE_GENERATED', undefined)
    error.value = null
    progress.statusText = 'Entering incremental drafting pipeline...'
    await updateGenRunStage(projectId, 'prose', {
      status: 'running',
      written: 0,
      total: scenePlan.value.length
    })

    const enhancedSynopsis = sparkContext
      ? `${synopsis}\n\nAdditional context from brainstorming:\n${sparkContext}`
      : synopsis

    // Cache story bible docs for the entire run (Fix #4 — avoids Dexie re-query per batch)
    const storyDocuments = useStoryDocuments()
    const storyBibleDocs = await storyDocuments.getStoryDocumentContext(projectId)

    writeParams.value = {
      projectId,
      storyArc,
      storyContract,
      synopsis: enhancedSynopsis,
      onChunk,
      sections,
      storyBibleDocs,
      // Carried for the whole run so every scene retrieves from the same sources
      // the plan was built from.
      research: activeResearchScope.value
    }

    // Seed prompt adjuster from persisted eval history for cross-run learning
    await seedPromptAdjusterFromHistory(projectId, workspaceType.value, promptAdjuster)

    // Drafting a full volume on local hardware is measured in hours — 30 scenes
    // at ~13 minutes each. The old wrapper passed no budget and so inherited
    // withTimeout's 5-minute default, which is why a 10-chapter run reliably died
    // around chapter 2 with most of its scenes never attempted.
    //
    // The watchdog beats on every streamed token, so the run survives for as long
    // as prose is actually arriving and fails promptly when it is not — and,
    // unlike the Promise.race it replaces, it does not leave the generation
    // running invisibly in the background after it has given up on it.
    try {
      await runStageWithHeartbeat(projectId, 'prose', (heartbeat) =>
        runParallelGeneration({
          ...writeParams.value,
          onChunk: (payload: any) => {
            heartbeat(payload?.scene?.title || `scene ${payload?.sceneIndex ?? ''}`)
            onChunk?.(payload)
          }
        })
      )
    } catch (err: any) {
      // Prose already committed stays committed, and the checkpoint written per
      // scene is what lets the author pick this back up — so the report says how
      // far it got rather than presenting a part-written book as a total loss.
      error.value = describeRunFailure(err)
      await commitService.persistCheckpoint(projectId)
      if (currentTaskId) actLog.failTask(currentTaskId, error.value)
      await delegatorApi.dispatch('ERROR', { error: err, message: error.value }).catch(() => {})
      throw err
    }
  }

  // End-of-run repair: regenerate any scene whose subsection was left empty (a
  // failed prose attempt in the parallel path). Isolated, best-effort, one extra
  // attempt each — a single bad scene never leaves a hole in the finished draft.
  async function repairFailedScenes(projectId: any) {
    const repairSpanId = crypto.randomUUID()
    generationSpanIds.repair = repairSpanId
    langfuseService.span(generationTraceId.value!, repairSpanId, 'scene-repair', { projectId })
    const scenesBySub = new Map()
    scenePlan.value.forEach((s, i) => {
      if (s.subsectionId) scenesBySub.set(s.subsectionId, { scene: s, index: i })
    })
    if (scenesBySub.size === 0) {
      langfuseService.endSpan(repairSpanId)
      return
    }

    const failed = (await getFailedSubsections(projectId)).filter((sub: any) => scenesBySub.has(sub.id))
    if (failed.length === 0) {
      langfuseService.endSpan(repairSpanId)
      return
    }

    progress.statusText = `Repairing ${failed.length} unwritten scene(s)...`
    const repairPhase = actLog.addPhase(currentTaskId, `Repairing ${failed.length} scene(s)`)

    const storyDocuments = useStoryDocuments()
    const storyBibleDocs =
      writeParams.value?.storyBibleDocs || (await storyDocuments.getStoryDocumentContext(projectId))
    const storyArc = writeParams.value?.storyArc || null
    const storyContract = writeParams.value?.storyContract || ''
    const existingEntitiesJson = await scopedEntitiesBlob(projectId)

    for (const sub of failed) {
      const { scene, index } = scenesBySub.get(sub.id)
      try {
        const priorScenes = writtenScenes.value
          .filter(Boolean)
          .filter((s) => s.subsectionId !== sub.id)
        const embeddingContext = await buildRetrievalContext(
          scene,
          priorScenes,
          5,
          researchRagOptions()
        )
        const result = await (writer.writeSceneStructured as any)({
          sceneBrief: scene,
          storyArc,
          chapterLog: '',
          storyBible: storyBibleDocs,
          embeddingContext,
          storyContract,
          existingEntitiesJson
        })
        const fullProse = result.prose
        if (fullProse && fullProse.trim()) {
          await manuscriptStore.updateSubsectionData(
            sub.id,
            {
              content: proseToHtml(fullProse),
              wordCount: countProseWords(fullProse),
              contentStatus: 'generated'
            },
            projectId
          )
          const rebuilt = {
            title: scene.title || `Scene ${scene.sceneNumber}`,
            prose: fullProse,
            summary: await computeSummary(fullProse, result.structured),
            characters: scene.characters || scene.charactersPresent || [],
            location: scene.location || '',
            sceneNumber: scene.sceneNumber,
            subsectionId: sub.id
          }
          // Positional, always: the old length-check appended a repaired scene to
          // the end whenever the array was shorter than its index, silently
          // reordering the draft.
          writtenScenes.value[index] = rebuilt
        } else {
          await manuscriptStore.updateSubsectionData(sub.id, { contentStatus: 'failed' }, projectId)
        }
      } catch (err: any) {
        console.warn('[useVolumeStoryGenerator] repair failed for subsection', sub.id, err)
        await manuscriptStore
          .updateSubsectionData(sub.id, { contentStatus: 'failed' }, projectId)
          .catch(() => {})
        // Repair is best-effort per scene, but there is nothing to repair with
        // once the budget is gone — stop rather than mark every hole as failed.
        rethrowIfFatal(err)
      }
    }
    actLog.updatePhase(currentTaskId, repairPhase, { status: 'done' })
    langfuseService.endSpan(repairSpanId)
  }

  /**
   * Dispatch only when the delegator has a route for it out of the current
   * phase. The terminal sequence can be entered from `writing`, `sync-preview`
   * or `scene-review` depending on how the run got here, so it steps through the
   * table rather than assuming a fixed starting phase.
   */
  async function advance(event: any, payload?: any) {
    if (!delegatorApi.canDispatch(event)) return false
    await delegatorApi.dispatch(event, payload)
    return true
  }

  /**
   * Finish a run: repair → continuity audit → commit → complete.
   *
   * This walks the delegator's real phase sequence. It used to jump straight
   * from `writing` to `complete` with a single WRITING_DONE, while the repair
   * and audit work ran unannounced underneath — so the "Checking continuity"
   * and "Saving" steps never lit up, and the audit's own phase assignment left
   * the machine in a phase WRITING_DONE had no route out of, which threw and
   * surfaced as a failed run at the end of every clean generation.
   */
  /**
   * Stop a run that is manufacturing damage, and say why.
   *
   * Deliberately not a silent return: the entire class of bug this exists to
   * prevent is a run that ends without anyone learning it went wrong.
   */
  async function haltRun(projectId: any, reason: string) {
    error.value = reason
    // Invariants evaluated here too, so the halt report says what the run failed
    // to deliver, not only which budget tripped.
    assertRunDelivered()
    actLog.appendThought(
      currentTaskId,
      null,
      `\n■ Generation halted — ${reason}\n${describeRunHealth(runHealth, runHealthViolations.value)}\n`
    )
    try {
      await updateGenRunStage(projectId, 'prose', { status: 'failed', error: reason })
    } catch {
      // Checkpoint bookkeeping must not mask the halt itself.
    }

    // A halted run keeps the scenes it did write, so its derived surfaces are
    // just as stale as a completed run's — and its outcome matters MORE to the
    // next session. `finalizeStoryArtifacts` previously ran only on the
    // completion path, so a stopped or errored run left every derived surface
    // untouched with no partial-progress recovery.
    try {
      const report = await finalizeStoryArtifacts({
        projectId,
        manuscriptStore,
        storyBibleStore,
        storyDocs: useStoryDocuments()
      })
      for (const e of report.errors) {
        runHealth.record('artifact_failed', { stage: 'finalize', detail: e })
      }
    } catch (err: any) {
      runHealth.record('artifact_failed', { stage: 'finalize', detail: err?.message || String(err) })
    }
    await persistRunArtifacts(projectId, { halted: true })

    await delegatorApi.dispatch('ERROR', { error: reason, message: reason })
  }

  /**
   * Did the run deliver what it claimed? Runs at the end of every generation,
   * on the values the pipeline already tracks.
   */
  function assertRunDelivered(): void {
    const written = writtenScenes.value.filter(Boolean)
    const withMetadata = written.filter(
      (s: any) => s?.structured?.metadataStatus === 'ok' || s?.summary
    ).length
    const proseText = written.map((s: any) => s.prose || '').join('\n\n')

    runHealthViolations.value = runHealth.checkInvariants({
      scenesWritten: written.length,
      scenesWithMetadata: withMetadata,
      bibleChangesCommitted: bibleChangesDiscovered.value,
      duplicateRatio: proseText ? duplicateRatio(proseText) : undefined
    })

    const report = describeRunHealth(runHealth, runHealthViolations.value)
    if (runHealthViolations.value.length > 0 || runHealth.getEvents().length > 0) {
      actLog.appendThought(currentTaskId, null, `\n${report}\n`)
    }
    const blocking = runHealthViolations.value.filter((v: any) => v.severity === 'block')
    if (blocking.length > 0) {
      // Surfaced, not thrown. The prose exists and the author should keep it —
      // but they must be told it did not meet the run's own claims, which is
      // precisely what thirteen scenes of duplicate text against a frozen bible
      // never told anyone.
      console.warn('[runHealth] run did not deliver:', blocking.map((v: any) => v.message).join(' | '))
    }
  }

  /**
   * Write the run-level artifacts: end-of-run story state and a session-archive
   * entry. Runs on BOTH the completion and halt paths — a halted run is exactly
   * the one whose outcome the next session most needs to know about.
   */
  async function persistRunArtifacts(projectId: any, { halted }: { halted: boolean }) {
    const written = writtenScenes.value.filter(Boolean)
    const wordCount = written.reduce((sum: number, s: any) => sum + countProseWords(s.prose), 0)

    const state = stateSummarizer.summarize()
    const stateResult = await saveRunStateSnapshot(projectId, state)
    if (!stateResult.ok) {
      runHealth.record('artifact_failed', { stage: 'state snapshot', detail: stateResult.detail })
    }

    const archiveResult = await archiveRun(projectId, {
      scenesWritten: written.length,
      wordCount,
      degradationSummary: runHealth.summary(),
      violations: runHealthViolations.value,
      halted
    })
    if (!archiveResult.ok) {
      runHealth.record('artifact_failed', { stage: 'session archive', detail: archiveResult.detail })
    }

    actLog.appendThought(
      currentTaskId,
      null,
      `${stateResult.detail} · ${archiveResult.detail}\n`
    )
  }

  async function completeGeneration(projectId: any) {
    const written = () => writtenScenes.value.filter(Boolean)
    const holes = () => writtenScenes.value.filter((s) => !s)

    // ── Repair: fill any holes left by failed scene generations ──
    await advance('ALL_WRITTEN', { failedScenes: holes() })
    try {
      await repairFailedScenes(projectId)
    } catch (err: any) {
      console.warn('[useVolumeStoryGenerator] repair pass failed:', err)
    }

    await updateGenRunStage(projectId, 'prose', {
      status: 'done',
      written: written().length,
      total: scenePlan.value.length || written().length
    })

    // ── Continuity audit (and, in auto mode, bounded fix rounds) ──
    // Reports what repair could NOT fill, so the activity log says how many
    // scenes are actually still missing rather than always saying zero.
    await advance('REPAIRED', { failedScenes: holes() })
    let auditIssues = 0
    try {
      const audit = await consistencyService.runTerminalConsistencyAudit(projectId, currentTaskId)
      auditIssues = audit?.issueCount || 0
    } catch (err: any) {
      console.warn('[useVolumeStoryGenerator] consistency audit failed:', err)
    }

    // The service already ran its fix rounds internally, so any issues left here
    // are ones it could not resolve. Report them, then proceed to commit — the
    // prose is written either way and the report is surfaced in the UI.
    if (auditIssues > 0) {
      const routed = await advance('HAS_ISSUES', {
        issues: consistencyReport.value ? [consistencyReport.value] : []
      })
      if (routed) await advance('MAX_ROUNDS', { round: 1, remaining: auditIssues })
    } else {
      await advance('NO_ISSUES')
    }

    // ── Populate every derived editor surface ──
    //
    // The run has committed the primary data — chapters, scenes, entities, graph
    // edges — but the surfaces built on top of it are not all self-updating. The
    // Story Canvas was only ever written by hand, and the story-bible documents
    // were created when missing but never refreshed, so a finished volume left
    // the canvas empty and the documents describing the project as it stood
    // BEFORE the run. Those same documents are the canon fed back to the model
    // next time, so staleness compounds.
    //
    // Additive and author-safe: an arranged canvas and hand-edited documents are
    // left alone. Never throws — these are derived from data already committed.
    // Status text says what this actually does. It used to promise "Populating
    // canvas, timeline and story bible documents" — but `finalizeStoryArtifacts`
    // only REFRESHES surfaces derived from the bible and touches nothing to do
    // with the timeline, which is a projection of `plotThreads`. With an empty
    // bible it produced an empty canvas while claiming to have populated one.
    progress.statusText = 'Refreshing canvas and story bible documents...'
    const artifactsPhase = actLog.addPhase(currentTaskId, 'Story Bible & Canvas')
    try {
      const report = await finalizeStoryArtifacts({
        projectId,
        manuscriptStore,
        storyBibleStore,
        storyDocs: useStoryDocuments()
      })
      actLog.appendThought(currentTaskId, artifactsPhase, describeFinalizeReport(report) + '\n')
      actLog.updatePhase(currentTaskId, artifactsPhase, {
        status: report.errors.length ? 'failed' : 'done',
        detail: `${report.canvasElements} canvas · ${report.documents.length} docs`
      })
      // `report.errors` was collected by three separate failure paths and then
      // used only as a log label. Now it reaches the ledger.
      for (const e of report.errors) {
        runHealth.record('artifact_failed', { stage: 'finalize', detail: e })
      }
    } catch (err: any) {
      console.warn('[useVolumeStoryGenerator] artifact finalization failed:', err)
      runHealth.record('artifact_failed', { stage: 'finalize', detail: err?.message || String(err) })
      actLog.updatePhase(currentTaskId, artifactsPhase, { status: 'failed' })
    }

    // Did this run deliver? Asserted before the run is declared complete.
    assertRunDelivered()

    // ── What the run leaves behind for the NEXT one ──
    // These three tables were empty after a real 13-scene run because nothing in
    // the pipeline ever wrote them. Group B in DERIVED-SURFACES-AUDIT.md.
    await persistRunArtifacts(projectId, { halted: false })

    // Final rollup: the last batch's scenes were committed after the in-run
    // rollup that preceded them, so without this the closing chapters would have
    // no digest and the NEXT run would start blind to how this one ended.
    try {
      await rollupProjectDigests({ projectId, volumeId: volumeId.value })
    } catch (err) {
      console.warn('[useVolumeStoryGenerator] final digest rollup failed:', err)
    }

    // Arrange the network into one box per volume. The grouping already existed
    // but only ever fired from the toolbar button, so a finished run left every
    // generated entity loose on the canvas and the feature read as missing.
    // Non-destructive: each volume's group is reused, manual groups survive.
    try {
      const { placed, grouped } = await groupNetworkByVolume({ projectId })
      if (placed > 0) {
        actLog.appendThought(
          currentTaskId,
          artifactsPhase,
          `Grouped ${placed} network node${placed === 1 ? '' : 's'} into ${grouped} volume${grouped === 1 ? '' : 's'}.\n`
        )
      }
    } catch (err) {
      console.warn('[useVolumeStoryGenerator] group-by-volume after run failed:', err)
    }

    // ── Commit + finalize ──
    await advance('COMMITTED')
    actLog.completeTask(currentTaskId)

    // Run finished cleanly — drop the crash-recovery checkpoint
    await clearGenRun(projectId)

    // Fallback for entry paths that skipped the sequence above (e.g. a
    // single-scene regeneration): make sure the run still lands on `complete`.
    if (phase.value !== 'complete') await advance('WRITING_DONE')

    progress.statusText = 'Volume generation complete!'
    progress.current = written().length
    progress.total = scenePlan.value.length || written().length

    // Leave the user looking at real prose. Without this the editor still shows
    // whatever was open before the run started.
    const firstWritten = written()[0]
    if (firstWritten?.subsectionId) liveDraft.focusSubsection(firstWritten.subsectionId)

    // A scene that failed every attempt leaves a null hole in the positional
    // array; reducing over it unguarded threw *after* the run had succeeded.
    const totalWords = written().reduce((sum, s) => sum + countProseWords(s.prose), 0)

    try {
      const { db } = await import('../services/db-core')
      await (db as any).generatedStories.add({
        projectId,
        title: `Volume Story — ${new Date().toLocaleDateString()}`,
        generatedAt: new Date().toISOString(),
        totalWords,
        qualityScore: consistencyReport.value
          ? ((consistencyReport.value.characterIssues?.length || 0) +
              (consistencyReport.value.locationIssues?.length || 0)) *
            -1
          : 0
      })
    } catch {
      // Non-critical: generatedStories save
    }
    langfuseService.score(
      generationTraceId.value!,
      'volume-generation',
      error.value ? 0 : 1,
      error.value ? `Failed: ${error.value}` : 'Completed'
    )
  }

  /**
   * Aggregate generated scene content into chapter (section) content.
   *
   * Joins each section's subsections' HTML content (ordered by `order`, skipping
   * empties), separated by `<hr>`. Updates section `content`, `wordCount` (sum of
   * subsection counts), and `status: 'generated'`.
   *
   * Scope guard: only aggregates sections created in THIS run (tracked via
   * `runCreatedSectionIds`), so hand-written/edited chapters are never clobbered.
   */
  async function aggregateChapterContent() {
    const sections = manuscriptStore.sections
    const subsectionsBySection = manuscriptStore.subsectionsBySection

    for (const section of sections) {
      // Only aggregate sections created in this run
      if (!runCreatedSectionIds.value.has(section.id)) continue

      // `subsectionsBySection` is a computed Record<string, any[]>, not a Map
      // (manuscriptStore.ts:74). `.get(id)` therefore read the property named
      // "get", got undefined, and `|| []` turned that into an empty array — so
      // every section hit `subs.length === 0` and chapter aggregation silently
      // did nothing at all.
      const subs = [...(subsectionsBySection[section.id] || [])].sort(
        (a: any, b: any) => (a.order || 0) - (b.order || 0)
      )
      if (subs.length === 0) continue

      const htmlParts = subs.map((s: any) => s.content).filter(Boolean)
      if (htmlParts.length === 0) continue

      const joinedHtml = htmlParts.join('<hr>')
      const totalWords = subs.reduce(
        (sum: number, s: any) => sum + (s.wordCount || 0),
        0
      )

      await manuscriptStore.updateSectionData(
        section.id,
        {
          content: joinedHtml,
          wordCount: totalWords,
          status: 'generated'
        },
        projectStore.currentProjectId
      )
    }
  }

  async function confirmSync(opts: any) {
    await sceneInteractionService.confirmSync(opts)
  }

  async function regenerateScene(projectId: any, sceneIndex: any) {
    speculativeCache.flush()
    await sceneInteractionService.regenerateScene(projectId, sceneIndex)
  }

  async function approveScene() {
    await sceneInteractionService.approveScene()
  }

  async function rejectScene() {
    speculativeCache.flush()
    await sceneInteractionService.rejectScene()
  }

  async function rerequestScene(edits: any) {
    speculativeCache.flush()
    await sceneInteractionService.rerequestScene(edits)
  }

  /**
   * Ask the current run to stop.
   *
   * Aborts the in-flight request via the signal the providers already honour,
   * and the `throwIfAborted()` guards stop the next unit of work from starting.
   * A scene is 3-5 calls, so a run unwinds within roughly one scene rather than
   * one volume.
   *
   * Prose already committed stays committed — that is deliberate. A user who
   * stops after 20 good scenes wants the 20 scenes, not an empty project. The
   * checkpoint written per scene is what makes resuming possible.
   *
   * @returns {boolean} whether there was anything to stop
   */
  function stop() {
    if (!abort.cancel()) return false
    isCancelling.value = true
    progress.statusText = 'Stopping…'
    if (currentTaskId) {
      actLog.appendThought(currentTaskId, 0, '\n⏹ Generation stopped by user.\n')
    }
    return true
  }

  // ─── Generating on top of an existing manuscript ──────────────────────────
  //
  // Everything above assumes a run owns the book: it plans, it writes, it
  // finishes. That is the only mode there was, which is why a run that stopped
  // partway left the author with no way forward except starting over and
  // throwing away what had been written.
  //
  // These three operations work the other direction — they read the manuscript
  // as it stands and add to it:
  //
  //   fill    — write the scenes that were planned but never drafted
  //   extend  — plan and write new chapters that continue the existing story
  //   expand  — rewrite one thin scene at length, in place
  //
  // All three go through `writeSceneWithGate`, so continuation prose gets the
  // same quality gate, scene chunking, entity scoping and live streaming as a
  // first-pass draft rather than a second, weaker writing path.

  /** Read the project's current state without generating anything. */
  async function surveyContinuation(projectId: any) {
    if (!projectId) return null
    if ((manuscriptStore.sections as any[]).length === 0) {
      await manuscriptStore.loadManuscript(projectId)
    }
    return surveyManuscript(
      manuscriptStore.sections as any[],
      manuscriptStore.subsections as any[]
    )
  }

  /**
   * Write a set of already-materialized scenes into their subsections.
   *
   * Serial, deliberately. The parallel writer exists to fill an empty book fast;
   * here every scene is being fitted between prose that already exists, and the
   * scene before is part of the context for the scene after. Writing them out of
   * order would be faster and worse.
   */
  async function writeScenesInto(
    targets: any[],
    { projectId, survey, checkpointPlan, targetWords, storyBibleDocs, storyArc, storyContract, instructions, onChunk }: any
  ) {
    const report = emptyReport()
    report.remaining = targets.length
    let consecutiveFailures = 0

    const existingEntitiesJson = await scopedEntitiesBlob(projectId)

    for (const target of targets) {
      throwIfAborted()

      const scene = {
        ...briefForScene(target, checkpointPlan, targetWords),
        subsectionId: target.subsectionId
      }
      const phaseLabel = `Continuing: "${target.title}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseLabel)
      const stream = makeSceneStream({ scene, sceneIndex: target.index, onChunk })

      progress.statusText = `Writing "${target.title}" (${report.written + report.failed + 1} of ${targets.length})...`
      progress.sceneLabel = target.title

      try {
        const { chosenProse, chosenStructured } = await writeSceneWithGate({
          scene,
          sceneIndex: target.index,
          scenePhase,
          storyArc,
          chapterLog: target.chapterSummary
            ? `This scene belongs to "${target.chapterTitle}": ${target.chapterSummary}`
            : '',
          storyBible: storyBibleDocs,
          storyContract,
          existingEntitiesJson,
          // The prose on either side of this scene, so the new text joins the
          // book instead of restarting it — plus the research it draws on.
          embeddingContext: [
            neighbourContext(survey, target.index),
            instructions || '',
            await researchCitationsFor(scene, projectId)
          ]
            .filter(Boolean)
            .join('\n\n'),
          emitChunk: stream.emitChunk
        })

        const prose = chosenProse
        if (!prose || !prose.trim()) {
          // An empty result is a failure, not a success with no words. Recording
          // it as `generated` is what let a run of empty scenes look finished.
          stream.abandon()
          actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
          await manuscriptStore.updateSubsectionData(
            target.subsectionId,
            { contentStatus: 'failed' },
            projectId
          )
          report.failed++
          report.remaining--
          continue
        }

        stream.done(prose)
        const wordCount = countProseWords(prose)
        await manuscriptStore.updateSubsectionData(
          target.subsectionId,
          { content: proseToHtml(prose), wordCount, contentStatus: 'generated' },
          projectId
        )

        // Keep the survey current: the scene just written is context for the next.
        target.prose = prose
        target.wordCount = wordCount

        writtenScenes.value[target.index] = {
          title: target.title,
          prose,
          summary: await computeSummary(prose, chosenStructured),
          characters: scene.charactersPresent || scene.characters || [],
          location: scene.location || '',
          sceneNumber: target.sceneNumber,
          subsectionId: target.subsectionId,
          keyFacts: Array.isArray(chosenStructured?.keyFacts) ? chosenStructured.keyFacts : []
        }

        report.written++
        report.words += wordCount
        report.remaining--
        consecutiveFailures = 0
        progress.current = report.written
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })
      } catch (err: any) {
        stream.abandon()
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
        if (isFatalRunError(err)) {
          // Budget spent or user stopped: every remaining scene would fail the
          // same way. Report where it got to instead of grinding through them.
          report.stoppedBy = describeRunFailure(err)
          return report
        }
        console.warn('[useVolumeStoryGenerator] continuation scene failed:', target.title, err)
        report.failed++
        report.remaining--
        consecutiveFailures++

        // Same reasoning as the drafting path: a run producing nothing is not
        // unlucky, it is broken. Without this the continuation walked every
        // remaining scene and logged an identical failure for each one.
        if (consecutiveFailures >= WRITE_FAILURE_STREAK_ABORT && report.written === 0) {
          report.stoppedBy =
            `the first ${consecutiveFailures} scenes all failed to produce prose ` +
            `(${err.message || 'unknown error'}). Nothing was written, so no work is lost.`
          return report
        }
      }
    }

    return report
  }

  /** Shared setup for every continuation run. */
  async function beginContinuation(projectId: any, label: string, sceneCount: number) {
    abort.ensure()
    isCancelling.value = false
    liveDraft.reset()
    error.value = null
    continuationReport.value = null
    isContinuing.value = true
    // Continuation reuses the one-click quality gate — an author asking for more
    // prose wants it held to the same bar as the first pass.
    autoMode.value = true
    currentTaskId = actLog.addTask({ name: label, type: 'generation' })
    progress.current = 0
    progress.total = sceneCount
    sizeSessionBudget({ chapters: Math.max(1, Math.ceil(sceneCount / 3)), scenes: sceneCount })
    return useStoryDocuments().getStoryDocumentContext(projectId)
  }

  function endContinuation(report: any) {
    continuationReport.value = report
    isContinuing.value = false
    isCancelling.value = false
    progress.statusText = report?.stoppedBy
      ? `Stopped — ${describeReport(report)}`
      : `Done — ${describeReport(report)}`
    if (currentTaskId) actLog.completeTask(currentTaskId)
    return report
  }

  /**
   * Write every planned-but-unwritten scene in the project.
   *
   * This is the direct answer to a run that planned a hundred chapters and
   * drafted none of them: the structure is already correct and already on disk,
   * so there is nothing to re-plan — only prose to write into it.
   *
   * @param {boolean} [includeShort] Also redraft scenes that came out as stubs.
   */
  async function continueDrafting({ projectId, includeShort, targetWords, onChunk }: any) {
    if (isContinuing.value) return null
    const survey = await surveyContinuation(projectId)
    if (!survey) return null

    const targets = includeShort
      ? [...survey.unwritten, ...survey.short].sort((a, b) => a.index - b.index)
      : survey.unwritten
    if (targets.length === 0) {
      return endContinuation({ ...emptyReport(), skipped: survey.scenes.length })
    }

    const run = await getGenRun(projectId)
    const checkpointPlan = Array.isArray(run?.state?.scenePlan) ? run.state.scenePlan : null
    const storyBibleDocs = await beginContinuation(
      projectId,
      'Continue drafting',
      targets.length
    )

    try {
      const report = await writeScenesInto(targets, {
        projectId,
        survey,
        checkpointPlan,
        targetWords: targetWords || 1200,
        storyBibleDocs,
        storyArc: run?.state?.storyArc || null,
        storyContract: run?.state?.storyContract || '',
        onChunk
      })
      return endContinuation(report)
    } catch (err: any) {
      error.value = describeRunFailure(err)
      isContinuing.value = false
      throw err
    }
  }

  /**
   * Plan and write new chapters that continue the existing story.
   *
   * The existing draft is passed to the director as evidence and to the writer
   * as canon, so the new chapters pick up from where the book actually ends
   * rather than restarting the premise — which is what happens if you simply run
   * the generator again on the same project.
   */
  async function extendStory({
    projectId,
    volumes = 1,
    chaptersPerVolume = 1,
    scenesPerChapter = 3,
    wordsPerChapter = 3000,
    synopsis,
    genre,
    tone,
    onChunk
  }: any) {
    if (isContinuing.value) return null
    const survey = await surveyContinuation(projectId)
    if (!survey) return null

    const chapters = Math.max(1, volumes * chaptersPerVolume)
    const newScenes = chapters * Math.max(1, scenesPerChapter)
    const storyBibleDocs = await beginContinuation(projectId, 'Extend story', newScenes)

    try {
      progress.statusText = `Planning ${chapters} new chapter(s) from the existing draft...`

      // What the story has actually become, in its own words. Titles alone are
      // not enough — the director has to know where the book currently ends to
      // write a chapter that follows it.
      const tail = survey.written.slice(-6)
      const storySoFar = tail.length
        ? '# The story so far (already written — continue from here)\n' +
          tail
            .map((s) => {
              const text = String(s.prose).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
              return `- ${s.chapterTitle} / "${s.title}": ${text.slice(0, 400)}…`
            })
            .join('\n')
        : ''
      const lastScene = survey.written[survey.written.length - 1]
      const endsOn = lastScene
        ? `\n\nThe manuscript currently ENDS on "${lastScene.title}" (in "${lastScene.chapterTitle}"). Chapter 1 of this continuation must follow directly from that moment.`
        : ''

      const evidence = [storyBibleDocs, storySoFar].filter(Boolean).join('\n\n') + endsOn

      const directorResult = await runStageWithHeartbeat(
        projectId,
        'structure',
        (heartbeat) =>
          director.generateStoryPlan({
            goal: {
              premise: synopsis || survey.scenes[0]?.chapterSummary || 'Continue the existing story',
              genre,
              tone,
              wordTarget: chapters * wordsPerChapter,
              horizon: 'long_term',
              structure: { volumes, chaptersPerVolume, chapters, scenesPerChapter, wordsPerChapter }
            },
            evidence,
            research: null,
            onPartialData: (_t: any, name: any) => {
              heartbeat(name)
              actLog.appendThought(currentTaskId, 0, `• ${name}\n`)
            }
          })
      )

      const newChapters = directorResult.chapters || []
      if (newChapters.length === 0) throw new Error('The planner returned no new chapters')

      // Materialize the new chapters AFTER the existing ones. `order` continues
      // from the current section count so the additions read as a continuation
      // rather than being interleaved into the existing book.
      progress.statusText = 'Adding new chapters to the manuscript...'
      const branchId = (branchStore as any).activeBranch?.id
      const targetVolumeId =
        (manuscriptStore.sections as any[]).slice(-1)[0]?.volumeId || volumeId.value || null

      const groups = newChapters
        .filter((c: any) => Array.isArray(c.scenes) && c.scenes.length > 0)
        .map((c: any, i: number) => ({
          title: c.title || `Chapter ${survey.chapters + i + 1}`,
          scenes: c.scenes.map((s: any, j: number) => ({
            ...s,
            sceneNumber: survey.scenes.length + i * scenesPerChapter + j + 1,
            estimatedWords: Math.round(wordsPerChapter / Math.max(1, scenesPerChapter))
          })),
          volumeId: targetVolumeId,
          chapterMeta: c
        }))

      const created = await batchCreatePlanStructure({ projectId, groups, branchId, startOrder: survey.chapters })
      await manuscriptStore.loadManuscript(projectId)

      const extended = surveyManuscript(
        manuscriptStore.sections as any[],
        manuscriptStore.subsections as any[]
      )
      const newIds = new Set(created.flatMap((s: any) => s.subsectionIds))
      const targets = extended.scenes.filter((s) => newIds.has(s.subsectionId))
      const plannedBriefs = created.flatMap((s: any) => s.scenes)

      progress.total = targets.length
      const report = await writeScenesInto(targets, {
        projectId,
        survey: extended,
        checkpointPlan: plannedBriefs,
        targetWords: Math.round(wordsPerChapter / Math.max(1, scenesPerChapter)),
        storyBibleDocs,
        storyArc: directorResult.storyArc,
        storyContract: '',
        onChunk
      })
      return endContinuation(report)
    } catch (err: any) {
      error.value = describeRunFailure(err)
      isContinuing.value = false
      throw err
    }
  }

  /**
   * Redraft one scene at length, keeping its place in the book.
   *
   * The existing prose is handed back as the thing being rewritten, not as
   * context to continue from — otherwise the model appends a second scene to the
   * first instead of replacing it.
   */
  async function expandScene({ projectId, subsectionId, targetWords = 1500, instructions, onChunk }: any) {
    if (isContinuing.value) return null
    const survey = await surveyContinuation(projectId)
    if (!survey) return null

    const target = survey.scenes.find((s) => s.subsectionId === subsectionId)
    if (!target) return null

    const existing = String(target.prose).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const rewriteBrief = [
      existing
        ? `EXISTING DRAFT OF THIS SCENE (rewrite it at greater length — keep every event, character and outcome; add depth, sensory detail and interiority rather than new plot):\n${existing}`
        : '',
      instructions ? `AUTHOR'S INSTRUCTIONS: ${instructions}` : ''
    ]
      .filter(Boolean)
      .join('\n\n')

    const run = await getGenRun(projectId)
    const storyBibleDocs = await beginContinuation(projectId, `Expand "${target.title}"`, 1)

    try {
      const report = await writeScenesInto([target], {
        projectId,
        survey,
        checkpointPlan: Array.isArray(run?.state?.scenePlan) ? run.state.scenePlan : null,
        targetWords,
        storyBibleDocs,
        storyArc: run?.state?.storyArc || null,
        storyContract: run?.state?.storyContract || '',
        instructions: rewriteBrief,
        onChunk
      })
      return endContinuation(report)
    } catch (err: any) {
      error.value = describeRunFailure(err)
      isContinuing.value = false
      throw err
    }
  }

  async function reset() {
    // Abort before clearing. Previously reset() cleared the refs while in-flight
    // fetches kept running and their writers kept writing into the store behind
    // it — the state came back, seconds after being wiped.
    stop()
    abort.reset()
    isCancelling.value = false
    speculativeCache.flush()
    liveDraft.reset()

    await delegatorApi.dispatch('RESET', undefined)
    progress.current = 0
    progress.total = 0
    progress.sceneLabel = ''
    error.value = null
    volumeId.value = null
    scenePlan.value = []
    writtenScenes.value = []
    consistencyReport.value = null
    syncPreview.value = []
    structuredResults = []
    rejectedPatterns.value = []
    hasPendingBatches.value = false
    pendingBatchStart.value = 0
    lastSyncedResultIndex.value = 0
    writeParams.value = null
    sceneReviewMode.value = false
    autoMode.value = false
    runConsecutiveFailures.value = 0
    runFailedScenes.value = 0
    evalUnavailableCount.value = 0
    currentSceneResult.value = null
    currentWriteIndex.value = 0
    runHealth.reset()
    runHealthViolations.value = []
    bibleChangesDiscovered.value = 0
    // Rehydrate prompt adjuster from persisted history instead of clearing
    // This preserves cross-run hint history and repeat-dampening
    await rehydratePromptAdjuster(
      projectStore.currentProjectId,
      workspaceType.value,
      promptAdjuster
    )
  }

  return {
    phase,
    progress,
    error,
    volumeId,
    scenePlan,
    writtenScenes,
    consistencyReport,
    rejectedPatterns,
    evalUnavailableCount,
    stop,
    isCancelling,
    isBootstrapping: bootstrapper.isBootstrapping,
    isWriting: writer.isWriting,
    isCheckingConsistency: critic.isCheckingConsistency,
    startGeneration,
    // Generating on top of an existing manuscript
    isContinuing,
    continuationReport,
    surveyContinuation,
    continueDrafting,
    extendStory,
    expandScene,
    describeContinuation: describeReport,
    confirmPlan,
    confirmSync,
    syncPreview,
    prefetchStats,
    runHealth,
    runHealthViolations,
    bibleChangesDiscovered,
    hasPendingBatches,
    pendingBatchStart,
    logRejectedPattern,
    getResumableRun,
    resumeGeneration,
    runFailedScenes,
    sceneReviewMode,
    autoMode,
    inlineEvalEnabled,
    followInEditor,
    setFollowInEditor(value: boolean) {
      followInEditor.value = !!value
      liveDraft.setEnabled(followInEditor.value)
    },
    currentSceneResult,
    currentWriteIndex,
    approveScene,
    rejectScene,
    rerequestScene,
    regenerateScene,
    reset,
    delegator: delegatorApi.delegator,
    memory: delegatorApi.memory,
    dispatch: delegatorApi.dispatch,
    runCreatedSectionIds,
    aggregateChapterContent
  }
}

export {
  buildEmbeddingContext,
  selectRelevantPriorScenes,
  formatFullSpineEntry,
  compressSpine,
  buildExistingEntitiesBlob,
  buildSceneEntitiesBlob,
  parallelWithLimit,
  generateSpine,
  fallbackSpineEntry,
  detectSceneConflicts,
  resolveSceneConflicts,
  assertProse
}
