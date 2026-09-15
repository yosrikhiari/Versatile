import type { Ref } from 'vue'
import { langfuseService } from '../../../services/langfuseService'
import { buildRagOptions } from '../../../services/researchScope'
import { formatEvalFeedback } from '../../../services/evalFeedback'
import { PARALLEL_CHAPTER_LIMIT } from '../context/spine'
import { buildRetrievalContext } from '../context/sceneContext'
import { computeSummary, parallelWithLimit } from '../utils'
import { proseToHtml, countProseWords } from './liveDraft'
import {
  assertProse,
  detectSceneConflicts,
  isCleanPass,
  resolveSceneConflicts
} from '../runMechanics'
import { rethrowIfFatal } from '../lifecycle'
import { PARALLEL_SCENE_LIMIT, WRITE_FAILURE_STREAK_ABORT } from './limits'
import { syncChapterToBible } from './bibleSync'
import type { SceneGateContext } from './sceneGate'

export interface ParallelStrategyContext extends SceneGateContext {
  bibleChangesDiscovered: Ref<number>
  scenesSynced: Ref<number>
  chapterPlan: Ref<any[]>
  commitService: any
  completeGeneration: (projectId: any) => Promise<void>
  delegatorApi: any
  error: Ref<any>
  evalStore: any
  generationSpanIds: Record<string, any>
  generationTraceId: Ref<any>
  haltRun: (projectId: any, reason: string) => Promise<void>
  inlineEvalEnabled: Ref<boolean>
  manuscriptStore: any
  progress: any
  recordSceneDigest: (args: any) => void
  runFailedScenes: Ref<number>
  scopedEntitiesBlob: (projectId: any) => Promise<string>
  spineArray: Ref<any[]>
  structuredResults: any[]
  sync: any
  syncPreview: Ref<any>
  hasPendingBatches: Ref<boolean>
  volumeId: Ref<any>
}

type SceneGate = {
  makeSceneStream: (args: any) => any
  writeSceneWithGate: (args: any) => Promise<any>
  chapterLogBefore: (sceneIndex: number, pending?: any, limit?: number) => string
}

/**
 * Anchor-first parallel writing: each chapter's opening and closing scenes are
 * drafted concurrently across chapters, then the middles in bounded waves.
 * Extracted from `useVolumeStoryGenerator` verbatim.
 */
export function createParallelStrategy(ctx: ParallelStrategyContext, sceneGate: SceneGate) {
  const {
    actLog,
    autoMode,
    chapterPlan,
    commitService,
    completeGeneration,
    critic,
    evalStore,
    gate,
    generationSpanIds,
    generationTraceId,
    haltRun,
    inlineEvalEnabled,
    manuscriptStore,
    persistCritiqueEval,
    progress,
    promptAdjuster,
    recordSceneDigest,
    runFailedScenes,
    runHealth,
    scenePlan,
    scopedEntitiesBlob,
    settings,
    spineArray,
    throwIfAborted,
    workspaceType,
    writer,
    writtenScenes
  } = ctx
  const { makeSceneStream, writeSceneWithGate, chapterLogBefore } = sceneGate

  async function runParallelGeneration(writeParamsVal: any) {
    if (!writeParamsVal) return
    const parallelSpanId = crypto.randomUUID()
    generationSpanIds.parallel = parallelSpanId
    langfuseService.span(generationTraceId.value!, parallelSpanId, 'parallel-writing', {
      projectId: writeParamsVal.projectId
    })
    const { storyArc, storyBibleDocs, storyContract, projectId, onChunk } = writeParamsVal

    // The writer's metadata per scene, kept until the scene's chapter is
    // complete so the whole chapter syncs to the bible in one commit (edges
    // stamped with the chapter, one `discoverSync` pass per scene).
    const structuredBySceneIndex = new Map<number, any>()
    // Outside one-click mode the author reviews what the writer discovered —
    // once, at the end, in the same sync-preview pause the batch path uses —
    // instead of the bible growing unasked. One-click means one-click: commit
    // per chapter as the run goes.
    const reviewEntities = !autoMode.value
    const pendingReview: any[] = []
    const sections: any[] = Array.isArray(writeParamsVal.sections) ? writeParamsVal.sections : []
    const chapterIdFor = (scenes: any[], chapterIndex: number) => {
      const bySubsection = sections.find((sec: any) =>
        (sec?.subsectionIds || []).some((id: any) =>
          scenes.some((sc: any) => String(sc?.subsectionId) === String(id))
        )
      )
      return bySubsection?.id ?? sections[chapterIndex]?.id ?? null
    }

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
    //
    // Counted in the run-health ledger (`write_failed`), not in a local
    // counter: one bookkeeping for "how many scenes failed" and "how many in a
    // row", read back through `runHealth.failedScenes()` / `.streak()`.
    const noteSceneOutcome = (ok: boolean, sceneIndex?: number, detail?: string) => {
      if (ok) {
        runHealth.resetStreak('write_failed')
        return
      }
      runHealth.record('write_failed', { stage: 'writer', sceneIndex, detail })
      runFailedScenes.value = runHealth.failedScenes()
      const streak = runHealth.streak('write_failed')
      if (streak >= WRITE_FAILURE_STREAK_ABORT && writtenScenes.value.every((s: any) => !s)) {
        throw new Error(
          `Aborting: the first ${streak} scenes all failed to produce prose. ` +
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

    async function generateAnchor(
      scene: any,
      role: any,
      constraints: any,
      sceneIndex: any,
      chapterIndex: any
    ) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(ctx.currentTaskId, phaseName)
      const stream = makeSceneStream({ scene, sceneIndex, onChunk })
      try {
        const embeddingContext = await buildRetrievalContext(
          scene,
          writtenScenes.value.filter(Boolean),
          5,
          ragOptions
        )
        const { chosenProse, chosenStructured, chosenEval, gateFailure } = await writeSceneWithGate(
          {
            scene,
            sceneIndex,
            scenePhase,
            storyArc,
            chapterLog: chapterLogBefore(sceneIndex),
            storyBible: storyBibleDocs,
            storyContract,
            existingEntitiesJson,
            embeddingContext,
            anchorRole: role,
            anchorConstraints: constraints,
            emitChunk: stream.emitChunk
          }
        )
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
            {
              content: proseToHtml(fullProse),
              wordCount,
              // A scene the gate could not clear is still a scene; 'review' asks
              // the author to look at it rather than hiding that it exists.
              contentStatus: gateFailure ? 'review' : 'generated'
            },
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
          keyFacts: Array.isArray(chosenStructured?.keyFacts) ? chosenStructured.keyFacts : [],
          // The verdict the gate already acted on; the anchor evaluation below
          // reuses it rather than paying for a second, contradicting opinion.
          gateEval: chosenEval && !chosenEval.evalUnavailable ? chosenEval : null
        }
        // Feed the digest layer from the committed scene (best-effort, never
        // awaited): this is what later runs read as earlier-chapters context.
        recordSceneDigest({
          projectId,
          subsectionId: scene.subsectionId,
          chapterNumber,
          prose: fullProse,
          structured: chosenStructured,
          scene
        })
        markSceneComplete()
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })
        // Checkpoint per scene. Without this the parallel writer — the path a
        // one-click volume actually takes — never wrote a resumable checkpoint
        // at all, so `getResumableRun` always returned null and the "Unfinished
        // draft" resume control could never appear no matter how far a run got.
        await commitService.persistCheckpoint(projectId)
        noteSceneOutcome(true)
        if (chosenStructured) structuredBySceneIndex.set(sceneIndex, chosenStructured)
        return { success: true, sceneIndex, structured: chosenStructured, eval: chosenEval }
      } catch (err: any) {
        stream.abandon()
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'failed' })
        // A spent budget or a stop is not this scene's failure — every remaining
        // scene would fail the same way, instantly. Swallowing it here is what
        // turned an exhausted run into 300 no-ops and a false "complete".
        rethrowIfFatal(err)
        // The reason went only into the per-scene result. When every scene
        // fails the same way, the run aborts with "failed to produce prose" and
        // nothing anywhere says why.
        console.warn(
          `[useVolumeStoryGenerator] scene ${sceneIndex + 1} failed:`,
          err?.message || err
        )
        if (scene?.subsectionId) {
          await manuscriptStore
            .updateSubsectionData(scene.subsectionId, { contentStatus: 'failed' }, projectId)
            .catch(() => {})
        }
        noteSceneOutcome(false, sceneIndex, err?.message || String(err))
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

    await gate()
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
        // In auto mode the gate already critiqued this prose (and chose it on
        // that verdict). Re-running the critic cost a call per anchor and let a
        // second verdict overwrite the first.
        const criticResult =
          s.gateEval ||
          (await critic.evaluateScene({
            draft: s.prose,
            sceneBrief,
            storyBible: storyBibleDocs,
            chapterLog: chapterLogBefore(idx),
            existingEntitiesJson: '',
            focusInstructions: ''
          }))
        anchorResults.push({
          sceneIndex: idx + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          topIssues: (criticResult.issues || []).slice(0, 3).map((i: any) => i.text || i),
          dimensionScores: criticResult.dimensionScores || null
        })
      }
      evalStore.setResults(anchorResults)
      for (const ae of anchorResults) {
        const sb = scenePlan.value.find((sp) => sp.sceneNumber === ae.sceneIndex)
        persistCritiqueEval(ae, projectId, sb?.title, sb?.subsectionId)
      }
      anchorEvalFeedback = formatEvalFeedback(anchorResults)
      const anchorResult = promptAdjuster.updateAdjustments(anchorResults, {
        workspaceType: workspaceType.value
      })
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
      const scenePhase = actLog.addPhase(ctx.currentTaskId, phaseName)
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

        const { chosenProse, chosenStructured, chosenEval, gateFailure } = await writeSceneWithGate(
          {
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
          }
        )
        const fullProse = chosenProse
        assertProse(fullProse, scene)
        stream.done(fullProse)

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse, chosenStructured)
        const wordCount = countProseWords(fullProse)

        markSceneComplete()
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })
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
          eval: chosenEval,
          gateFailure
        }
      } catch (err: any) {
        stream.abandon()
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'failed' })
        rethrowIfFatal(err)
        // The reason went only into the per-scene result. When every scene
        // fails the same way, the run aborts with "failed to produce prose" and
        // nothing anywhere says why.
        console.warn(
          `[useVolumeStoryGenerator] scene ${sceneIndex + 1} failed:`,
          err?.message || err
        )
        if (scene?.subsectionId) {
          await manuscriptStore
            .updateSubsectionData(scene.subsectionId, { contentStatus: 'failed' }, projectId)
            .catch(() => {})
        }
        noteSceneOutcome(false, sceneIndex, err?.message || String(err))
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
            contentStatus: result.gateFailure ? 'review' : 'generated'
          },
          projectId
        )
      }
      if (result.structured) structuredBySceneIndex.set(result.sceneIndex, result.structured)
      writtenScenes.value[result.sceneIndex] = {
        title: result.title || result.scene?.title || `Scene ${result.sceneNumber}`,
        prose: result.prose,
        summary: result.summary,
        characters: result.characters,
        location: result.location,
        sceneNumber: result.sceneNumber,
        subsectionId: result.subsectionId,
        chapterId: result.chapterId,
        keyFacts: result.keyFacts,
        gateEval: result.eval && !result.eval.evalUnavailable ? result.eval : null
      }
      // Same digest feed as the anchor path (best-effort, never awaited).
      // chapterId carries the chapter NUMBER here, not a row id.
      recordSceneDigest({
        projectId,
        subsectionId: result.subsectionId,
        chapterNumber: result.chapterId,
        prose: result.prose,
        structured: result.structured,
        scene: result.scene || result
      })
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

      for (let waveStart = 0; waveStart < unwritten.length; waveStart += PARALLEL_SCENE_LIMIT) {
        const waveEnd = Math.min(waveStart + PARALLEL_SCENE_LIMIT, unwritten.length)
        const wave = unwritten.slice(waveStart, waveEnd)

        await gate()

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

      // The chapter is written: everything its scenes reported goes into the
      // bible and the graph now, so the next chapter's scenes see it as known
      // and its edges carry this chapter's number.
      const chapterScenes = scenes
        .map((_: any, j: number) => startIndex + j)
        .filter((idx: number) => structuredBySceneIndex.has(idx))
        .map((idx: number) => ({ sceneIndex: idx, structured: structuredBySceneIndex.get(idx) }))
      if (chapterScenes.length > 0) {
        progress.statusText = `Syncing chapter ${chapterMeta.chapterNumber} to the story bible...`
        const synced = await syncChapterToBible(ctx, {
          projectId,
          volumeId: ctx.volumeId?.value ?? null,
          chapterId: chapterIdFor(scenes, chapterIndex),
          scenes: chapterScenes,
          commit: !reviewEntities
        })
        if (reviewEntities) pendingReview.push(...synced.changes)
        if (synced.entitiesCreated || synced.edgesWritten) {
          actLog.appendThought(
            ctx.currentTaskId,
            null,
            `Chapter ${chapterMeta.chapterNumber}: ${synced.entitiesCreated} new entit${synced.entitiesCreated === 1 ? 'y' : 'ies'}, ${synced.edgesWritten} relationship edge${synced.edgesWritten === 1 ? '' : 's'} committed to the bible.`
          )
        }
        for (const idx of chapterScenes.map((c: { sceneIndex: number }) => c.sceneIndex)) {
          structuredBySceneIndex.delete(idx)
        }
      }
    }

    if (inlineEvalEnabled.value) {
      progress.statusText = 'Evaluating middle scenes...'
      const middleResults = []
      for (let idx = 0; idx < writtenScenes.value.length; idx++) {
        const s = writtenScenes.value[idx]
        if (!s || evalStore.results.some((r: any) => r.sceneIndex === idx + 1)) continue
        const sceneBrief = scenePlan.value.find((sp) => sp.sceneNumber === s.sceneNumber) || {}
        const criticResult =
          s.gateEval ||
          (await critic.evaluateScene({
            draft: s.prose,
            sceneBrief,
            storyBible: storyBibleDocs,
            chapterLog: chapterLogBefore(idx),
            existingEntitiesJson: null,
            focusInstructions: null
          }))
        middleResults.push({
          sceneIndex: idx + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          dimensionScores: criticResult.dimensionScores || null,
          topIssues: (criticResult.issues || []).slice(0, 3).map((i: any) => i.text || i)
        })
      }
      evalStore.setResults([...evalStore.results, ...middleResults])
      for (const me of middleResults) {
        const sb = scenePlan.value.find((sp) => sp.sceneNumber === me.sceneIndex)
        persistCritiqueEval(me, projectId, sb?.title, sb?.subsectionId)
      }
    }

    // Parallel-safe quality floor: an aggregate fail-ratio over judged scenes
    // (consecutive failure is undefined under parallel execution). Only
    // meaningful when the gate actually ran (autoMode).
    //
    // It used to end the run in `error` and skip completion. Every scene is
    // committed now — a gate failure keeps the best attempt, flagged for
    // review — so a breached floor is a fact about the prose the author
    // already has, not a reason to withhold the continuity audit and the
    // wrap-up. It is recorded in the health ledger and shouted in the log;
    // `degradedScenes()` and the degraded-rate invariant carry it to the UI.
    // A live run on the default models tripped this with 30/30 scenes below
    // the floor, book fully written, run reported as failed.
    if (autoMode.value) {
      const QUALITY_FLOOR_FAIL_RATIO = 0.5
      const QUALITY_FLOOR_MIN_JUDGED = 4
      const anchorEvals = anchorOutcomes.flatMap((o: any) =>
        (o?.results || []).map((r: any) => r?.eval)
      )
      const gateEvals = [...anchorEvals, ...middleOutcomes.map((r: any) => r?.eval)].filter(Boolean)
      const judged = gateEvals.filter((e: any) => !e.evalUnavailable && e.score != null)
      const failed = judged.filter((e) => !isCleanPass(e))
      // The gate recorded each of these as `critique_failed`; the ledger is the count.
      runFailedScenes.value = runHealth.failedScenes()
      if (
        judged.length >= QUALITY_FLOOR_MIN_JUDGED &&
        failed.length / judged.length >= QUALITY_FLOOR_FAIL_RATIO
      ) {
        const warning = `Quality floor breached: ${failed.length}/${judged.length} scenes fell below the critic's floor after retries and were kept for review. If nearly every scene fails, the writer or critic model is probably mismatched for this gate.`
        console.warn(`[useVolumeStoryGenerator] ${warning}`)
        runHealth.record('gate_failed', { stage: 'qualityFloor', detail: warning })
        actLog.appendThought(ctx.currentTaskId, null, `\n⚠ ${warning}\n`)
      }
    }

    langfuseService.endSpan(parallelSpanId)

    // Review mode: hand the collected discoveries to the sync-preview pause.
    // `confirmSync` commits the accepted ones against every structured result
    // the run pushed and, with no pending batch, completes the generation.
    if (reviewEntities && pendingReview.length > 0) {
      const seen = new Set<string>()
      const preview = pendingReview.filter((c: any) => {
        const key = `${c.type}:${String(c.sourceKey || c.entity?.name || c.entity?.title || '').toLowerCase()}`
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
      // Nothing is left to write; the confirm goes straight to completion.
      ctx.hasPendingBatches.value = false
      progress.statusText = `${preview.length} discovered entit${preview.length === 1 ? 'y' : 'ies'} waiting for your review`
      return
    }

    await completeGeneration(projectId)
  }

  return { runParallelGeneration }
}
