import { ref, reactive, computed } from 'vue'
import { formatEvalFeedback } from '../services/evalFeedback'
import { autoAdjustPrompt } from '../evaluation/autoPromptAdjuster'
import { gateDimensionCoverage, gateScoreDistribution } from '../services/evalGates'
import { useProjectStore } from '../stores/projectStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStore } from '../stores/volumeStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useStoryDirector } from './useStoryDirector'
import { useEntityBootstrapper } from './useEntityBootstrapper'
import { useStoryWriter } from './useStoryWriter'
import { useStoryCritic } from './useStoryCritic'
import { useChapterGenerationSync } from './useChapterGenerationSync'
import { useStoryDocuments } from './useStoryDocuments'
import { useActivityLog } from './useActivityLog'
import { generateRelationships } from './generation/generators/relationships'
import { getFailedSubsections, batchCreatePlanStructure } from '../services/db-structure'
import {
  saveGenRun,
  clearGenRun,
  getGenRun,
  updateGenRunStage,
  makeInitialGenState
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
  EMBEDDING_CONTEXT_MAX_CHARS,
  PROSE_EXCERPT_MAX_SCENES,
  buildEmbeddingContext,
  selectRelevantPriorScenes,
  buildRetrievalContext
} from './generation/context/sceneContext'
import { parallelWithLimit, computeSummary } from './generation/utils'
import { CommitService } from './generation/commit'
import { ConsistencyService } from './generation/consistency'
import { GenerationLifecycleService, createAbortScope, isAbortError } from './generation/lifecycle'
import { SceneInteractionService } from './generation/interaction'
import { useDelegatorGeneration } from './generation/delegator'

import { getResumableRun } from './generation/checkpoint'
import { buildPreliminaryEdges } from './generation/graph'

// Map a global scene index to its section (chapter) index using each section's
// actual scene count — replaces the old Math.floor(i / 3) that silently assumed
// exactly 3 scenes per chapter and mis-attributed word counts otherwise.
function sectionIndexForScene(sections, sceneIndex) {
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
// One-click quality guardrails: rewrite a scene that fails critique up to this
// many times, and abort the whole run if this many scenes fail back-to-back
// (signals a broken model/critic rather than letting it churn out garbage).
const SCENE_MAX_ATTEMPTS = 2
const QUALITY_FLOOR_CONSECUTIVE = 3

function attemptScore(ev) {
  return ev && !ev.evalUnavailable && typeof ev.score === 'number' ? ev.score : -1
}
function isCleanPass(ev) {
  return !!(ev && !ev.evalUnavailable && ev.pass)
}

export function useVolumeStoryGenerator() {
  const progress = reactive({ current: 0, total: 0, sceneLabel: '', statusText: '' })
  const error = ref(null)
  const volumeId = ref(null)
  const scenePlan = ref([])
  const chapterPlan = ref([])
  const spineArray = ref([])
  const spineContext = ref('')
  const writtenScenes = ref([])
  const consistencyReport = ref(null)
  const rejectedPatterns = ref([])
  const syncPreview = ref([])
  let structuredResults = []
  const hasPendingBatches = ref(false)
  const pendingBatchStart = ref(0)
  const lastSyncedResultIndex = ref(0)
  const writeParams = ref(null)
  const sceneReviewMode = ref(false)
  const autoMode = ref(false)
  // How many scenes were accepted without the quality gate actually running.
  // Non-zero means the run's quality signal is partly fiction.
  const evalUnavailableCount = ref(0)

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
  const isCancelling = ref(false)
  const runConsecutiveFailures = ref(0)
  const runFailedScenes = ref(0)
  const currentSceneResult = ref(null)
  const currentWriteIndex = ref(0)
  const inlineEvalEnabled = ref(false)
  const sceneEvalResults = ref([])
  const allGivenHints = ref([])
  const actLog = useActivityLog()
  let currentTaskId = null

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
  const projectStore = useProjectStore()
  const workspaceType = computed(() => projectStore.activeWorkspaceType)

  const delegatorApi = useDelegatorGeneration()
  const phase = delegatorApi.memory.phase

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
    sceneEvalResults,
    lastSyncedResultIndex,
    syncPreview,
    currentTaskId,
    volumeId,
    consistencyService
  })
  sceneInteractionService.onWriteNextBatch = (i) => writeNextBatch(i)
  sceneInteractionService.onCompleteGeneration = (pid) => completeGeneration(pid)

  // Wire locally-constructed services into Delegator memory so tool wrappers
  // (commitTool, consistencyTool, sceneTool) can reach them via memory.instances.*
  const { memory } = delegatorApi
  memory.instances.commitService = commitService
  memory.instances.consistencyService = consistencyService
  memory.instances.sceneInteractionService = sceneInteractionService

  function logRejectedPattern(context, prose) {
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
  async function resumeGeneration({ projectId, onChunk, onPhaseChange }) {
    if (phase.value !== 'idle') return { resumed: false, reason: 'busy' }
    const run = await getGenRun(projectId)
    if (!run || !run.state) return { resumed: false, reason: 'no-checkpoint' }

    const state = run.state
    const plan = Array.isArray(state.scenePlan) ? state.scenePlan : []
    const chapters = Array.isArray(state.chapterPlan) ? state.chapterPlan : []
    if (plan.length === 0 || chapters.length === 0) {
      return { resumed: false, reason: 'invalid-checkpoint' }
    }

    // The manuscript must still be loaded so we can read existing prose
    const subs = manuscriptStore.subsections
    const subById = new Map(subs.map((s) => [s.id, s]))
    // Subsections in the plan must exist in the manuscript store — if the
    // volume structure changed after the plan was saved, bail out immediately.
    const missingIds = plan.filter((s) => s.subsectionId && !subById.has(s.subsectionId))
    if (missingIds.length > 0) {
      return { resumed: false, reason: 'subsection-count-mismatch' }
    }
    const summaryBySub = new Map((state.writtenMeta || []).map((m) => [m.subsectionId, m.summary]))

    // Rebuild the section grouping exactly as confirmPlan created it, reusing the
    // existing section rows (found via each scene's subsectionId → parent section)
    const sections = []
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
        subsectionIds: group.map((g) => g.subsectionId),
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
      storyBibleDocs
    }

    await delegatorApi.dispatch('SPINE_GENERATED')
    try {
      await writeNextBatch(resumeIndex)
      return { resumed: true, from: resumeIndex, total: plan.length }
    } catch (err) {
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
  }) {
    if (phase.value !== 'idle') return

    abort.ensure()
    isCancelling.value = false

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

    error.value = null
    consistencyReport.value = null
    writtenScenes.value = []
    scenePlan.value = []
    rejectedPatterns.value = []

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

    let activeStage = null
    try {
      progress.total = 4
      // Phase 0: Create volume first (so bootstrapping has a real volume ID)
      progress.current = 1
      progress.statusText = 'Creating volume...'
      const vId = await volumeStore.createVolume(projectId, {
        title: `${enhancedSynopsis.slice(0, 60)}...`,
        description: `Generated story — ${genre}, ${tone}`,
        color: '#6366f1',
        sectionIds: []
      })
      volumeId.value = vId

      await delegatorApi.dispatch('BOOTSTRAP_START', { projectId, volumeId: vId })

      // Load story bible context and existing manuscript as evidence for the Director
      progress.statusText = 'Loading story context for planning...'
      const storyDocs = useStoryDocuments()
      const bibleContext = await storyDocs.getStoryDocumentContext(projectId)

      const sceneSummaries = []
      for (const section of manuscriptStore.sortedSections) {
        const sectionSubs = manuscriptStore.subsections
          .filter((s) => s.sectionId === section.id)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
        for (const sub of sectionSubs) {
          if (sub.content || sub.description) {
            const excerpt = sub.content
              ? sub.content.slice(0, 300).replace(/\s+\S*$/, '') + '...'
              : ''
            sceneSummaries.push(`"${sub.title}": ${sub.description || excerpt || '(written)'}`)
          }
        }
      }

      const evidenceParts = []
      if (bibleContext) evidenceParts.push(bibleContext)
      if (sceneSummaries.length > 0) {
        evidenceParts.push('# Existing Manuscript Scenes\n' + sceneSummaries.slice(-20).join('\n'))
      }
      // Phase 1 (Stage A — Story Bible): Bootstrap entities
      progress.current = 2
      progress.statusText = 'Conjuring Characters & World...'
      activeStage = 'bible'
      await updateGenRunStage(projectId, 'bible', { status: 'running' })
      await bootstrapper.bootstrapEntities({
        synopsis: enhancedSynopsis,
        projectId,
        volumeId: vId,
        onPartialData
      })
      await updateGenRunStage(projectId, 'bible', { status: 'done' })
      activeStage = null
      actLog.updatePhase(currentTaskId, bpPhase, { status: 'done' })
      bpPhase = -1

      // Phase 1.5 (Stage B — Story Network): with the Bible entities committed
      // (stable IDs), generate the deliberate relationships between them BEFORE
      // planning, so scenes and views can build on a populated network. Best-effort.
      progress.statusText = 'Weaving the Story Network (relationships)...'
      const networkPhase = actLog.addPhase(currentTaskId, 'Story Network')
      await updateGenRunStage(projectId, 'network', { status: 'running' })
      actLog.appendThought(
        currentTaskId,
        networkPhase,
        `Analyzing relationships across ${storyBibleStore.characters.length} characters, ` +
          `${storyBibleStore.locations.length} locations, ${storyBibleStore.plotThreads.length} plot threads...\n`
      )
      try {
        const netResult = await generateRelationships({
          projectId,
          characters: storyBibleStore.characters,
          locations: storyBibleStore.locations,
          plotThreads: storyBibleStore.plotThreads,
          synopsis: enhancedSynopsis,
          genre,
          tone
        })
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
        if (rels === 0 && edges === 0 && REASON_MESSAGES[netResult.reason]) {
          actLog.appendThought(
            currentTaskId,
            networkPhase,
            REASON_MESSAGES[netResult.reason] + '\n'
          )
        }
        actLog.updatePhase(currentTaskId, networkPhase, { status: 'done', detail })
        await updateGenRunStage(projectId, 'network', { status: 'done' })
      } catch (err) {
        console.warn('[useVolumeStoryGenerator] Story Network generation failed:', err)
        actLog.updatePhase(currentTaskId, networkPhase, { status: 'failed' })
        await updateGenRunStage(projectId, 'network', { status: 'failed', error: err.message })
      }

      // Reload story context so the newly generated entities are included in evidence
      const updatedBibleContext = await storyDocs.getStoryDocumentContext(projectId)
      const updatedEvidenceParts = []
      if (updatedBibleContext) updatedEvidenceParts.push(updatedBibleContext)
      if (sceneSummaries.length > 0) {
        updatedEvidenceParts.push(
          '# Existing Manuscript Scenes\n' + sceneSummaries.slice(-20).join('\n')
        )
      }
      const updatedEvidence = updatedEvidenceParts.join('\n\n')

      // Phase 2: Generate story plan using the updated context
      progress.current = 3
      progress.statusText = 'Forging the Story Graph (Planning scenes)...'
      await delegatorApi.dispatch('BOOTSTRAPPED')
      const planPhase = actLog.addPhase(currentTaskId, 'Planning')
      activeStage = 'structure'
      await updateGenRunStage(projectId, 'structure', { status: 'running' })
      actLog.appendThought(currentTaskId, planPhase, 'Outlining chapters and scenes...\n')

      const directorResult = await director.generateStoryPlan({
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
        onPartialData: (type, name) => {
          try {
            actLog.appendThought(currentTaskId, planPhase, `• ${name}\n`)
          } catch {
            // Best-effort progress callback; a throwing consumer must not break the run.
          }
          onPartialData?.(type, name)
        }
      })

      const scenes = directorResult.scenes
      const storyArc = directorResult.storyArc

      if (!Array.isArray(scenes) || scenes.length < 3) {
        throw new Error('Director returned insufficient scenes (need at least 3)')
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
            ...storyBibleStore.characters.map((c) => c.name)
          ])
        ].join(', ')}`,
        `Locations in story: ${[
          ...new Set([
            ...scenes.flatMap((s) => (s.location ? [s.location] : [])),
            ...storyBibleStore.locations.map((l) => l.name)
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
    } catch (err) {
      // A user-requested stop is an outcome, not a fault. Reporting it as
      // "Generation failed" would be the app lying about its own state.
      if (isAbortError(err)) {
        progress.statusText = 'Stopped'
        if (activeStage) {
          await updateGenRunStage(projectId, activeStage, { status: 'cancelled' })
        }
        throw err
      }
      await delegatorApi.dispatch('ERROR', {
        error: err,
        message: err.message || 'Generation failed during initial phases'
      })
      error.value = err.message || 'Generation failed during initial phases'
      if (activeStage) {
        await updateGenRunStage(projectId, activeStage, { status: 'failed', error: error.value })
      }
      throw err
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
  }) {
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

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      throwIfAborted()
      let fullProse = ''
      const result = await writer.writeSceneStructured({
        sceneBrief: scene,
        storyArc,
        chapterLog,
        storyBible,
        spineContext: spineContext.value,
        anchorRole,
        anchorConstraints,
        signal: abort.signal(),
        onChunk: (_chunk, proseChunk) => {
          fullProse += proseChunk || ''
          emitChunk?.(proseChunk, fullProse)
        },
        onRawChunk: (chunk) => actLog.appendThought(currentTaskId, scenePhase, chunk),
        embeddingContext,
        storyContract,
        rejectedPatterns: extraRejected,
        existingEntitiesJson: sceneEntitiesJson,
        pastEvalResults: attemptFeedback || undefined,
        focusInstructions: attemptFocusInstructions || undefined
      })
      const proseText = result.prose

      if (!retryGate) {
        chosenProse = proseText
        chosenStructured = result.structured
        break
      }

      const criticResult = await critic.evaluateScene({
        draft: proseText,
        sceneBrief: scene,
        storyBible,
        chapterLog: ''
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

      // A critic that cannot parse its own output makes the run look healthier
      // and cheaper than it is: the gate exits, the draft is accepted, and
      // nothing in the UI says the quality gate never ran. Retrying the writer
      // would not help — it is the critic that failed — so we still break, but
      // loudly, where the user is actually looking.
      if (criticResult?.evalUnavailable) {
        evalUnavailableCount.value += 1
        actLog.appendThought(
          currentTaskId,
          scenePhase,
          "\n⚠ Quality gate did not run for this scene — the critic's output could not be parsed. The draft was accepted unchecked.\n"
        )
      }

      const continuityOk = (criticResult.dimensionScores?.continuity ?? 10) >= 6
      if (!criticResult || criticResult.evalUnavailable || (criticResult.pass && continuityOk)) {
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
      const retryResult = autoAdjustPrompt([evalSnapshot], { pastGivenHints: allGivenHints.value })
      attemptFocusInstructions = retryResult.focusInstructions
      allGivenHints.value = [...allGivenHints.value, ...retryResult.givenHints]
    }

    return { chosenProse, chosenStructured, chosenEval }
  }

  async function runParallelGeneration(writeParamsVal) {
    if (!writeParamsVal) return
    const { storyArc, storyBibleDocs, storyContract, projectId, onChunk } = writeParamsVal

    const existingEntitiesJson = buildExistingEntitiesBlob(
      storyBibleStore.characters,
      storyBibleStore.locations,
      storyBibleStore.plotThreads
    )

    writtenScenes.value = new Array(scenePlan.value.length).fill(null)
    const chaptersWithScenes = []
    let offset = 0
    for (const c of chapterPlan.value) {
      const group = scenePlan.value.slice(offset, offset + c.scenes.length)
      chaptersWithScenes.push({ chapterMeta: c, scenes: group, startIndex: offset })
      offset += c.scenes.length
    }

    progress.statusText = 'Phase 1: Generating chapter anchors in parallel...'

    async function generateAnchor(scene, role, constraints, sceneIndex, chapterIndex) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      try {
        const { chosenProse, chosenStructured, chosenEval } = await writeSceneWithGate({
          scene,
          sceneIndex,
          scenePhase,
          storyArc,
          chapterLog: '',
          storyBible: storyBibleDocs,
          storyContract,
          existingEntitiesJson,
          anchorRole: role,
          anchorConstraints: constraints,
          emitChunk: (proseChunk, fullProse) => {
            onChunk?.({
              sceneIndex: sceneIndex + 1,
              total: scenePlan.value.length,
              chunk: proseChunk,
              fullProse,
              scene
            })
          }
        })
        const fullProse = chosenProse

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        // The writer already returned a summary in its structured output; this
        // only falls back to a separate LLM call if it didn't.
        const summary = await computeSummary(fullProse, chosenStructured)
        const wordCount = fullProse.split(/\s+/).length

        if (scene.subsectionId) {
          await manuscriptStore.updateSubsectionData(
            scene.subsectionId,
            { content: fullProse, wordCount, contentStatus: 'generated' },
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
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: chosenStructured, eval: chosenEval }
      } catch (err) {
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
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
          chapterLog: ''
        })
        anchorResults.push({
          sceneIndex: idx + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          topIssues: (criticResult.issues || []).slice(0, 3).map((i) => i.text || i),
          dimensionScores: criticResult.dimensionScores || null
        })
      }
      sceneEvalResults.value = anchorResults
      anchorEvalFeedback = formatEvalFeedback(anchorResults)
      const anchorResult = autoAdjustPrompt(anchorResults, { pastGivenHints: allGivenHints.value })
      anchorFocusInstructions = anchorResult.focusInstructions
      allGivenHints.value = [...allGivenHints.value, ...anchorResult.givenHints]
    }

    // Phase 2: Generate middle scenes per chapter
    progress.statusText = 'Phase 2: Generating chapter middle scenes...'

    async function generateMiddleScene(scene, sceneIndex, chapterMeta) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      try {
        // Chapter-scoped log: only scenes from this chapter (Fix #2 — never cross-chapter)
        const logEntries = writtenScenes.value
          .filter((s) => s && s.chapterId === chapterMeta.chapterNumber && s.summary)
          .map((s) => `Scene ${s.sceneNumber} ("${s.title}"): ${s.summary}`)
        const chapterLog = logEntries.join('\n')

        const { chosenProse, chosenStructured, chosenEval } = await writeSceneWithGate({
          scene,
          sceneIndex,
          scenePhase,
          storyArc,
          chapterLog,
          storyBible: storyBibleDocs,
          storyContract,
          existingEntitiesJson,
          pastEvalResults: anchorEvalFeedback || undefined,
          focusInstructions: anchorFocusInstructions || undefined,
          emitChunk: (proseChunk, fullProse) => {
            onChunk?.({
              sceneIndex: sceneIndex + 1,
              total: scenePlan.value.length,
              chunk: proseChunk,
              fullProse,
              scene
            })
          }
        })
        const fullProse = chosenProse

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        // The writer already returned a summary in its structured output; this
        // only falls back to a separate LLM call if it didn't.
        const summary = await computeSummary(fullProse, chosenStructured)
        const wordCount = fullProse.split(/\s+/).length

        if (scene.subsectionId) {
          await manuscriptStore.updateSubsectionData(
            scene.subsectionId,
            { content: fullProse, wordCount, contentStatus: 'generated' },
            projectId
          )
        }

        writtenScenes.value[sceneIndex] = {
          title: scene.title || `Scene ${scene.sceneNumber}`,
          prose: fullProse,
          summary,
          characters: scene.characters || scene.charactersPresent || [],
          location: scene.location || '',
          sceneNumber: scene.sceneNumber,
          subsectionId: scene.subsectionId,
          chapterId: chapterMeta.chapterNumber,
          keyFacts: Array.isArray(chosenStructured?.keyFacts) ? chosenStructured.keyFacts : []
        }

        actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: chosenStructured, eval: chosenEval }
      } catch (err) {
        actLog.updatePhase(currentTaskId, scenePhase, { status: 'failed' })
        return { success: false, sceneIndex, error: err.message }
      }
    }

    const middleTasks = []
    for (let chapterIndex = 0; chapterIndex < chaptersWithScenes.length; chapterIndex++) {
      const { chapterMeta, scenes, startIndex } = chaptersWithScenes[chapterIndex]
      for (let j = 0; j < scenes.length; j++) {
        const sceneIndex = startIndex + j
        // Skip already-written scenes (anchors completed successfully)
        if (writtenScenes.value[sceneIndex] !== null) continue
        const scene = scenes[j]
        middleTasks.push(() => generateMiddleScene(scene, sceneIndex, chapterMeta))
      }
    }

    let middleOutcomes = []
    if (middleTasks.length > 0) {
      throwIfAborted()
      middleOutcomes = await parallelWithLimit(middleTasks, limit)
      throwIfAborted()
    }

    if (inlineEvalEnabled.value) {
      progress.statusText = 'Evaluating middle scenes...'
      const middleResults = []
      for (let idx = 0; idx < writtenScenes.value.length; idx++) {
        const s = writtenScenes.value[idx]
        if (!s || sceneEvalResults.value.some((r) => r.sceneIndex === idx + 1)) continue
        const sceneBrief = scenePlan.value.find((sp) => sp.sceneNumber === s.sceneNumber) || {}
        const criticResult = await critic.evaluateScene({
          draft: s.prose,
          sceneBrief,
          storyBible: storyBibleDocs,
          chapterLog: ''
        })
        middleResults.push({
          sceneIndex: idx + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          dimensionScores: criticResult.dimensionScores || null,
          topIssues: (criticResult.issues || []).slice(0, 3).map((i) => i.text || i)
        })
      }
      sceneEvalResults.value = [...sceneEvalResults.value, ...middleResults]
    }

    // Parallel-safe quality floor. The sequential path aborts on N *consecutive*
    // gate failures, which is undefined under parallel execution — so here we
    // use an aggregate fail-ratio over judged scenes. Only meaningful when the
    // gate actually ran (autoMode); otherwise no per-scene evals were produced.
    if (autoMode.value) {
      const QUALITY_FLOOR_FAIL_RATIO = 0.5
      const QUALITY_FLOOR_MIN_JUDGED = 4
      const anchorEvals = anchorOutcomes.flatMap((o) => (o?.results || []).map((r) => r?.eval))
      const gateEvals = [...anchorEvals, ...middleOutcomes.map((r) => r?.eval)].filter(Boolean)
      const judged = gateEvals.filter((e) => !e.evalUnavailable && e.score != null)
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

    await completeGeneration(projectId)
  }

  async function writeNextBatch(startIndex) {
    if (!writeParams.value) return

    const { projectId, storyArc, storyContract, onChunk, storyBibleDocs, sections } =
      writeParams.value
    const endIndex = Math.min(startIndex + SYNC_BATCH_SIZE, scenePlan.value.length)

    // Build running chapter log once from existing scenes (Fix #2 — avoids O(n²) rebuild per scene)
    const runningChapterLog = writtenScenes.value
      .filter(Boolean)
      .map((ws) => `Scene ${ws.sceneNumber} ("${ws.title}"): ${ws.summary || '(written)'}`)

    // Build entities JSON once per batch (Fix #3 — entities don't change within a batch)
    const existingEntitiesJson = buildExistingEntitiesBlob(
      storyBibleStore.characters,
      storyBibleStore.locations,
      storyBibleStore.plotThreads
    )

    let batchEvalFeedback = ''
    let batchFocusInstructions = ''

    for (let i = startIndex; i < endIndex; i++) {
      throwIfAborted()
      const scene = scenePlan.value[i]
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(currentTaskId, phaseName)
      progress.current = i + 1
      progress.sceneLabel = scene.title || `Scene ${scene.sceneNumber}`
      progress.statusText = `Drafting scene details, building continuity context, and streaming prose...`

      // Retrieve continuity context — prose excerpts for short drafts, semantic
      // retrieval once the story grows past the prose-excerpt ceiling.
      const embeddingContext = await buildRetrievalContext(scene, writtenScenes.value)

      // Build chapter log from running array (O(1) slice instead of O(n) rebuild)
      const chapterLog = runningChapterLog.slice(-20).join('\n')

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
      const retryGate = autoMode.value
      const maxAttempts = retryGate ? SCENE_MAX_ATTEMPTS : 1
      const { chosenProse, chosenStructured, chosenEval } = await writeSceneWithGate({
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
        emitChunk: (proseChunk, fullProse) => {
          onChunk?.({
            sceneIndex: i + 1,
            total: scenePlan.value.length,
            chunk: proseChunk,
            fullProse,
            scene
          })
        }
      })
      actLog.updatePhase(currentTaskId, scenePhase, { status: 'done' })

      const fullProse = chosenProse
      structuredResults.push({ sceneIndex: i, structured: chosenStructured })

      if (sceneReviewMode.value && i < scenePlan.value.length - 1) {
        currentSceneResult.value = {
          scene,
          fullProse,
          structured: chosenStructured,
          sectionIdx: sectionIndexForScene(sections, i)
        }
        currentWriteIndex.value = i + 1
        await delegatorApi.dispatch('SCENE_WRITTEN', {
          sceneResult: currentSceneResult.value,
          sceneIndex: i
        })
        return
      }

      await commitService.commitAndStoreScene(
        scene,
        fullProse,
        sectionIndexForScene(sections, i),
        sections,
        projectId,
        chosenStructured
      )
      commitService.persistCheckpoint(projectId)

      if (retryGate && chosenEval) {
        sceneEvalResults.value.push({
          sceneIndex: i + 1,
          passed: chosenEval.pass,
          score: chosenEval.score,
          dimensionScores: chosenEval.dimensionScores || null,
          topIssues: (chosenEval.issues || []).slice(0, 3).map((iss) => iss.text || iss)
        })
        batchEvalFeedback = formatEvalFeedback(sceneEvalResults.value)
        const batchResult = autoAdjustPrompt(sceneEvalResults.value, { pastGivenHints: allGivenHints.value })
        batchFocusInstructions = batchResult.focusInstructions
        allGivenHints.value = [...allGivenHints.value, ...batchResult.givenHints]

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
            error.value = `Quality floor breached: ${runConsecutiveFailures.value} scenes in a row failed critique after retries. The writer or critic model is likely misconfigured. ${writtenScenes.value.length} scene(s) written and saved.`
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
          draft: fullProse,
          sceneBrief: scene,
          storyBible: storyBibleDocs,
          chapterLog: ''
        })
        const evalEntry = {
          sceneIndex: i + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          dimensionScores: criticResult.dimensionScores || null,
          topIssues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss)
        }
        sceneEvalResults.value.push(evalEntry)
        batchEvalFeedback = formatEvalFeedback(sceneEvalResults.value)
        const batchResult2 = autoAdjustPrompt(sceneEvalResults.value, { pastGivenHints: allGivenHints.value })
        batchFocusInstructions = batchResult2.focusInstructions
        allGivenHints.value = [...allGivenHints.value, ...batchResult2.givenHints]
      }

      // Append to running log after scene completes (avoids full rebuild next iteration)
      const latestScene = writtenScenes.value.at(-1)
      runningChapterLog.push(
        `Scene ${scene.sceneNumber} ("${scene.title || `Scene ${scene.sceneNumber}`}"): ${latestScene?.summary || '(written)'}`
      )
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
      }
    }

    if (endIndex < scenePlan.value.length) {
      if (batchChanges.length > 0) {
        hasPendingBatches.value = true
        pendingBatchStart.value = endIndex
        syncPreview.value = batchChanges
        await delegatorApi.dispatch('BATCH_COMPLETE', {
          batchStart: pendingBatchStart.value,
          batchEnd: writtenScenes.value.length
        })
        // One-click mode: accept every discovered entity and keep writing
        if (autoMode.value) {
          await confirmSync({ acceptedEntities: batchChanges, projectId, volumeId: volumeId.value })
        }
        return
      }
      // Note: recursive — max depth = ceil(totalScenes / SYNC_BATCH_SIZE). Not a stack risk for typical volumes (<100 scenes) but consider a while-loop refactor if volumes scale significantly.
      await writeNextBatch(endIndex)
      return
    }

    if (batchChanges.length > 0) {
      syncPreview.value = batchChanges
      await delegatorApi.dispatch('BATCH_COMPLETE', {
        batchStart: pendingBatchStart.value,
        batchEnd: writtenScenes.value.length
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
  }) {
    if (phase.value !== 'plan-preview') return

    scenePlan.value = editedPlan
    progress.total = editedPlan.length
    progress.statusText =
      'Building manuscript structure, initializing sections, and assigning chapters...'

    // Create sections using Director-provided chapter boundaries
    const sections = []

    // Multi-volume: ensure a volume record exists for each requested volume,
    // so chapters land in the right volume. Volume 1 reuses the primary record.
    const volumeIdByIndex = { 1: volumeId.value }
    const maxVolumeIndex = Math.max(1, ...(chapterPlan.value || []).map((c) => c.volumeIndex || 1))
    for (let v = 2; v <= maxVolumeIndex; v++) {
      const vid = await volumeStore.createVolume(projectId, {
        title: `Volume ${v}`,
        description: `Volume ${v}`,
        color: '#6366f1',
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

    // Batch-create all sections + subsections + volume assignments atomically
    const batchResults = await batchCreatePlanStructure({ projectId, groups })

    // Update Pinia reactive state
    for (const sec of batchResults) {
      manuscriptStore.sections.push({
        id: sec.id,
        projectId,
        order: manuscriptStore.sections.length,
        status: 'planning',
        title: sec.title,
        summary: sec.summary,
        wordCount: 0
      })
      for (let j = 0; j < sec.subsectionIds.length; j++) {
        const scene = sec.scenes[j]
        manuscriptStore.subsections.push({
          id: sec.subsectionIds[j],
          projectId,
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
      ...batchResults.map((sec) => ({
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
    await updateGenRunStage(projectId, 'spine', { status: 'running' })

    try {
      spineArray.value = await generateSpine(chapterPlan.value, storyArc, (done, total) => {
        progress.statusText = `Generating narrative spine (${done}/${total} chapters)...`
        actLog.updatePhase(currentTaskId, spinePhase, {
          detail: `${done}/${total} chapter spine entries`
        })
      })
      spineContext.value = compressSpine(spineArray.value)
      actLog.updatePhase(currentTaskId, spinePhase, { status: 'done' })
      await updateGenRunStage(projectId, 'spine', { status: 'done' })
    } catch (err) {
      error.value = err.message || 'Fatal: Spine generation failed'
      await delegatorApi.dispatch('ERROR', {
        error: err,
        message: err.message || 'Fatal: Spine generation failed'
      })
      await updateGenRunStage(projectId, 'spine', { status: 'failed', error: err.message })
      throw err
    }

    // Phase 3: Incremental writing
    await delegatorApi.dispatch('SPINE_GENERATED')
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
      storyBibleDocs
    }

    await runParallelGeneration(writeParams.value)
  }

  // End-of-run repair: regenerate any scene whose subsection was left empty (a
  // failed prose attempt in the parallel path). Isolated, best-effort, one extra
  // attempt each — a single bad scene never leaves a hole in the finished draft.
  async function repairFailedScenes(projectId) {
    const scenesBySub = new Map()
    scenePlan.value.forEach((s, i) => {
      if (s.subsectionId) scenesBySub.set(s.subsectionId, { scene: s, index: i })
    })
    if (scenesBySub.size === 0) return

    const failed = (await getFailedSubsections(projectId)).filter((sub) => scenesBySub.has(sub.id))
    if (failed.length === 0) return

    progress.statusText = `Repairing ${failed.length} unwritten scene(s)...`
    const repairPhase = actLog.addPhase(currentTaskId, `Repairing ${failed.length} scene(s)`)

    const storyDocuments = useStoryDocuments()
    const storyBibleDocs =
      writeParams.value?.storyBibleDocs || (await storyDocuments.getStoryDocumentContext(projectId))
    const storyArc = writeParams.value?.storyArc || null
    const storyContract = writeParams.value?.storyContract || ''
    const existingEntitiesJson = buildExistingEntitiesBlob(
      storyBibleStore.characters,
      storyBibleStore.locations,
      storyBibleStore.plotThreads
    )

    for (const sub of failed) {
      const { scene, index } = scenesBySub.get(sub.id)
      try {
        const priorScenes = writtenScenes.value
          .filter(Boolean)
          .filter((s) => s.subsectionId !== sub.id)
        const embeddingContext = await buildRetrievalContext(scene, priorScenes)
        const result = await writer.writeSceneStructured({
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
              content: fullProse,
              wordCount: fullProse.split(/\s+/).length,
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
          if (index < writtenScenes.value.length) writtenScenes.value[index] = rebuilt
          else writtenScenes.value.push(rebuilt)
        } else {
          await manuscriptStore.updateSubsectionData(sub.id, { contentStatus: 'failed' }, projectId)
        }
      } catch (err) {
        console.warn('[useVolumeStoryGenerator] repair failed for subsection', sub.id, err)
        await manuscriptStore
          .updateSubsectionData(sub.id, { contentStatus: 'failed' }, projectId)
          .catch(() => {})
      }
    }
    actLog.updatePhase(currentTaskId, repairPhase, { status: 'done' })
  }

  async function completeGeneration(projectId) {
    // Repair any holes left by failed scene generations before the final audit.
    try {
      await repairFailedScenes(projectId)
    } catch (err) {
      console.warn('[useVolumeStoryGenerator] repair pass failed:', err)
    }

    await updateGenRunStage(projectId, 'prose', {
      status: 'done',
      written: writtenScenes.value.length,
      total: writtenScenes.value.length
    })

    await consistencyService.runTerminalConsistencyAudit(projectId, currentTaskId)

    actLog.completeTask(currentTaskId)

    // Run finished cleanly — drop the crash-recovery checkpoint
    await clearGenRun(projectId)

    await delegatorApi.dispatch('WRITING_DONE')
    progress.statusText = 'Volume generation complete!'

    // Compute total words once (Fix #10 — was computed twice in quick succession)
    const totalWords = writtenScenes.value.reduce((sum, s) => sum + s.prose.split(/\s+/).length, 0)

    try {
      const { db } = await import('../services/db-core')
      await db.generatedStories.add({
        projectId,
        title: `Volume Story — ${new Date().toLocaleDateString()}`,
        generatedAt: new Date().toISOString(),
        totalWords,
        qualityScore: consistencyReport.value
          ? (consistencyReport.value.characterIssues.length +
              consistencyReport.value.locationIssues.length) *
            -1
          : 0
      })
    } catch {
      // Non-critical: generatedStories save
    }
  }

  async function confirmSync(opts) {
    await sceneInteractionService.confirmSync(opts)
  }

  async function regenerateScene(projectId, sceneIndex) {
    await sceneInteractionService.regenerateScene(projectId, sceneIndex)
  }

  async function approveScene() {
    await sceneInteractionService.approveScene()
  }

  async function rejectScene() {
    await sceneInteractionService.rejectScene()
  }

  async function rerequestScene(edits) {
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

  async function reset() {
    // Abort before clearing. Previously reset() cleared the refs while in-flight
    // fetches kept running and their writers kept writing into the store behind
    // it — the state came back, seconds after being wiped.
    stop()
    abort.reset()
    isCancelling.value = false

    await delegatorApi.dispatch('RESET')
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
    confirmPlan,
    confirmSync,
    syncPreview,
    hasPendingBatches,
    pendingBatchStart,
    logRejectedPattern,
    getResumableRun,
    resumeGeneration,
    runFailedScenes,
    sceneReviewMode,
    autoMode,
    inlineEvalEnabled,
    currentSceneResult,
    currentWriteIndex,
    approveScene,
    rejectScene,
    rerequestScene,
    regenerateScene,
    reset,
    delegator: delegatorApi.delegator,
    memory: delegatorApi.memory,
    dispatch: delegatorApi.dispatch
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
  fallbackSpineEntry
}
