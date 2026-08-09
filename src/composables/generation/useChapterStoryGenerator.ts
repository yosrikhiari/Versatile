import { computed, ref } from 'vue'
import { useVolumeStoryGenerator } from '../useVolumeStoryGenerator'
import { useEvalStore } from '../../stores/evalStore'
import { useActivityLog } from '../useActivityLog'
import { langfuseService } from '../../services/langfuseService'
import { clearGenRun } from '../../services/db-generation'
import { getResumableRun as readResumableRun } from './checkpoint'
import {
  evaluateChapter,
  describeChapterGate,
  shortestScenes,
  type ChapterGateReport
} from '../../services/generation/chapterGate'

/**
 * The chapter generation pipeline.
 *
 * Chapter mode is not a smaller volume run. It is the *same* per-scene pipeline
 * with (a) its own isolated delegator instance, (b) a run size of one chapter
 * rather than one book, and (c) one genuinely new stage — a chapter-level
 * acceptance gate that runs after the chapter's scenes are written.
 *
 * **Isolation.** This composable owns a private `useVolumeStoryGenerator()`
 * instance. That call creates its own `useDelegatorGeneration()`, which creates
 * its own `AgentMemory` (`AgentMemory.ts` — the memory slot is built inside the
 * exported function, so every instance gets a fresh one). Arc and chapter runs
 * therefore cannot collide on phase, session budget or history. Composing the
 * pipeline rather than copying it is deliberate: the alternative is two
 * divergent copies of a 4,000-line writer loop, and the Global Constraints
 * require the arc path to stay byte-identical.
 *
 * **The `singleChapter` trap this exists to end.** The arc generator's
 * `runSizeFor(structureSpec, singleChapter)` returns `{ chapters: 1, scenes: 1 }`
 * when `singleChapter` is set, and truncates the plan to a single scene. That
 * puts the hard budget ceiling at 36 calls / 138k tokens, which a 5-scene
 * chapter with one retry apiece exceeds — every call after that throws before
 * reaching a model. Chapter mode therefore never passes `singleChapter`; it
 * passes an explicit one-chapter structure spec, which sizes the budget as
 * `{ chapters: 1, scenes: N }` and leaves the plan intact.
 */

/** Where the chapter gate runs relative to the underlying run. */
const CHAPTER_GATE_STAGE = 'chapterGate'

export interface ChapterRunSettings {
  projectId: string
  synopsis: string
  genre: string
  tone: string
  wordTarget: number
  scenesPerChapter: number
  sparkContext?: string
  auto?: boolean
  research?: any
  onPhaseChange?: (phase: any) => void
  onPartialData?: (type: any, name: any) => void
  onChunk?: (payload: any) => void
}

export function useChapterStoryGenerator() {
  // Own instance → own delegator → own AgentMemory. Never share this.
  const inner = useVolumeStoryGenerator()
  const evalStore = useEvalStore()
  const actLog = useActivityLog()

  const phase = inner.phase
  const runSize = ref({ chapters: 1, scenes: 0 })
  /** Always true — this composable exists to generate exactly one chapter. */
  const singleChapter = ref(true)
  const chapterGateReport = ref<ChapterGateReport | null>(null)

  // Held from `startGeneration` so `confirmPlan` can be called with nothing but
  // the author's revisions: the plan-preview gate returns control to the UI
  // between the two, and the arc path solves this by making the panel carry the
  // arc and contract back. A chapter run carries them itself.
  const runContext = ref<{
    projectId: string
    synopsis: string
    sparkContext: string
    storyArc: any
    storyContract: string
    wordTarget: number
    onChunk?: (payload: any) => void
    onPhaseChange?: (phase: any) => void
  } | null>(null)

  const traceId = ref<string | null>(null)

  /**
   * The per-scene word budget.
   *
   * `Math.ceil`, not `round`: rounding down leaves the chapter systematically
   * short of the target the author typed.
   */
  function getSceneBudget(totalWords: number, sceneCount: number): number {
    const scenes = Math.max(1, Number(sceneCount) || 0)
    return Math.ceil((Number(totalWords) || 0) / scenes)
  }

  /** Scene count for a request, clamped to at least one. */
  function chapterSceneCount(scenesPerChapter: number): number {
    return Math.max(1, Number(scenesPerChapter) || 1)
  }

  function log(text: string) {
    const taskId = (inner as any).memory?.currentTaskId?.value
    if (taskId) actLog.appendThought(taskId, null, text)
  }

  /**
   * Start a chapter run: bootstrap, plan, and stop at the plan preview.
   *
   * Returns the director's result so a caller that wants to drive `confirmPlan`
   * itself can, exactly as the arc path does.
   */
  async function startGeneration(settings: ChapterRunSettings) {
    const scenes = chapterSceneCount(settings.scenesPerChapter)
    const wordTarget = Math.max(1, Number(settings.wordTarget) || 0)
    runSize.value = { chapters: 1, scenes }
    chapterGateReport.value = null

    traceId.value = `chapter-gen-${settings.projectId}-${Date.now()}`
    langfuseService.createTrace(traceId.value, {
      name: 'chapter-generation',
      mode: 'chapter',
      projectId: settings.projectId,
      scenes,
      wordTarget,
      genre: settings.genre,
      tone: settings.tone
    })

    const result = await inner.startGeneration({
      projectId: settings.projectId,
      synopsis: settings.synopsis,
      genre: settings.genre,
      tone: settings.tone,
      wordTarget,
      // Deliberately NOT `singleChapter`. See the header: that flag sizes the
      // budget for one scene and truncates the plan to one scene.
      structure: {
        volumes: 1,
        chaptersPerVolume: 1,
        scenesPerChapter: scenes,
        wordsPerChapter: wordTarget
      },
      sparkContext: settings.sparkContext,
      auto: settings.auto,
      research: settings.research,
      onPhaseChange: settings.onPhaseChange,
      onPartialData: settings.onPartialData,
      onChunk: settings.onChunk
    })

    runContext.value = {
      projectId: settings.projectId,
      synopsis: settings.synopsis,
      sparkContext: settings.sparkContext || '',
      storyArc: result?.storyArc ?? null,
      storyContract: result?.storyContract ?? '',
      wordTarget,
      onChunk: settings.onChunk,
      onPhaseChange: settings.onPhaseChange
    }

    // One-click mode writes the whole chapter inside `startGeneration`, so the
    // gate has to run here too or an auto run would never be judged.
    if (settings.auto && phase.value === 'complete') {
      await runChapterGate(settings.projectId)
    }

    return result
  }

  /**
   * Confirm the plan and write the chapter, then run the chapter gate.
   *
   * Accepts either the author's revision text or the full arc-style options
   * object, so the panel can pass an edited plan without the chapter composable
   * needing a second entry point.
   */
  async function confirmPlan(revisionsOrOptions: string | Record<string, any> = '') {
    const ctx = runContext.value
    const options = typeof revisionsOrOptions === 'string' ? {} : revisionsOrOptions || {}
    const projectId = options.projectId || ctx?.projectId
    if (!projectId) return

    await inner.confirmPlan({
      projectId,
      editedPlan: options.editedPlan || inner.scenePlan.value,
      storyArc: options.storyArc ?? ctx?.storyArc ?? null,
      storyContract: options.storyContract ?? ctx?.storyContract ?? '',
      synopsis: options.synopsis ?? ctx?.synopsis ?? '',
      sparkContext: options.sparkContext ?? ctx?.sparkContext ?? '',
      onPhaseChange: options.onPhaseChange ?? ctx?.onPhaseChange,
      onChunk: options.onChunk ?? ctx?.onChunk
    })

    if (phase.value === 'complete') await runChapterGate(projectId)
  }

  /**
   * Judge the finished chapter.
   *
   * Runs once the underlying run has committed and the terminal continuity
   * audit has produced its report — the gate needs both, and a chapter is not
   * judgeable until it is whole. It reports; it never discards prose. A short
   * chapter gets one bounded expansion round over its two shortest scenes and
   * is then re-measured once, because a short chapter is fixable and erroring
   * the run would throw away work the author paid real inference time for.
   */
  async function runChapterGate(projectId: string) {
    const spanId = traceId.value ? `${traceId.value}-gate` : null
    if (traceId.value && spanId) {
      langfuseService.span(traceId.value, spanId, CHAPTER_GATE_STAGE, { mode: 'chapter' })
    }

    let report = evaluateChapter(gateInput())

    if (report.findings.some((f) => f.code === 'chapter_short')) {
      const expanded = await expandShortestScenes(projectId)
      if (expanded > 0) report = evaluateChapter(gateInput())
    }

    chapterGateReport.value = report
    log(describeChapterGate(report))

    // Only blocking findings enter the health ledger. `DegradationKind` is a
    // closed union and every member means "a scene is worse than it should be";
    // stretching one to carry an advisory would corrupt `degradedScenes()`.
    for (const finding of report.findings) {
      if (finding.severity !== 'block') continue
      inner.runHealth.record('gate_failed', {
        stage: CHAPTER_GATE_STAGE,
        detail: finding.message
      })
    }

    if (traceId.value && spanId) {
      langfuseService.endSpan(spanId, {
        output: { passed: report.passed, findings: report.findings.length }
      })
      // Scored at the trace, not just logged in the span: these are the two
      // numbers worth trending across runs — did the chapter pass, and did it
      // land on the length the author asked for.
      langfuseService.score(traceId.value, 'chapter-gate', report.passed ? 1 : 0)
      langfuseService.score(traceId.value, 'chapter-word-ratio', report.metrics.wordRatio)
    }

    return report
  }

  function gateInput() {
    return {
      scenes: inner.writtenScenes.value,
      plan: inner.scenePlan.value,
      verdicts: evalStore.results,
      continuity: inner.consistencyReport.value,
      targetWords: runContext.value?.wordTarget ?? 0,
      metadataFailed: inner.runHealth.countByKind('metadata_failed'),
      metadataSkipped: inner.runHealth.countByKind('metadata_skipped'),
      degradedScenes: inner.runHealth.degradedScenes()
    }
  }

  /**
   * One bounded expansion round over the two shortest scenes, using the
   * writer's existing continuation path. Bounded is the point: an unbounded
   * "make it longer" loop on local inference costs hours.
   */
  async function expandShortestScenes(projectId: string): Promise<number> {
    const target = runContext.value?.wordTarget ?? 0
    const scenes = inner.writtenScenes.value
    const perScene = getSceneBudget(target, runSize.value.scenes)
    let expanded = 0

    for (const { scene } of shortestScenes(scenes, 2)) {
      const subsectionId = (scene as any).subsectionId
      if (!subsectionId) continue
      try {
        await inner.expandScene({
          projectId,
          subsectionId,
          targetWords: perScene,
          instructions:
            'The chapter came in short of its word target. Expand this scene to its full ' +
            'length by deepening what is already there — sensory detail, interiority, beat ' +
            'by beat action. Do not add new plot events.',
          onChunk: runContext.value?.onChunk
        })
        expanded++
      } catch (err) {
        console.warn('[useChapterStoryGenerator] expansion round failed:', err)
      }
    }
    return expanded
  }

  /** Approve the scene under review and continue writing. */
  async function approveScene() {
    return inner.approveScene()
  }

  async function rejectScene() {
    return inner.rejectScene()
  }

  async function reRequestScene(notes: string) {
    if (!notes?.trim()) return
    return inner.rerequestScene(notes)
  }

  /**
   * Resume a chapter run from its checkpoint.
   *
   * The session budget is re-sized from the *remaining* scenes by the run it
   * resumes, and `RunHealth.fromJSON` deliberately does not restore streaks — a
   * resume is a fresh attempt, and an inherited streak would abort it before it
   * wrote anything.
   */
  async function resumeGeneration(options: {
    projectId: string
    onChunk?: (payload: any) => void
    onPhaseChange?: (phase: any) => void
  }) {
    const result = await inner.resumeGeneration(options)
    if (phase.value === 'complete') await runChapterGate(options.projectId)
    return result
  }

  /**
   * Hold the run at the next scene boundary, keeping it in memory.
   *
   * Distinct from `stop()`, and deliberately so — see `pauseGate.ts`. Pausing
   * aborts nothing; continuing costs one resolved promise.
   */
  function pause() {
    return inner.pause()
  }

  async function continueGeneration() {
    return inner.continueGeneration()
  }

  /** Abort the in-flight request. Committed prose survives; run state does not. */
  function stop() {
    return inner.stop()
  }

  /** Stop, wipe run state, and clear the persisted checkpoint. */
  async function reset() {
    const projectId = runContext.value?.projectId
    await inner.reset()
    chapterGateReport.value = null
    runContext.value = null
    runSize.value = { chapters: 1, scenes: 0 }
    traceId.value = null
    if (projectId) {
      await clearGenRun(projectId).catch((err: any) => {
        console.warn('[useChapterStoryGenerator] clearGenRun failed:', err)
      })
    }
  }

  async function getResumableRun(projectId: string) {
    return readResumableRun(projectId)
  }

  /** Release the run so a panel unmount cannot leave a writer running behind it. */
  function destroy() {
    inner.stop()
  }

  return {
    ...inner,
    phase,
    runSize,
    singleChapter,
    chapterGateReport,
    chapterSceneCount: computed(() => runSize.value.scenes),
    getSceneBudget,
    startGeneration,
    confirmPlan,
    approveScene,
    rejectScene,
    reRequestScene,
    resumeGeneration,
    pause,
    continueGeneration,
    stop,
    reset,
    getResumableRun,
    destroy
  }
}
