import type { Ref } from 'vue'
import type {
  CriticVerdict,
  DraftedScene,
  GatedScene,
  SceneBrief,
  StoryArc,
  WriteSceneWithGateArgs
} from '../types'
import {
  countWords,
  gateDimensionCoverage,
  gateProseQuality,
  gateScoreDistribution
} from '../../../services/evalGates'
import { deriveVerdict } from '../../../services/criticVerdict'
import { getDefaultThreshold } from '../../../config/evalDimensions'
import { formatEvalFeedback } from '../../../services/evalFeedback'
import {
  buildCloudDisclosure,
  canUseCloudEscalation,
  getAnalysisTier,
  maybeAutoEscalateScene
} from '../../../services/cloudEscalation'
import { isUnsalvageableProse } from '../../useStoryWriter'
import { shouldChunkScene, splitSceneIntoChunks, mergeChunkProse } from '../sceneChunker'
import { buildSceneEntitiesBlob } from '../context/sceneContext'
import { attemptScore, isCleanPass } from '../runMechanics'
import { isFatalRunError } from '../lifecycle'
import { RECENT_SCENE_LOG_LIMIT, SCENE_MAX_ATTEMPTS } from './limits'
import { buildStoryStateContext } from '../context/sceneContext'

/**
 * Everything the scene gate reaches for in the orchestrator's scope.
 *
 * Refs and services are handed over as-is; `currentTaskId` is a plain `let`
 * the orchestrator reassigns per run, so it is read through a getter.
 */
export interface SceneGateContext {
  readonly currentTaskId: any
  abort: any
  actLog: any
  autoMode: Ref<boolean>
  critic: any
  evalUnavailableCount: Ref<number>
  gate: () => Promise<void>
  liveDraft: any
  promptAdjuster: any
  rejectedPatterns: Ref<any[]>
  runHealth: any
  scenePlan: Ref<any[]>
  settings: any
  spineContext: Ref<any>
  storyBibleStore: any
  throwIfAborted: () => void
  workspaceType: { value: any }
  writeParams: Ref<any>
  writer: any
  writtenScenes: Ref<any[]>
  /** The scene under review in review mode, not yet committed. */
  currentSceneResult: Ref<any>
  persistCritiqueEval: (entry: any, projectId: any, title?: any, subsectionId?: any) => void
}

/**
 * The per-scene write → critique → retry loop, its chunked variant for very
 * long scenes, the live-draft stream, and the chapter log both consumers read.
 *
 * Extracted from `useVolumeStoryGenerator` verbatim: the sequential and the
 * parallel write strategies both route through `writeSceneWithGate`, so it
 * lives beside neither of them.
 */
export function createSceneGate(ctx: SceneGateContext) {
  const {
    abort,
    actLog,
    autoMode,
    critic,
    evalUnavailableCount,
    liveDraft,
    promptAdjuster,
    runHealth,
    scenePlan,
    settings,
    spineContext,
    storyBibleStore,
    throwIfAborted,
    workspaceType,
    writeParams,
    writer,
    writtenScenes
  } = ctx

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
      const sectionPhase = actLog.addPhase(ctx.currentTaskId, phaseName)
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
          : undefined
      })
    })

    const results: any[] = await Promise.allSettled(sectionPromises)
    const proseSections = results.map((r: any) =>
      r.status === 'fulfilled' ? r.value.chosenProse : ''
    )
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
        ctx.currentTaskId,
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
  /**
   * What happened before scene `sceneIndex`, one line per written scene.
   *
   * Two consumers had no such thing. Every critic call passed `chapterLog: ''`,
   * so the critic's prompt read "(First scene)" for every scene and its
   * continuity dimension judged blind — breaks were only caught later by the
   * far more expensive entity audit. And the review-mode prefetch built its log
   * from committed scenes only, which never includes the scene the writer is
   * looking at right now, so scene i+1 was drafted without scene i.
   *
   * `pending` lets a caller append that not-yet-committed scene.
   */
  function chapterLogBefore(
    sceneIndex: number,
    pending?: { scene: any; structured?: any } | null,
    limit = RECENT_SCENE_LOG_LIMIT
  ): string {
    const entries: string[] = []
    for (let i = 0; i < sceneIndex; i++) {
      const ws = writtenScenes.value[i]
      if (ws) {
        entries.push(`Scene ${ws.sceneNumber} ("${ws.title}"): ${ws.summary || '(written)'}`)
        continue
      }
      // Not written yet — the parallel path drafts a chapter's closing anchor
      // before its middle. The plan's beat for that scene is still far better
      // than silence: the model knows what is *meant* to have happened.
      const planned = scenePlan.value[i]
      if (!planned) continue
      const beat = planned.whatChanges || planned.goal || planned.emotionalGoal || ''
      entries.push(
        `Scene ${planned.sceneNumber} ("${planned.title || `Scene ${planned.sceneNumber}`}") — planned, not yet written${beat ? `: ${beat}` : ''}`
      )
    }
    if (pending?.scene) {
      const sc = pending.scene
      const summary = pending.structured?.summary || sc.goal || '(written, awaiting review)'
      entries.push(
        `Scene ${sc.sceneNumber} ("${sc.title || `Scene ${sc.sceneNumber}`}"): ${summary}`
      )
    }
    return entries.slice(-limit).join('\n')
  }

  async function writeSceneWithGate({
    scene,
    sceneIndex,
    scenePhase,
    storyArc,
    chapterLog = '',
    /** Facts from chapters after this one are its own future — see buildStoryStateContext. */
    chapterNumber = null,
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
  }: WriteSceneWithGateArgs): Promise<GatedScene> {
    const retryGate = autoMode.value
    const maxAttempts = retryGate ? SCENE_MAX_ATTEMPTS : 1
    let chosenProse = ''
    let chosenStructured = null
    let chosenEval = null
    let attemptFeedback = pastEvalResults
    let attemptFocusInstructions = focusInstructions

    // Spend prompt budget on this scene's cast, not the whole bible. Falls back
    // to the caller's full dump when the scene names nobody to scope on.
    const sceneEntitiesJson = sceneEntitiesFor(scene, existingEntitiesJson)

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
      const drafted = await draftAttempt({
        // The chapter-scoped fact ledger. `buildFactLedger` has existed for a
        // while with all three callers in ConsistencyService — read AFTER the
        // prose to find contradictions, never before to prevent them.
        storyState: buildStoryStateContext(writtenScenes.value, chapterNumber),
        scene,
        sceneIndex,
        scenePhase,
        storyArc,
        chapterLog,
        storyBible,
        storyContract,
        sceneEntitiesJson,
        embeddingContext,
        extraRejected,
        anchorRole,
        anchorConstraints,
        emitChunk,
        attemptFeedback,
        attemptFocusInstructions,
        attempt,
        maxAttempts
      })
      if (!drafted.ok) continue
      const { prose: proseText, structured } = drafted
      if (attempt === 0) {
        baselineWordCount = countWords(proseText)
      }

      if (!retryGate) {
        chosenProse = proseText
        chosenStructured = structured
        break
      }

      const judged = await critiqueAttempt({
        proseText,
        structured,
        scene,
        sceneIndex,
        scenePhase,
        storyBible,
        chapterLog,
        sceneEntitiesJson,
        attemptFocusInstructions,
        baselineWordCount
      })
      const criticResult = judged.criticResult
      if (!chosenEval || attemptScore(criticResult) > attemptScore(chosenEval)) {
        chosenProse = proseText
        chosenStructured = structured
        chosenEval = criticResult
      }
      if (judged.accept) break

      attemptFeedback = judged.feedback
      attemptFocusInstructions = judged.focusInstructions
    }

    const gateFailure = markGateOutcome({
      chosenProse,
      chosenStructured,
      chosenEval,
      maxAttempts,
      sceneIndex,
      retryGate
    })

    return { chosenProse, chosenStructured, chosenEval, gateFailure }
  }

  // ── Gate primitives ───────────────────────────────────────────────────────
  //
  // `writeSceneWithGate` above is the legacy sequential composition: draft →
  // critique → maybe draft again, all on one path. The LangGraph strategy
  // (`writing/graphStrategy.ts`) needs the same pieces as separate nodes so the
  // Writer (GPU lane) and the Critic (CPU lane) can run at the same time and an
  // Editor can decide between them. Every gate rule — rejection handling, the
  // deterministic checks, cloud escalation, run-health records, the review
  // marking — lives in these three functions and nowhere else, so the two
  // orchestrators cannot drift apart on what "passes" means.

  interface DraftAttemptArgs {
    /** Chapter-scoped established facts, computed once per scene. */
    storyState?: string
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
    /** 0-based attempt number and the cap, for the rejection bookkeeping. */
    attempt: number
    maxAttempts: number
  }

  type DraftAttemptResult =
    ({ ok: true } & DraftedScene) | { ok: false; rejected: true; error: unknown }

  /**
   * One Writer call. A rejected draft (looping prose, a refusal) is reported,
   * not thrown, unless it was the last allowed attempt — the caller decides
   * whether to try again. Anything that is not a rejection propagates.
   */
  async function draftAttempt(args: DraftAttemptArgs): Promise<DraftAttemptResult> {
    const {
      scene,
      sceneIndex,
      scenePhase,
      storyArc,
      chapterLog,
      storyBible,
      storyContract,
      sceneEntitiesJson,
      embeddingContext,
      extraRejected,
      storyState,
      anchorRole,
      anchorConstraints,
      emitChunk,
      attemptFeedback,
      attemptFocusInstructions,
      attempt,
      maxAttempts
    } = args
    throwIfAborted()
    let fullProse = ''
    try {
      const result: DraftedScene = await writer.writeSceneStructured({
        sceneBrief: scene,
        storyArc,
        chapterLog,
        storyBible,
        storyState,
        spineContext: spineContext.value,
        anchorRole,
        anchorConstraints,
        signal: abort.signal(),
        onChunk: (_chunk: string, proseChunk: string) => {
          fullProse += proseChunk || ''
          emitChunk?.(proseChunk, fullProse)
        },
        onRawChunk: (chunk: string) => actLog.appendThought(ctx.currentTaskId, scenePhase, chunk),
        embeddingContext,
        storyContract,
        rejectedPatterns: extraRejected,
        existingEntitiesJson: sceneEntitiesJson,
        pastEvalResults: attemptFeedback || undefined,
        focusInstructions: attemptFocusInstructions || undefined
      })
      return { ok: true, prose: result.prose, structured: result.structured }
    } catch (err: unknown) {
      // A rejected attempt is not a failed scene. The writer refuses to hand
      // back looping prose OR a model refusal ("I'm sorry, but I can't..."),
      // so re-roll — that is the response the retry loop exists for.
      // Anything else is a real error and propagates.
      if (!isUnsalvageableProse(err)) throw err
      const message = err instanceof Error ? err.message : String(err)

      runHealth.record('prose_rejected', {
        stage: 'writer',
        sceneIndex,
        detail: message || 'rejected output'
      })
      actLog.appendThought(
        ctx.currentTaskId,
        scenePhase,
        `\n⚠ Attempt ${attempt + 1} was rejected (${message || 'unusable output'}). Retrying.\n`
      )
      // Out of attempts: let the caller treat the scene as failed rather than
      // committing prose the guard rejected.
      if (attempt === maxAttempts - 1) throw err
      return { ok: false, rejected: true, error: err }
    }
  }

  interface CritiqueAttemptArgs {
    proseText: string
    structured: DraftedScene['structured']
    scene: SceneBrief
    sceneIndex: number
    scenePhase: number | string | undefined
    storyBible: string | undefined
    chapterLog: string
    sceneEntitiesJson: string
    attemptFocusInstructions: string | undefined
    /** Word count of the first attempt, the reference for the prose-quality gate. */
    baselineWordCount: number
  }

  interface CritiqueAttemptResult {
    criticResult: CriticVerdict
    /** True when the gate is satisfied (or could not run): stop retrying. */
    accept: boolean
    /** Feedback and focus for the next attempt when `accept` is false. */
    feedback: string | undefined
    focusInstructions: string | undefined
    proseQ: { pass: boolean; flags: string[] }
    continuityOk: boolean
  }

  /**
   * One Critic call plus every deterministic check, escalation offer and
   * health record that surrounds it. Pure with respect to the caller's choice
   * of best attempt: it judges, it does not select.
   */
  async function critiqueAttempt(args: CritiqueAttemptArgs): Promise<CritiqueAttemptResult> {
    const {
      proseText,
      structured,
      scene,
      sceneIndex,
      scenePhase,
      storyBible,
      chapterLog,
      sceneEntitiesJson,
      attemptFocusInstructions,
      baselineWordCount
    } = args

    const criticResult: CriticVerdict = await critic.evaluateScene({
      draft: proseText,
      sceneBrief: scene,
      storyBible,
      chapterLog,
      existingEntitiesJson: sceneEntitiesJson,
      focusInstructions: attemptFocusInstructions
    })

    const dimCov = gateDimensionCoverage(criticResult, workspaceType.value)
    const scoreDist = gateScoreDistribution(criticResult)
    if (!dimCov.pass && dimCov.warnings.length > 0) {
      console.warn('[evalGate] dimensionCoverage:', dimCov.warnings.join('; '))
    }
    if (!scoreDist.pass && scoreDist.flags.length > 0) {
      console.warn('[evalGate] scoreDistribution:', scoreDist.flags.join('; '))
      // A scored verdict with nothing to say is counted, not acted on: one is
      // a clean scene, all of them is a flat critic (`critic_flat`).
      if (
        criticResult?.score != null &&
        !criticResult.evalUnavailable &&
        (criticResult.issues || []).length === 0
      ) {
        runHealth.record('eval_suspect', {
          stage: 'critic',
          sceneIndex,
          detail: scoreDist.flags.join('; ')
        })
      }
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
    const metaStatus = structured?.metadataStatus
    if (metaStatus === 'failed' || metaStatus === 'skipped') {
      runHealth.record(`metadata_${metaStatus}` as any, { stage: 'writer', sceneIndex })
    }

    // A critic that cannot parse its own output makes the run look healthier
    // and cheaper than it is: the gate exits, the draft is accepted, and
    // nothing in the UI says the quality gate never ran. Retrying the writer
    // would not help — it is the critic that failed — so we still accept, but
    // loudly, where the user is actually looking.
    if (criticResult?.evalUnavailable) {
      evalUnavailableCount.value += 1
      runHealth.record('eval_unavailable', { stage: 'critic', sceneIndex })
      actLog.appendThought(
        ctx.currentTaskId,
        scenePhase,
        "\n⚠ Quality gate did not run for this scene — the critic's output could not be parsed. The draft was accepted unchecked.\n"
      )
    }
    const continuityOk = (criticResult?.dimensionScores?.continuity ?? 10) >= 6

    // Cloud escalation check: if eval is unavailable or has suspect scores and
    // user has cloud escalation enabled, offer to escalate this scene's
    // evaluation to a cloud provider for a second opinion.
    if (canUseCloudEscalation()) {
      const needsEscalation =
        criticResult?.evalUnavailable ||
        (criticResult?.score != null && (criticResult.score < 3 || criticResult.score > 9)) ||
        (criticResult?.issues?.length === 0 &&
          criticResult?.score != null &&
          criticResult.score >= 7)

      if (needsEscalation) {
        const disclosure = await buildCloudDisclosure({
          projectId: writeParams.value?.projectId || '',
          operation: 'escalation-on-failure',
          text: proseText,
          systemPrompt:
            'You are an expert fiction editor. Evaluate this scene for quality, continuity, voice, and adherence to the story bible. Provide a score 1-10, dimension scores, issues, and strengths.',
          provider: settings.aiProvider,
          model: settings.ollamaModel
        })

        // A non-blocking offer — the user can choose to escalate or continue.
        actLog.appendThought(
          ctx.currentTaskId,
          scenePhase,
          `\n☁ Cloud escalation available: ${disclosure.warning}\n` +
            `Operation: ${disclosure.operation}\n` +
            `Estimated tokens: ${disclosure.estimatedTokens}\n` +
            `Estimated cost: $${disclosure.estimatedCostUsd.toFixed(4)}\n` +
            `Provider: ${disclosure.provider} (${disclosure.model})\n`
        )

        // Audit tier goes one step further: the project opt-in is advance
        // consent, so request the second opinion immediately instead of
        // waiting on the offer. Best-effort — the outcome is a ledger
        // note either way, never a run failure.
        try {
          const auto = await maybeAutoEscalateScene({
            projectId: writeParams.value?.projectId || '',
            tier: getAnalysisTier(),
            cloudAvailable: true,
            projectOptIn: !!settings.cloudAuditOptIn,
            provider: settings.aiProvider,
            model: settings.ollamaModel,
            operation: 'escalation-on-failure',
            text: proseText,
            systemPrompt:
              'You are an expert fiction editor. Evaluate this scene for quality, continuity, voice, and adherence to the story bible. Provide a score 1-10, dimension scores, issues, and strengths.'
          })
          if (auto.note) {
            actLog.appendThought(ctx.currentTaskId, scenePhase, `\n${auto.note}\n`)
          }
        } catch {
          // maybeAutoEscalateScene never throws by contract; this guards
          // the ledger call itself so a logging failure cannot break the run.
        }
      }
    }

    const accept =
      !criticResult ||
      criticResult.evalUnavailable ||
      (criticResult.pass && continuityOk && proseQ.pass)
    if (accept) {
      return {
        criticResult,
        accept: true,
        feedback: undefined,
        focusInstructions: undefined,
        proseQ,
        continuityOk
      }
    }

    const evalSnapshot = {
      sceneIndex: sceneIndex + 1,
      passed: criticResult.pass,
      score: criticResult.score,
      dimensionScores: criticResult.dimensionScores || null,
      // `iss.text || iss` used to hand the writer "[object Object]" for an
      // issue that only had a description; name the issue instead.
      topIssues: (criticResult.issues || [])
        .slice(0, 3)
        .map((iss) => iss.text || iss.description || '')
        .filter(Boolean)
    }
    const feedback = formatEvalFeedback([evalSnapshot])
    const retryResult = promptAdjuster.updateAdjustments([evalSnapshot], {
      workspaceType: workspaceType.value
    })
    return {
      criticResult,
      accept: false,
      feedback,
      focusInstructions: retryResult.focusInstructions,
      proseQ,
      continuityOk
    }
  }

  interface GateOutcomeArgs {
    chosenProse: string
    chosenStructured: DraftedScene['structured']
    chosenEval: CriticVerdict | null
    maxAttempts: number
    sceneIndex: number
    retryGate: boolean
  }

  /**
   * Out of attempts with the critic still unhappy. This used to throw, and the
   * callers treated the scene as failed: no prose committed, the subsection
   * left empty, and every later scene drafted against a hole in the chapter
   * log. Measured per-dimension averages on real output sit *below* the
   * gate's floor (voice 5.67, show_tell 6.83 — see criticVerdict.ts), so on a
   * one-click book run this dropped a large share of scenes outright. The
   * best attempt is kept instead: committed, marked for review, and recorded
   * as `gate_failed` so the run's health still reports it honestly. Losing
   * a 6/10 scene is worse than keeping one the author can regenerate.
   *
   * Returns the review reason, or null for a clean scene.
   */
  function markGateOutcome(args: GateOutcomeArgs): string | null {
    const { chosenProse, chosenStructured, chosenEval, maxAttempts, sceneIndex, retryGate } = args
    let gateFailure: string | null = null
    if (retryGate && chosenEval && !chosenEval.evalUnavailable && !isCleanPass(chosenEval)) {
      // Feed the verdict's weakest dimension into the adjuster so a rejected scene
      // produces a matching focus area (reconciles the two "weak dimension" rules).
      const verdict = deriveVerdict(chosenEval, getDefaultThreshold(workspaceType.value))
      if (verdict.weakestDimension) {
        promptAdjuster.updateAdjustments(
          [
            { dimensionScores: { [verdict.weakestDimension.name]: verdict.weakestDimension.score } }
          ],
          { workspaceType: workspaceType.value }
        )
      }

      const issueText = (i: NonNullable<CriticVerdict['issues']>[number]) =>
        i.description || i.text || ''
      const repetition = (chosenEval.issues || []).find((i) => i.type === 'repetition')
      const reason = repetition
        ? `Repetition detected: ${issueText(repetition)}`
        : // `verdictReason` names the dimension that actually failed ("voice scored
          // 6"), which is the actionable part. The score alone says nothing now that
          // the verdict is no longer derived from it.
          `Quality gate failed after ${maxAttempts} attempt(s): ${chosenEval.verdictReason || `score ${chosenEval.score}`}${chosenEval.issues?.length ? ` — issues: ${chosenEval.issues.map(issueText).join('; ')}` : ''}`
      gateFailure = reason
      runHealth.record('critique_failed', { stage: 'critic', sceneIndex, detail: reason })
      console.warn(`[sceneGate] scene ${sceneIndex + 1} kept for review: ${reason}`)
      actLog.appendThought(
        ctx.currentTaskId,
        `\n⚠ Best of ${maxAttempts} attempts kept for review — ${chosenEval.verdictReason || `score ${chosenEval.score}`}.\n`
      )
    }

    // A scene that came through with usable metadata and no gate failure clears
    // every streak. The budget measures CONSECUTIVE failure — without this reset,
    // three failures spread across fifty healthy scenes would halt a run that is
    // fundamentally fine.
    if (chosenProse && chosenStructured?.metadataStatus === 'ok' && !gateFailure) {
      runHealth.recordSuccess()
    }
    return gateFailure
  }

  /** The entity blob a scene is written and judged against (its own cast, else the full dump). */
  function sceneEntitiesFor(scene: SceneBrief, existingEntitiesJson: string | undefined): string {
    return (
      buildSceneEntitiesBlob(scene, {
        characters: storyBibleStore.characters,
        locations: storyBibleStore.locations,
        plotThreads: storyBibleStore.plotThreads
      }) ||
      existingEntitiesJson ||
      ''
    )
  }

  return {
    makeSceneStream,
    writeSceneChunked,
    chapterLogBefore,
    writeSceneWithGate,
    draftAttempt,
    critiqueAttempt,
    markGateOutcome,
    sceneEntitiesFor
  }
}
