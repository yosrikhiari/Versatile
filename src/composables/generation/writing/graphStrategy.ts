/**
 * The LangGraph writing strategy: Director / Writer / Critic / Editor as a
 * multi-agent graph.
 *
 * What changes versus `parallelStrategy.ts`:
 *
 *   - The Writer and the Critic are separate graph nodes on separate device
 *     lanes (config/roles.ts), so the Critic judges scene N on the CPU while
 *     the Writer drafts scene N+1 on the GPU. The legacy strategy did
 *     write → critique → maybe rewrite serially per scene, which is why both
 *     roles had to share one model.
 *   - An Editor decides each superstep what each lane does next
 *     (`useStoryEditor`). In `workflow` mode that is a pure function — the
 *     legacy order. In `agentic` mode a model chooses among the legal moves
 *     and may revise a scene with a specific instruction, accept a near-miss
 *     for review instead of spending a rewrite, or stop early. Every decision
 *     is logged (`agentDecisions`) with what it saw and whether it was legal.
 *   - The graph checkpoints into Dexie after every superstep (`DexieSaver`),
 *     so a killed tab resumes mid-chapter instead of at the stage boundary.
 *
 * What does NOT change: every gate rule. Drafting, judging and the review
 * marking call the same `sceneGate` primitives the legacy path uses, so
 * "what passes" is defined in exactly one place. Committing a scene does the
 * same writes as `parallelStrategy` (manuscript, writtenScenes, digest,
 * checkpoint, per-chapter bible sync) — see `commitScene` below.
 *
 * The graph, one superstep:
 *
 *      ┌──────────┐   Send(draft #i)      ┌────────┐
 *      │  decide  │──────────────────────►│ draft  │ (gpu lane)   ─┐
 *      │ (Editor) │   Send(critique #j)   ├────────┤               │ all back to
 *      │          │──────────────────────►│critique│ (cpu lane)   ─┼─► decide
 *      │          │   Send(commit #k)     ├────────┤               │
 *      │          │──────────────────────►│ commit │ (no lane)    ─┘
 *      └──────────┘   stop ─► END
 *
 * Nodes in one superstep run concurrently; the next `decide` sees all their
 * results merged into the state.
 */
import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph/web'
import { langfuseService } from '../../../services/langfuseService'
import { buildRagOptions, type ResearchScope } from '../../../services/researchScope'
import { db } from '../../../services/db-core'
import { logAgentDecision, updateGenRunStage } from '../../../services/db-generation'
import { placementProblems, resolveRolePlacement } from '../../../config/roles'
import { buildRetrievalContext } from '../context/sceneContext'
import { computeSummary } from '../utils'
import { proseToHtml, countProseWords } from './liveDraft'
import { assertProse, attemptScore, isCleanPass } from '../runMechanics'
import { rethrowIfFatal } from '../lifecycle'
import { PARALLEL_SCENE_LIMIT, SCENE_MAX_ATTEMPTS, WRITE_FAILURE_STREAK_ABORT } from './limits'
import { syncChapterToBible } from './bibleSync'
import { DexieSaver } from '../graph/dexieSaver'
import {
  useStoryEditor,
  type EditorAction,
  type EditorDecision,
  type EditorSceneSummary,
  type EditorState
} from '../../useStoryEditor'
import type { CriticVerdict, DraftedScene, SceneBrief, StoryArc } from '../types'
import type { ParallelStrategyContext } from './parallelStrategy'

export type OrchestratorMode = 'workflow' | 'agentic'

/** The gate primitives this strategy needs from `createSceneGate`. */
export interface GraphSceneGate {
  makeSceneStream: (args: { scene: SceneBrief; sceneIndex: number; onChunk: unknown }) => {
    emitChunk: (proseChunk: string, fullProse: string) => void
    done: (finalProse?: string) => void
    abandon: () => void
  }
  chapterLogBefore: (
    sceneIndex: number,
    pending?: { scene: SceneBrief; structured?: DraftedScene['structured'] } | null,
    limit?: number
  ) => string
  draftAttempt: (args: {
    scene: SceneBrief
    sceneIndex: number
    scenePhase: number | string | undefined
    storyArc: StoryArc | null | undefined
    chapterLog: string
    storyBible: string | undefined
    storyContract: string | undefined
    sceneEntitiesJson: string
    embeddingContext: string
    extraRejected: string[] | undefined
    anchorRole: string | undefined
    anchorConstraints: string | undefined
    emitChunk: ((proseChunk: string, fullProse: string) => void) | undefined
    attemptFeedback: string | null | undefined
    attemptFocusInstructions: string | undefined
    attempt: number
    maxAttempts: number
  }) => Promise<({ ok: true } & DraftedScene) | { ok: false; rejected: true; error: unknown }>
  critiqueAttempt: (args: {
    proseText: string
    structured: DraftedScene['structured']
    scene: SceneBrief
    sceneIndex: number
    scenePhase: number | string | undefined
    storyBible: string | undefined
    chapterLog: string
    sceneEntitiesJson: string
    attemptFocusInstructions: string | undefined
    baselineWordCount: number
  }) => Promise<{
    criticResult: CriticVerdict
    accept: boolean
    feedback: string | undefined
    focusInstructions: string | undefined
  }>
  markGateOutcome: (args: {
    chosenProse: string
    chosenStructured: DraftedScene['structured']
    chosenEval: CriticVerdict | null
    maxAttempts: number
    sceneIndex: number
    retryGate: boolean
  }) => string | null
  sceneEntitiesFor: (scene: SceneBrief, existingEntitiesJson: string | undefined) => string
}

/** One scene's journey through the graph. Lives in the checkpointed state. */
export interface SceneRecord {
  index: number
  chapterIndex: number
  title: string
  status: EditorSceneSummary['status']
  attempts: number
  /** The latest draft, awaiting or holding a verdict. */
  draft: DraftedScene | null
  verdict: CriticVerdict | null
  /** Whether the latest verdict cleared the gate. */
  accepted: boolean
  /** The best attempt so far, by `attemptScore` — what gets committed. */
  best: { draft: DraftedScene; verdict: CriticVerdict | null } | null
  baselineWordCount: number
  /** Critic feedback and focus for the next attempt. */
  feedback: string | null
  focusInstructions: string | null
  /** The Editor's own instruction for a revise (agentic mode). */
  instructions: string | null
  gateFailure: string | null
  error: string | null
}

type LaneTask =
  | { kind: 'draft'; index: number; instructions: string | null }
  | { kind: 'critique'; index: number }
  | { kind: 'commit'; index: number }

const WritingState = Annotation.Root({
  scenes: Annotation<SceneRecord[], SceneRecord[]>({
    reducer: (prev, updates) => {
      const byIndex = new Map(prev.map((s) => [s.index, s]))
      for (const u of updates) byIndex.set(u.index, { ...(byIndex.get(u.index) ?? u), ...u })
      return [...byIndex.values()].sort((a, b) => a.index - b.index)
    },
    default: () => []
  }),
  decisions: Annotation<EditorDecision[], EditorDecision[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => []
  }),
  tasks: Annotation<LaneTask[], LaneTask[]>({
    reducer: (_prev, next) => next,
    default: () => []
  }),
  step: Annotation<number, number>({
    reducer: (_prev, next) => next,
    default: () => 0
  }),
  finished: Annotation<boolean, boolean>({
    reducer: (_prev, next) => next,
    default: () => false
  })
})

type WritingStateType = typeof WritingState.State

export interface GraphStrategyOptions {
  mode: OrchestratorMode
  /** How many drafts may wait for a verdict before the Writer pauses. */
  lookahead?: number
  maxAttempts?: number
  /** Resume a previous run's thread instead of starting a new one. */
  threadId?: string
}

interface WriteParams {
  projectId: string
  storyArc: StoryArc | null | undefined
  storyBibleDocs: string | undefined
  storyContract: string | undefined
  onChunk: unknown
  sections?: Array<{ id: unknown; subsectionIds?: unknown[] }>
  research?: ResearchScope | null
}

function summarize(scenes: SceneRecord[]): EditorSceneSummary[] {
  return scenes.map((s) => ({
    index: s.index,
    title: s.title,
    status: s.status,
    attempts: s.attempts,
    score: s.verdict?.score ?? null,
    pass: s.verdict ? !!s.verdict.pass : null,
    continuity: s.verdict?.dimensionScores?.continuity ?? null,
    topIssues: (s.verdict?.issues || [])
      .slice(0, 3)
      .map((i) => i.text || i.description || '')
      .filter(Boolean),
    gateFailure: s.gateFailure
  }))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createGraphStrategy(ctx: ParallelStrategyContext, sceneGate: GraphSceneGate) {
  const {
    actLog,
    autoMode,
    chapterPlan,
    commitService,
    completeGeneration,
    evalStore,
    gate,
    generationSpanIds,
    generationTraceId,
    haltRun,
    inlineEvalEnabled,
    manuscriptStore,
    persistCritiqueEval,
    progress,
    recordSceneDigest,
    runFailedScenes,
    runHealth,
    scenePlan,
    scopedEntitiesBlob,
    throwIfAborted,
    writtenScenes
  } = ctx
  const editor = useStoryEditor()

  async function runGraphGeneration(writeParamsVal: WriteParams, options: GraphStrategyOptions) {
    if (!writeParamsVal) return
    const mode: OrchestratorMode = options.mode
    const lookahead = options.lookahead ?? PARALLEL_SCENE_LIMIT
    const retryGate = autoMode.value
    const maxAttempts = retryGate ? (options.maxAttempts ?? SCENE_MAX_ATTEMPTS) : 1

    // The one hard placement rule. A run that would swap GPU models on every
    // scene is refused up front with the measured reason; warnings are logged.
    for (const problem of placementProblems()) {
      if (problem.level === 'error') throw new Error(problem.message)
      actLog.appendThought(ctx.currentTaskId, null, `\n⚠ ${problem.message}\n`)
    }
    const writerRt = resolveRolePlacement('writer')
    const criticRt = resolveRolePlacement('critic')
    const editorRt = resolveRolePlacement('editor')
    actLog.appendThought(
      ctx.currentTaskId,
      null,
      `Orchestrator: LangGraph (${mode}). Writer ${writerRt.model ?? 'default'} on ${writerRt.device}; ` +
        `Critic ${criticRt.model ?? 'default'} on ${criticRt.device}; ` +
        `Editor ${mode === 'agentic' ? `${editorRt.model ?? 'default'} on ${editorRt.device}` : 'workflow policy'}.\n`
    )

    const spanId = crypto.randomUUID()
    generationSpanIds.graph = spanId
    langfuseService.span(generationTraceId.value!, spanId, 'graph-writing', {
      projectId: writeParamsVal.projectId,
      mode
    })
    const { storyArc, storyBibleDocs, storyContract, projectId, onChunk } = writeParamsVal
    const runId = options.threadId ?? `${projectId}:${Date.now().toString(36)}`
    editor.sessionBudget = ctx.writer?.sessionBudget ?? null

    const ragOptions = buildRagOptions(projectId, writeParamsVal.research)
    const existingEntitiesJson: string = await scopedEntitiesBlob(projectId)
    const reviewEntities = !autoMode.value
    const pendingReview: unknown[] = []
    const structuredBySceneIndex = new Map<number, DraftedScene['structured']>()
    const sections = Array.isArray(writeParamsVal.sections) ? writeParamsVal.sections : []
    const chapterIdFor = (scenes: SceneBrief[], chapterIndex: number) => {
      const bySubsection = sections.find((sec) =>
        (sec?.subsectionIds || []).some((id) =>
          scenes.some((sc) => String(sc?.subsectionId) === String(id))
        )
      )
      return bySubsection?.id ?? sections[chapterIndex]?.id ?? null
    }

    writtenScenes.value = new Array(scenePlan.value.length).fill(null)
    progress.total = scenePlan.value.length
    progress.current = 0

    // Chapter grouping, as the parallel strategy does it.
    const chaptersWithScenes: Array<{
      chapterMeta: { chapterNumber: number; scenes: unknown[] }
      scenes: SceneBrief[]
      startIndex: number
    }> = []
    let offset = 0
    for (const c of chapterPlan.value) {
      const group = scenePlan.value.slice(offset, offset + c.scenes.length)
      chaptersWithScenes.push({ chapterMeta: c, scenes: group, startIndex: offset })
      offset += c.scenes.length
    }
    const chapterIndexOf = (sceneIndex: number) =>
      chaptersWithScenes.findIndex(
        (ch) => sceneIndex >= ch.startIndex && sceneIndex < ch.startIndex + ch.scenes.length
      )
    const syncedChapters = new Set<number>()

    const noteSceneOutcome = (ok: boolean, sceneIndex?: number, detail?: string) => {
      if (ok) {
        runHealth.resetStreak('write_failed')
        return
      }
      runHealth.record('write_failed', { stage: 'writer', sceneIndex, detail })
      runFailedScenes.value = runHealth.failedScenes()
      const streak = runHealth.streak('write_failed')
      if (streak >= WRITE_FAILURE_STREAK_ABORT && writtenScenes.value.every((s) => !s)) {
        throw new Error(
          `Aborting: the first ${streak} scenes all failed to produce prose. ` +
            `Check the model and context settings for this project — nothing has been written, ` +
            `so no work is lost.`
        )
      }
    }

    // ── Nodes ────────────────────────────────────────────────────────────

    /** Writer: one attempt for one scene, on the GPU lane. */
    async function draftNode(task: Extract<LaneTask, { kind: 'draft' }>, state: WritingStateType) {
      const record = state.scenes.find((s) => s.index === task.index)
      if (!record) return {}
      const scene = scenePlan.value[record.index]
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"${record.attempts ? ` (attempt ${record.attempts + 1})` : ''}`
      const scenePhase = actLog.addPhase(ctx.currentTaskId, phaseName)
      const stream = sceneGate.makeSceneStream({ scene, sceneIndex: record.index, onChunk })
      await gate()
      try {
        throwIfAborted()
        const chapter = chaptersWithScenes[record.chapterIndex]
        const isOpening = record.index === chapter.startIndex
        const isClosing =
          chapter.scenes.length > 1 &&
          record.index === chapter.startIndex + chapter.scenes.length - 1
        const prevChapter =
          record.chapterIndex > 0 ? ctx.spineArray.value[record.chapterIndex - 1] : null
        const anchorRole = isOpening
          ? "Opening scene — this is the chapter's entry point."
          : isClosing
            ? 'Closing scene — this scene MUST end on this exact hook.'
            : undefined
        const anchorConstraints = isOpening
          ? `Previous chapter ended with: ${prevChapter?.emotionalStateAtEnd || 'story beginning'}\\nThis scene must begin where the previous chapter left off emotionally.`
          : isClosing
            ? `This scene MUST end on this exact hook:\\n"${chapter.chapterMeta && 'hookEnding' in chapter.chapterMeta ? String((chapter.chapterMeta as { hookEnding?: string }).hookEnding ?? '') : ''}"\\nDo not soften it. Do not add resolution. End there.`
            : undefined

        // The chapter log includes drafts that are written but not yet judged
        // (the lookahead), so scene N+1 knows what scene N said.
        const pendingDrafts = state.scenes.filter(
          (s) => s.index < record.index && s.status !== 'committed' && s.draft
        )
        const pending = pendingDrafts.length
          ? {
              scene: scenePlan.value[pendingDrafts[pendingDrafts.length - 1].index],
              structured: pendingDrafts[pendingDrafts.length - 1].draft?.structured
            }
          : null
        const chapterLog = sceneGate.chapterLogBefore(record.index, pending)
        const embeddingContext = await buildRetrievalContext(
          scene,
          writtenScenes.value.filter(Boolean),
          5,
          ragOptions
        )
        const focus = [record.focusInstructions, task.instructions ?? record.instructions]
          .filter(Boolean)
          .join('\n')
        const drafted = await sceneGate.draftAttempt({
          scene,
          sceneIndex: record.index,
          scenePhase,
          storyArc,
          chapterLog,
          storyBible: storyBibleDocs,
          storyContract,
          sceneEntitiesJson: sceneGate.sceneEntitiesFor(scene, existingEntitiesJson),
          embeddingContext,
          extraRejected: undefined,
          anchorRole,
          anchorConstraints,
          emitChunk: stream.emitChunk,
          attemptFeedback: record.feedback,
          attemptFocusInstructions: focus || undefined,
          attempt: record.attempts,
          maxAttempts
        })
        if (!drafted.ok) {
          stream.abandon()
          actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'failed' })
          // Rejected but attempts remain: back to the plan, the Editor will re-draft.
          return {
            scenes: [{ ...record, status: 'planned' as const, attempts: record.attempts + 1 }]
          }
        }
        assertProse(drafted.prose, scene)
        stream.done(drafted.prose)
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })
        const draft: DraftedScene = { prose: drafted.prose, structured: drafted.structured }
        return {
          scenes: [
            {
              ...record,
              status: retryGate ? ('drafted' as const) : ('critiqued' as const),
              attempts: record.attempts + 1,
              draft,
              verdict: null,
              accepted: !retryGate,
              baselineWordCount:
                record.attempts === 0 ? countProseWords(drafted.prose) : record.baselineWordCount,
              // Manual mode: no critic, so the only attempt is the best.
              best: retryGate ? record.best : { draft, verdict: null }
            }
          ]
        }
      } catch (err: unknown) {
        stream.abandon()
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'failed' })
        rethrowIfFatal(err)
        console.warn(`[graphStrategy] scene ${record.index + 1} failed:`, errorMessage(err))
        if (scene?.subsectionId) {
          await manuscriptStore
            .updateSubsectionData(scene.subsectionId, { contentStatus: 'failed' }, projectId)
            .catch(() => {})
        }
        noteSceneOutcome(false, record.index, errorMessage(err))
        return {
          scenes: [
            {
              ...record,
              status: 'failed' as const,
              error: errorMessage(err),
              attempts: record.attempts + 1
            }
          ]
        }
      }
    }

    /** Critic: judge the latest draft of one scene, on the CPU lane. */
    async function critiqueNode(
      task: Extract<LaneTask, { kind: 'critique' }>,
      state: WritingStateType
    ) {
      const record = state.scenes.find((s) => s.index === task.index)
      if (!record?.draft) return {}
      const scene = scenePlan.value[record.index]
      throwIfAborted()
      const scenePhase = actLog.addPhase(
        ctx.currentTaskId,
        `Judging: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      )
      try {
        const judged = await sceneGate.critiqueAttempt({
          proseText: record.draft.prose,
          structured: record.draft.structured,
          scene,
          sceneIndex: record.index,
          scenePhase,
          storyBible: storyBibleDocs,
          chapterLog: sceneGate.chapterLogBefore(record.index),
          sceneEntitiesJson: sceneGate.sceneEntitiesFor(scene, existingEntitiesJson),
          attemptFocusInstructions: record.focusInstructions ?? undefined,
          baselineWordCount: record.baselineWordCount
        })
        const verdict = judged.criticResult
        const isBetter = !record.best || attemptScore(verdict) > attemptScore(record.best.verdict)
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })
        return {
          scenes: [
            {
              ...record,
              status: 'critiqued' as const,
              verdict,
              accepted: judged.accept,
              best: isBetter ? { draft: record.draft, verdict } : record.best,
              feedback: judged.feedback ?? record.feedback,
              focusInstructions: judged.focusInstructions ?? record.focusInstructions
            }
          ]
        }
      } catch (err: unknown) {
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'failed' })
        rethrowIfFatal(err)
        // A critic that throws is an unavailable verdict: accept the draft,
        // loudly, exactly as the sequential gate does.
        runHealth.record('eval_unavailable', { stage: 'critic', sceneIndex: record.index })
        const verdict: CriticVerdict = { evalUnavailable: true }
        return {
          scenes: [
            {
              ...record,
              status: 'critiqued' as const,
              verdict,
              accepted: true,
              best: record.best ?? { draft: record.draft, verdict }
            }
          ]
        }
      }
    }

    /**
     * Commit: the same writes the parallel strategy makes for a finished scene
     * — manuscript subsection, `writtenScenes`, digest, progress, checkpoint —
     * plus the per-chapter bible sync when the chapter's last scene lands.
     */
    async function commitNode(
      task: Extract<LaneTask, { kind: 'commit' }>,
      state: WritingStateType
    ) {
      const record = state.scenes.find((s) => s.index === task.index)
      if (!record) return {}
      const scene = scenePlan.value[record.index]
      const chosen =
        record.best ?? (record.draft ? { draft: record.draft, verdict: record.verdict } : null)
      if (!chosen) {
        return { scenes: [{ ...record, status: 'failed' as const, error: 'nothing to commit' }] }
      }
      const gateFailure = sceneGate.markGateOutcome({
        chosenProse: chosen.draft.prose,
        chosenStructured: chosen.draft.structured,
        chosenEval: chosen.verdict,
        maxAttempts,
        sceneIndex: record.index,
        retryGate
      })
      const fullProse = chosen.draft.prose
      progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
      const summary = await computeSummary(fullProse, chosen.draft.structured)
      const wordCount = countProseWords(fullProse)
      if (scene.subsectionId) {
        await manuscriptStore.updateSubsectionData(
          scene.subsectionId,
          {
            content: proseToHtml(fullProse),
            wordCount,
            contentStatus: gateFailure ? 'review' : 'generated'
          },
          projectId
        )
      }
      const chapterNumber = chaptersWithScenes[record.chapterIndex]?.chapterMeta.chapterNumber
      writtenScenes.value[record.index] = {
        title: scene.title || `Scene ${scene.sceneNumber}`,
        prose: fullProse,
        summary,
        characters: scene.characters || scene.charactersPresent || [],
        location: scene.location || '',
        sceneNumber: scene.sceneNumber,
        subsectionId: scene.subsectionId,
        chapterId: chapterNumber,
        keyFacts: Array.isArray(chosen.draft.structured?.keyFacts)
          ? chosen.draft.structured.keyFacts
          : [],
        gateEval: chosen.verdict && !chosen.verdict.evalUnavailable ? chosen.verdict : null
      }
      recordSceneDigest({
        projectId,
        subsectionId: scene.subsectionId,
        chapterNumber,
        prose: fullProse,
        structured: chosen.draft.structured,
        scene
      })
      progress.current = Math.min(progress.total, progress.current + 1)
      await commitService.persistCheckpoint(projectId)
      noteSceneOutcome(true)
      if (chosen.draft.structured) structuredBySceneIndex.set(record.index, chosen.draft.structured)

      // Chapter complete → sync its discoveries to the bible, once.
      const chapter = chaptersWithScenes[record.chapterIndex]
      const chapterDone = chapter.scenes.every((_, j) => {
        const idx = chapter.startIndex + j
        return (
          idx === record.index || writtenScenes.value[idx] || state.scenes[idx]?.status === 'failed'
        )
      })
      if (chapterDone && !syncedChapters.has(record.chapterIndex)) {
        syncedChapters.add(record.chapterIndex)
        const chapterScenes = chapter.scenes
          .map((_, j) => chapter.startIndex + j)
          .filter((idx) => structuredBySceneIndex.has(idx))
          .map((idx) => ({ sceneIndex: idx, structured: structuredBySceneIndex.get(idx) }))
        if (chapterScenes.length > 0) {
          progress.statusText = `Syncing chapter ${chapter.chapterMeta.chapterNumber} to the story bible...`
          const synced = await syncChapterToBible(ctx, {
            projectId,
            volumeId: ctx.volumeId?.value ?? null,
            chapterId: chapterIdFor(chapter.scenes, record.chapterIndex),
            scenes: chapterScenes,
            commit: !reviewEntities
          })
          if (reviewEntities) pendingReview.push(...synced.changes)
          for (const idx of chapterScenes.map((c) => c.sceneIndex))
            structuredBySceneIndex.delete(idx)
        }
      }
      return { scenes: [{ ...record, status: 'committed' as const, gateFailure }] }
    }

    /** Editor: decide what each lane does next; auto-commit what is settled. */
    async function decideNode(state: WritingStateType) {
      throwIfAborted()
      if (runHealth.shouldAbort()) {
        await haltRun(projectId, runHealth.getAbortReason() || 'run health budget exceeded')
        return { finished: true, tasks: [] }
      }
      const tasks: LaneTask[] = []
      // Settled scenes are committed by code, not by choice: a clean pass, an
      // exhausted retry budget, or manual mode (no critic).
      for (const s of state.scenes) {
        if (s.status !== 'critiqued') continue
        if (s.accepted || s.attempts >= maxAttempts || !retryGate) {
          tasks.push({ kind: 'commit', index: s.index })
        }
      }
      const committing = new Set(tasks.map((t) => t.index))
      const editorState: EditorState = {
        scenes: summarize(state.scenes).map((s) =>
          committing.has(s.index) ? { ...s, status: 'committed' } : s
        ),
        budget: {
          maxAttempts,
          lookahead,
          // The session budget exposes a verdict, not a number: surface the
          // soft-cap warning so the Editor can prefer accepting over revising.
          budgetNote: editor.sessionBudget?.check().reason || null
        },
        gpuBusy: false,
        cpuBusy: false,
        recent: state.decisions.slice(-3)
      }
      let decision =
        mode === 'agentic'
          ? await editor.decideAgentic(editorState, ctx.abort?.signal?.())
          : editor.decideWorkflow(editorState)
      // A model that waits on both lanes while work remains would stall the
      // run; the workflow order stands in and the log says so.
      const workRemains = editorState.scenes.some(
        (s) => s.status !== 'committed' && s.status !== 'failed'
      )
      if (
        decision.gpu.action === 'wait' &&
        decision.cpu.action === 'wait' &&
        workRemains &&
        tasks.length === 0
      ) {
        decision = {
          ...editor.decideWorkflow(editorState),
          source: 'fallback',
          rejected: { raw: decision, reason: 'waited on both lanes with work remaining' }
        }
      }

      const toTask = (a: EditorAction): LaneTask | null => {
        if (a.target == null) return null
        if (a.action === 'draft' || a.action === 'revise') {
          return { kind: 'draft', index: a.target, instructions: a.instructions ?? null }
        }
        if (a.action === 'critique') return { kind: 'critique', index: a.target }
        if (a.action === 'commit' && !committing.has(a.target))
          return { kind: 'commit', index: a.target }
        return null
      }
      for (const a of [decision.gpu, decision.cpu]) {
        const t = toTask(a)
        if (t) tasks.push(t)
      }
      // Finished only when nothing is scheduled: a commit scheduled in the same
      // step as a `stop` still has to run, so `stop` alone does not end the graph.
      const finished = tasks.length === 0

      await logAgentDecision({
        projectId,
        runId,
        ts: Date.now(),
        step: state.step + 1,
        mode,
        source: decision.source,
        gpu: decision.gpu,
        cpu: decision.cpu,
        why: decision.why,
        rejected: decision.rejected ?? null,
        scenes: editorState.scenes.map((s) => ({
          index: s.index,
          status: s.status,
          attempts: s.attempts,
          score: s.score
        }))
      })
      if (decision.source === 'fallback') {
        actLog.appendThought(
          ctx.currentTaskId,
          null,
          `\n⚠ Editor answer rejected (${decision.rejected?.reason ?? 'invalid'}); workflow order used.\n`
        )
      }
      // Mark scenes the lanes are about to work on so the summary is honest on
      // the next step even if a node returns nothing.
      const marked: SceneRecord[] = []
      for (const t of tasks) {
        const s = state.scenes.find((x) => x.index === t.index)
        if (!s) continue
        if (t.kind === 'draft')
          marked.push({ ...s, status: 'drafting', instructions: t.instructions })
        if (t.kind === 'critique') marked.push({ ...s, status: 'critiquing' })
      }
      progress.statusText =
        tasks.map((t) => `${t.kind} scene ${t.index + 1}`).join(' · ') || 'Finishing…'
      return { decisions: [decision], tasks, step: state.step + 1, finished, scenes: marked }
    }

    function route(state: WritingStateType) {
      if (state.finished) return END
      const sends = state.tasks.map((t) => new Send(t.kind, t))
      return sends.length ? sends : END
    }

    // ── Graph ────────────────────────────────────────────────────────────
    // `Send` hands a node only its payload; the nodes also need the scene
    // records. The state is captured at the start of each `decide` (nodes in
    // the same superstep run after it and read from that snapshot).
    let current: WritingStateType | null = null
    function latestState(): WritingStateType {
      if (!current) throw new Error('graph state not initialised')
      return current
    }
    const decideWithCapture = async (state: WritingStateType) => {
      current = state
      return decideNode(state)
    }

    const checkpointer = new DexieSaver(db.graphCheckpoints, projectId)
    const compiled = new StateGraph(WritingState)
      .addNode('decide', decideWithCapture)
      .addNode('draft', (task: Extract<LaneTask, { kind: 'draft' }>) =>
        draftNode(task, latestState())
      )
      .addNode('critique', (task: Extract<LaneTask, { kind: 'critique' }>) =>
        critiqueNode(task, latestState())
      )
      .addNode('commit', (task: Extract<LaneTask, { kind: 'commit' }>) =>
        commitNode(task, latestState())
      )
      .addEdge(START, 'decide')
      .addConditionalEdges('decide', route, ['draft', 'critique', 'commit', END])
      .addEdge('draft', 'decide')
      .addEdge('critique', 'decide')
      .addEdge('commit', 'decide')
      .compile({ checkpointer })

    const initial: SceneRecord[] = scenePlan.value.map((scene, index) => ({
      index,
      chapterIndex: chapterIndexOf(index),
      title: scene.title || `Scene ${scene.sceneNumber}`,
      status: 'planned',
      attempts: 0,
      draft: null,
      verdict: null,
      accepted: false,
      best: null,
      baselineWordCount: 0,
      feedback: null,
      focusInstructions: null,
      instructions: null,
      gateFailure: null,
      error: null
    }))

    await updateGenRunStage(projectId, 'prose', { orchestrator: 'langgraph', mode, runId })
    progress.statusText = 'Writing the scenes…'
    const config = {
      configurable: { thread_id: runId },
      // Every scene costs at most 2 drafts + 2 critiques + 1 commit + the
      // decide steps between them; the rest is headroom for rejections.
      recursionLimit: scenePlan.value.length * 8 + 20,
      signal: ctx.abort?.signal?.()
    }
    const resuming = !!options.threadId
    const finalState = (await compiled.invoke(
      resuming ? null : { scenes: initial },
      config
    )) as WritingStateType

    // ── Wrap-up: the same reporting the parallel strategy does ──────────
    if (inlineEvalEnabled.value) {
      const results = []
      for (const s of finalState.scenes) {
        const ws = writtenScenes.value[s.index]
        const ev = ws?.gateEval
        if (!ws || !ev) continue
        results.push({
          sceneIndex: s.index + 1,
          passed: ev.pass,
          score: ev.score,
          dimensionScores: ev.dimensionScores || null,
          topIssues: (ev.issues || []).slice(0, 3).map((i: { text?: string }) => i.text || i)
        })
      }
      evalStore.setResults(results)
      for (const r of results) {
        const sb = scenePlan.value.find((sp) => sp.sceneNumber === r.sceneIndex)
        persistCritiqueEval(r, projectId, sb?.title, sb?.subsectionId)
      }
    }

    if (autoMode.value) {
      const QUALITY_FLOOR_FAIL_RATIO = 0.5
      const QUALITY_FLOOR_MIN_JUDGED = 4
      const judged = finalState.scenes
        .map((s) => s.best?.verdict)
        .filter((e): e is CriticVerdict => !!e && !e.evalUnavailable && e.score != null)
      const failed = judged.filter((e) => !isCleanPass(e))
      runFailedScenes.value = runHealth.failedScenes()
      if (
        judged.length >= QUALITY_FLOOR_MIN_JUDGED &&
        failed.length / judged.length >= QUALITY_FLOOR_FAIL_RATIO
      ) {
        const warning = `Quality floor breached: ${failed.length}/${judged.length} scenes fell below the critic's floor after retries and were kept for review. If nearly every scene fails, the writer or critic model is probably mismatched for this gate.`
        console.warn(`[graphStrategy] ${warning}`)
        runHealth.record('gate_failed', { stage: 'qualityFloor', detail: warning })
        actLog.appendThought(ctx.currentTaskId, null, `\n⚠ ${warning}\n`)
      }
    }

    const modelDecisions = finalState.decisions.filter((d) => d.source === 'model').length
    const fallbacks = finalState.decisions.filter((d) => d.source === 'fallback').length
    actLog.appendThought(
      ctx.currentTaskId,
      null,
      `Orchestrator: ${finalState.step} steps, ${modelDecisions} model decisions, ${fallbacks} fallbacks.\n`
    )
    langfuseService.endSpan(spanId)

    if (reviewEntities && pendingReview.length > 0) {
      const seen = new Set<string>()
      const preview = pendingReview.filter((c) => {
        const change = c as {
          type?: string
          sourceKey?: string
          entity?: { name?: string; title?: string }
        }
        const key = `${change.type}:${String(change.sourceKey || change.entity?.name || change.entity?.title || '').toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      ctx.syncPreview.value = preview
      await ctx.delegatorApi.dispatch('BATCH_COMPLETE', {
        batchStart: scenePlan.value.length,
        batchEnd: scenePlan.value.length,
        preview
      })
      ctx.hasPendingBatches.value = false
      progress.statusText = `${preview.length} discovered entit${preview.length === 1 ? 'y' : 'ies'} waiting for your review`
      return
    }

    await completeGeneration(projectId)
  }

  return { runGraphGeneration }
}
