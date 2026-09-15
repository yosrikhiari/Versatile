import type { Ref } from 'vue'
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
          : null
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
          onRawChunk: (chunk: any) => actLog.appendThought(ctx.currentTaskId, scenePhase, chunk),
          embeddingContext,
          storyContract,
          rejectedPatterns: extraRejected,
          existingEntitiesJson: sceneEntitiesJson,
          pastEvalResults: attemptFeedback || undefined,
          focusInstructions: attemptFocusInstructions || undefined
        })
      } catch (err: any) {
        // A rejected attempt is not a failed scene. The writer refuses to hand
        // back looping prose OR a model refusal ("I'm sorry, but I can't..."),
        // so re-roll — that is the response this retry loop already exists for.
        // Anything else is a real error and propagates.
        if (!isUnsalvageableProse(err)) throw err

        runHealth.record('prose_rejected', {
          stage: 'writer',
          sceneIndex,
          detail: err?.message || 'rejected output'
        })
        actLog.appendThought(
          ctx.currentTaskId,
          scenePhase,
          `\n⚠ Attempt ${attempt + 1} was rejected (${err?.message || 'unusable output'}). Retrying.\n`
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
        chapterLog,
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
          ctx.currentTaskId,
          scenePhase,
          "\n⚠ Quality gate did not run for this scene — the critic's output could not be parsed. The draft was accepted unchecked.\n"
        )
      }
      const continuityOk = ((criticResult.dimensionScores as any)?.continuity ?? 10) >= 6

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
            // `writeParamsVal` is runParallelGeneration's local — it does not
            // exist in this scope, so this threw a ReferenceError (optional
            // chaining does not shield an undeclared identifier) every time a
            // scene qualified for cloud escalation.
            projectId: writeParams.value?.projectId || '',
            operation: 'escalation-on-failure',
            text: proseText,
            systemPrompt:
              'You are an expert fiction editor. Evaluate this scene for quality, continuity, voice, and adherence to the story bible. Provide a score 1-10, dimension scores, issues, and strengths.',
            provider: settings.aiProvider,
            model: settings.ollamaModel
          })

          // Store the disclosure for the UI to present to the user
          // This is a non-blocking offer - the user can choose to escalate or continue
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
        topIssues: (criticResult.issues || []).slice(0, 3).map((iss: any) => iss.text || iss)
      }
      attemptFeedback = formatEvalFeedback([evalSnapshot])
      const retryResult = promptAdjuster.updateAdjustments([evalSnapshot], {
        workspaceType: workspaceType.value
      })
      attemptFocusInstructions = retryResult.focusInstructions
    }

    // Out of attempts with the critic still unhappy. This used to throw, and the
    // callers treated the scene as failed: no prose committed, the subsection
    // left empty, and every later scene drafted against a hole in the chapter
    // log. Measured per-dimension averages on real output sit *below* the
    // gate's floor (voice 5.67, show_tell 6.83 — see criticVerdict.ts), so on a
    // one-click book run this dropped a large share of scenes outright. The
    // best attempt is kept instead: committed, marked for review, and recorded
    // as `gate_failed` so the run's health still reports it honestly. Losing
    // a 6/10 scene is worse than keeping one the author can regenerate.
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

      const reason = chosenEval.issues?.find((i: any) => i.type === 'repetition')
        ? `Repetition detected: ${chosenEval.issues.find((i: any) => i.type === 'repetition').description}`
        : // `verdictReason` names the dimension that actually failed ("voice scored
          // 6"), which is the actionable part. The score alone says nothing now that
          // the verdict is no longer derived from it.
          `Quality gate failed after ${maxAttempts} attempt(s): ${chosenEval.verdictReason || `score ${chosenEval.score}`}${chosenEval.issues?.length ? ` — issues: ${chosenEval.issues.map((i: any) => i.description).join('; ')}` : ''}`
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

    return { chosenProse, chosenStructured, chosenEval, gateFailure }
  }

  return { makeSceneStream, writeSceneChunked, chapterLogBefore, writeSceneWithGate }
}
