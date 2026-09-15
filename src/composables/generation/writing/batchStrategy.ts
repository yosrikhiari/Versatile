import type { Ref } from 'vue'
import { formatEvalFeedback } from '../../../services/evalFeedback'
import {
  buildEarlierChaptersBlock,
  rollupProjectDigests
} from '../../../services/generation/digestContext'
import { buildRetrievalContext } from '../context/sceneContext'
import { assertProse, batchEndIndex, isCleanPass, sectionIndexForScene } from '../runMechanics'
import type { NextBatch } from '../runMechanics'
import { QUALITY_FLOOR_CONSECUTIVE, RECENT_SCENE_LOG_LIMIT, SCENE_MAX_ATTEMPTS } from './limits'
import type { SceneGateContext } from './sceneGate'

export interface BatchStrategyContext extends SceneGateContext {
  activeLearningBridge: any
  bibleChangesDiscovered: Ref<number>
  scenesSynced: Ref<number>
  chapterPlan: Ref<any[]>
  commitService: any
  completeGeneration: (projectId: any) => Promise<void>
  confirmSync: (opts: any) => Promise<void>
  consistencyService: any
  currentWriteIndex: Ref<number>
  delegatorApi: any
  driftTriggeredEval: any
  error: Ref<any>
  evalStore: any
  haltRun: (projectId: any, reason: string) => Promise<void>
  hasPendingBatches: Ref<boolean>
  inlineEvalEnabled: Ref<boolean>
  lastSyncedResultIndex: Ref<number>
  logRejectedPattern: (context: string, feedback: string) => void
  pendingBatchStart: Ref<number>
  prefetchStats: any
  progress: any
  researchRagOptions: () => any
  runFailedScenes: Ref<number>
  sceneReviewMode: Ref<boolean>
  scopedEntitiesBlob: (projectId: any) => Promise<string>
  speculativeCache: any
  readonly structuredResults: any[]
  sync: any
  syncPreview: Ref<any[]>
  volumeId: Ref<any>
}

type SceneGate = {
  makeSceneStream: (args: any) => any
  writeSceneWithGate: (args: any) => Promise<any>
  chapterLogBefore: (sceneIndex: number, pending?: any, limit?: number) => string
}

/**
 * Sequential, chapter-aligned batches — the path review mode and the
 * continuation flows use — plus the speculative prefetch that drafts the next
 * scene while the writer reviews the current one.
 * Extracted from `useVolumeStoryGenerator` verbatim.
 */
export function createBatchStrategy(ctx: BatchStrategyContext, sceneGate: SceneGate) {
  const {
    actLog,
    activeLearningBridge,
    autoMode,
    bibleChangesDiscovered,
    scenesSynced,
    chapterPlan,
    commitService,
    completeGeneration,
    confirmSync,
    consistencyService,
    critic,
    currentSceneResult,
    currentWriteIndex,
    delegatorApi,
    driftTriggeredEval,
    evalStore,
    gate,
    haltRun,
    hasPendingBatches,
    inlineEvalEnabled,
    lastSyncedResultIndex,
    liveDraft,
    logRejectedPattern,
    pendingBatchStart,
    persistCritiqueEval,
    prefetchStats,
    progress,
    promptAdjuster,
    rejectedPatterns,
    researchRagOptions,
    runFailedScenes,
    runHealth,
    scenePlan,
    sceneReviewMode,
    scopedEntitiesBlob,
    speculativeCache,
    sync,
    syncPreview,
    volumeId,
    workspaceType,
    writeParams,
    writtenScenes
  } = ctx
  const { makeSceneStream, writeSceneWithGate, chapterLogBefore } = sceneGate

  /**
   * Best-effort speculative prefetch of a single scene.
   * Fails silently — the cache is an optimisation, never a correctness requirement.
   */
  async function prefetchNextScene(index: any) {
    if (speculativeCache.has(index)) return
    if (!writeParams.value) return
    const { projectId, storyArc, storyContract, storyBibleDocs } = writeParams.value
    const scene = scenePlan.value[index]
    if (!scene) return

    speculativeCache.reserve(index)

    try {
      // Running chapter log, same shape the batch path builds — including the
      // scene the writer is reviewing right now. That one is not committed
      // until they approve it, so a log built from committed scenes alone
      // drafted scene i+1 with no knowledge of scene i.
      const chapterLog = chapterLogBefore(index, currentSceneResult.value)

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

  /**
   * One batch: write its scenes, evaluate, sync its entity changes.
   *
   * @returns where the loop should go next, or `null` when this batch was the
   * end of the road. Null covers every outcome where something other than the
   * loop owns the next step — the run finished, the user has a scene or a sync
   * preview to review, the run was halted, or an error was dispatched.
   */
  async function writeOneBatch(
    startIndex: any,
    incomingFocusInstructions = ''
  ): Promise<NextBatch> {
    if (!writeParams.value) return null

    const { projectId, storyArc, storyContract, onChunk, storyBibleDocs, sections } =
      writeParams.value
    const endIndex = batchEndIndex(startIndex, chapterPlan.value, scenePlan.value.length)

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
      await gate()
      const scene = scenePlan.value[i]
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(ctx.currentTaskId, phaseName)
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
      const chapterLog = [
        earlierChapters,
        runningChapterLog.slice(-RECENT_SCENE_LOG_LIMIT).join('\n')
      ]
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
      const { chosenProse, chosenStructured, chosenEval, gateFailure } = written
      // Before the phase is marked done: an empty result reaching this point
      // committed an empty scene and logged it as a success.
      assertProse(chosenProse, scene)
      actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })

      const fullProse = chosenProse
      ctx.structuredResults.push({ sceneIndex: i, structured: chosenStructured })

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
        // The user owns the next step now — `approveScene`/`rejectScene` re-enter
        // through `onWriteNextBatch`.
        void prefetchNextScene(i + 1)
        return null
      }

      await commitService.commitAndStoreScene(
        scene,
        fullProse,
        sectionIndexForScene(sections, i),
        sections,
        projectId,
        chosenStructured,
        i,
        gateFailure || null
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
        const batchResult = promptAdjuster.updateAdjustments(evalStore.results, {
          workspaceType: workspaceType.value
        })
        batchFocusInstructions = batchResult.focusInstructions

        // Quality floor: a scene that still fails after all retries counts against
        // the run. Its best attempt is committed and flagged, so a streak of them
        // is reported (once, loudly) rather than ending the run — the run-health
        // ledger's `prose_rejected` budget still halts a model that is actually
        // looping, which is the case this abort was written for.
        // The gate already recorded the rejection as `critique_failed` with
        // the scene index; the ledger's streak is the consecutive count and
        // `failedScenes()` the total — no parallel counters to keep in step.
        const judged = chosenEval && !chosenEval.evalUnavailable && chosenEval.score != null
        if (judged && !isCleanPass(chosenEval)) {
          runFailedScenes.value = runHealth.failedScenes()
          logRejectedPattern(
            `Scene ${scene.sceneNumber} failed critique after ${maxAttempts} attempt(s)`,
            fullProse.slice(0, 200)
          )
          const streak = runHealth.streak('critique_failed')
          if (streak === QUALITY_FLOOR_CONSECUTIVE) {
            const warning = `Quality floor breached: ${streak} scenes in a row fell below the critic's floor after retries and were kept for review. The writer or critic model may be mismatched for this gate.`
            console.warn(`[useVolumeStoryGenerator] ${warning}`)
            runHealth.record('gate_failed', { stage: 'qualityFloor', detail: warning })
            actLog.appendThought(
              ctx.currentTaskId,
              null,
              `
⚠ ${warning}
`
            )
          }
        } else {
          runHealth.resetStreak('critique_failed')
        }
      } else if (inlineEvalEnabled.value) {
        const criticResult = await critic.evaluateScene({
          draft: scene.prose,
          sceneBrief: scene,
          storyBible: storyBibleDocs,
          chapterLog: chapterLogBefore(i),
          existingEntitiesJson: null,
          focusInstructions: null
        })
        const evalEntry = {
          sceneIndex: i + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          dimensionScores: criticResult.dimensionScores || null,
          topIssues: (criticResult.issues || []).slice(0, 3).map((iss: any) => iss.text || iss)
        }
        evalStore.addResult(evalEntry)
        persistCritiqueEval(evalEntry, projectId, scene.title, scene.subsectionId)
        batchEvalFeedback = formatEvalFeedback(evalStore.results)
        const batchResult2 = promptAdjuster.updateAdjustments(evalStore.results, {
          workspaceType: workspaceType.value
        })
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
      chapterLog: chapterLogBefore(startIndex)
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
    const freshStructured = ctx.structuredResults.slice(lastSyncedResultIndex.value)
    lastSyncedResultIndex.value = ctx.structuredResults.length

    const batchChanges = []
    for (const sr of freshStructured) {
      if (sr.structured) {
        const sceneChanges = sync.discoverSync(sr.structured)
        scenesSynced.value += 1
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
        // One-click mode: accept every discovered entity and keep writing.
        // `confirmSync` drives the run forward from `pendingBatchStart` by
        // re-entering `writeNextBatch`, so the loop here is finished either way.
        if (autoMode.value) {
          await confirmSync({ acceptedEntities: batchChanges, projectId, volumeId: volumeId.value })
        }
        return null
      }
      // The damping term. Without it the feedback loop has none: a degraded
      // scene degrades the next scene's context, so continuing past a run of
      // failures manufactures more of them. Stopping here costs the author the
      // scenes in the budget; not stopping cost them a whole volume.
      if (runHealth.shouldAbort()) {
        await haltRun(projectId, runHealth.getAbortReason() || 'run health budget exceeded')
        return null
      }
      // The one path that continues the loop: scenes left, and no entity
      // changes needing a look first.
      return { startIndex: endIndex, focusInstructions: batchFocusInstructions }
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
      return null
    }

    await completeGeneration(projectId)
    return null
  }

  return { prefetchNextScene, writeOneBatch }
}
