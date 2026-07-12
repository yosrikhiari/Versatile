import { buildFocusInstructions, formatEvalFeedback } from '../services/evalFeedback'
import { buildExistingEntitiesBlob, buildRetrievalContext } from './generation/context/sceneContext'
import { parallelWithLimit, computeSummary } from './generation/utils'
import { PARALLEL_CHAPTER_LIMIT } from './generation/context/spine'
import { updateGenRunStage } from '../services/db-generation'

const SYNC_BATCH_SIZE = 3
const SCENE_MAX_ATTEMPTS = 2
const QUALITY_FLOOR_CONSECUTIVE = 3

function sectionIndexForScene(sections, sceneIndex) {
  let offset = 0
  for (let i = 0; i < sections.length; i++) {
    const count = (sections[i].scenes && sections[i].scenes.length) || 0
    if (sceneIndex < offset + count) return i
    offset += count
  }
  return Math.max(0, sections.length - 1)
}

function attemptScore(ev) {
  return ev && !ev.evalUnavailable && typeof ev.score === 'number' ? ev.score : -1
}
function isCleanPass(ev) {
  return !!(ev && !ev.evalUnavailable && ev.pass)
}

export function useVolumeWrite(ctx) {
  const {
    phase,
    progress,
    error,
    scenePlan,
    chapterPlan,
    spineArray,
    spineContext,
    writtenScenes,
    rejectedPatterns,
    runConsecutiveFailures,
    runFailedScenes,
    currentSceneResult,
    currentWriteIndex,
    sceneEvalResults,
    hasPendingBatches,
    pendingBatchStart,
    lastSyncedResultIndex,
    writeParams,
    syncPreview,
    sceneReviewMode,
    autoMode,
    inlineEvalEnabled,
    volumeId,
    writer,
    critic,
    sync,
    commitService,
    consistencyService,
    manuscriptStore,
    storyBibleStore,
    actLog,
    onLogRejectedPattern,
    onCompleteGeneration,
    onConfirmSync
  } = ctx

  async function approveScene() {
    if (!currentSceneResult.value || !writeParams.value) return
    const { scene, fullProse, sectionIdx } = currentSceneResult.value
    const { projectId, sections } = writeParams.value
    currentSceneResult.value = null
    progress.statusText = 'Approving scene and continuing...'
    await commitService.commitAndStoreScene(scene, fullProse, sectionIdx, sections, projectId)
    phase.value = 'writing'
    await writeNextBatch(currentWriteIndex.value)
  }

  async function rejectScene() {
    if (!currentSceneResult.value) return
    const { scene, fullProse } = currentSceneResult.value
    onLogRejectedPattern(scene.goal || scene.title, fullProse.slice(0, 500))
    currentSceneResult.value = null
    progress.statusText = 'Rejecting scene, rewriting...'
    phase.value = 'writing'
    await writeNextBatch(currentWriteIndex.value - 1)
  }

  async function rerequestScene(edits) {
    if (!currentSceneResult.value || !edits?.trim()) return
    const i = currentWriteIndex.value - 1
    scenePlan.value[i].reRequestInstruction = edits
    currentSceneResult.value = null
    progress.statusText = 'Rewriting scene with user revisions...'
    phase.value = 'writing'
    await writeNextBatch(i)
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
    phase.value = 'writing'

    async function generateAnchor(scene, role, constraints, sceneIndex, chapterIndex) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(ctx.currentTaskId, phaseName)
      try {
        let fullProse = ''
        const result = await writer.writeSceneStructured({
          sceneBrief: scene,
          storyArc,
          chapterLog: '',
          storyBible: storyBibleDocs,
          spineContext: spineContext.value,
          anchorRole: role,
          anchorConstraints: constraints,
          storyContract,
          existingEntitiesJson,
          onChunk: (_chunk, proseChunk) => {
            fullProse += proseChunk || ''
            onChunk?.({
              sceneIndex: sceneIndex + 1,
              total: scenePlan.value.length,
              chunk: proseChunk,
              fullProse,
              scene
            })
          },
          onRawChunk: (chunk) => actLog.appendThought(ctx.currentTaskId, scenePhase, chunk)
        })
        fullProse = result.prose

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse)
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
          keyFacts: Array.isArray(result.structured?.keyFacts) ? result.structured.keyFacts : []
        }
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: result.structured }
      } catch (err) {
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'failed' })
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

    const limit = PARALLEL_CHAPTER_LIMIT()
    const anchorOutcomes = await parallelWithLimit(anchorTasks, limit)

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
      anchorFocusInstructions = buildFocusInstructions(anchorResults)
    }

    progress.statusText = 'Phase 2: Generating chapter middle scenes...'

    async function generateMiddleScene(scene, sceneIndex, chapterMeta) {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(ctx.currentTaskId, phaseName)
      try {
        const logEntries = writtenScenes.value
          .filter((s) => s && s.chapterId === chapterMeta.chapterNumber && s.summary)
          .map((s) => `Scene ${s.sceneNumber} ("${s.title}"): ${s.summary}`)
        const chapterLog = logEntries.join('\n')

        let fullProse = ''
        const result = await writer.writeSceneStructured({
          sceneBrief: scene,
          storyArc,
          chapterLog,
          storyBible: storyBibleDocs,
          spineContext: spineContext.value,
          storyContract,
          existingEntitiesJson,
          pastEvalResults: anchorEvalFeedback || undefined,
          focusInstructions: anchorFocusInstructions || undefined,
          onChunk: (_chunk, proseChunk) => {
            fullProse += proseChunk || ''
            onChunk?.({
              sceneIndex: sceneIndex + 1,
              total: scenePlan.value.length,
              chunk: proseChunk,
              fullProse,
              scene
            })
          },
          onRawChunk: (chunk) => actLog.appendThought(ctx.currentTaskId, scenePhase, chunk)
        })
        fullProse = result.prose

        progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse)
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
          keyFacts: Array.isArray(result.structured?.keyFacts) ? result.structured.keyFacts : []
        }

        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: result.structured }
      } catch (err) {
        actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'failed' })
        return { success: false, sceneIndex, error: err.message }
      }
    }

    const middleTasks = []
    for (let chapterIndex = 0; chapterIndex < chaptersWithScenes.length; chapterIndex++) {
      const { chapterMeta, scenes, startIndex } = chaptersWithScenes[chapterIndex]
      for (let j = 0; j < scenes.length; j++) {
        const sceneIndex = startIndex + j
        if (writtenScenes.value[sceneIndex] !== null) continue
        const scene = scenes[j]
        middleTasks.push(() => generateMiddleScene(scene, sceneIndex, chapterMeta))
      }
    }

    let middleOutcomes = []
    if (middleTasks.length > 0) {
      middleOutcomes = await parallelWithLimit(middleTasks, limit)
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
          topIssues: (criticResult.issues || []).slice(0, 3).map((i) => i.text || i)
        })
      }
      sceneEvalResults.value = [...sceneEvalResults.value, ...middleResults]
    }

    await onCompleteGeneration(projectId)
  }

  async function writeNextBatch(startIndex) {
    if (!writeParams.value) return

    const { projectId, storyArc, storyContract, onChunk, storyBibleDocs, sections } =
      writeParams.value
    const endIndex = Math.min(startIndex + SYNC_BATCH_SIZE, scenePlan.value.length)

    const runningChapterLog = writtenScenes.value
      .filter(Boolean)
      .map((ws) => `Scene ${ws.sceneNumber} ("${ws.title}"): ${ws.summary || '(written)'}`)

    const existingEntitiesJson = buildExistingEntitiesBlob(
      storyBibleStore.characters,
      storyBibleStore.locations,
      storyBibleStore.plotThreads
    )

    let batchEvalFeedback = ''
    let batchFocusInstructions = ''

    for (let i = startIndex; i < endIndex; i++) {
      const scene = scenePlan.value[i]
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = actLog.addPhase(ctx.currentTaskId, phaseName)
      progress.current = i + 1
      progress.sceneLabel = scene.title || `Scene ${scene.sceneNumber}`
      progress.statusText = `Drafting scene details, building continuity context, and streaming prose...`

      const embeddingContext = await buildRetrievalContext(scene, writtenScenes.value)

      const chapterLog = runningChapterLog.slice(-20).join('\n')

      const extraRejected = rejectedPatterns.value.length > 0 ? rejectedPatterns.value : undefined

      scene.totalScenes = scenePlan.value.length

      const effectiveStoryContract = scene.reRequestInstruction
        ? storyContract +
          `\n\nUser revision request for scene ${scene.sceneNumber}: ${scene.reRequestInstruction}`
        : storyContract
      if (scene.reRequestInstruction) delete scene.reRequestInstruction

      const retryGate = autoMode.value
      const maxAttempts = retryGate ? SCENE_MAX_ATTEMPTS : 1
      let chosenProse = ''
      let chosenStructured = null
      let chosenEval = null
      let attemptFeedback = batchEvalFeedback
      let attemptFocusInstructions = batchFocusInstructions

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let fullProse = ''
        const result = await writer.writeSceneStructured({
          sceneBrief: scene,
          storyArc,
          chapterLog,
          storyBible: storyBibleDocs,
          spineContext: spineContext.value,
          onChunk: (_chunk, proseChunk) => {
            fullProse += proseChunk || ''
            onChunk?.({
              sceneIndex: i + 1,
              total: scenePlan.value.length,
              chunk: proseChunk,
              fullProse,
              scene
            })
          },
          onRawChunk: (chunk) => actLog.appendThought(ctx.currentTaskId, scenePhase, chunk),
          embeddingContext,
          storyContract: effectiveStoryContract,
          rejectedPatterns: extraRejected,
          existingEntitiesJson,
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
          storyBible: storyBibleDocs,
          chapterLog: ''
        })
        if (!chosenEval || attemptScore(criticResult) > attemptScore(chosenEval)) {
          chosenProse = proseText
          chosenStructured = result.structured
          chosenEval = criticResult
        }
        if (!criticResult || criticResult.evalUnavailable || criticResult.pass) break
        attemptFeedback = formatEvalFeedback([
        attemptFocusInstructions = buildFocusInstructions([
          {
            sceneIndex: i + 1,
            passed: criticResult.pass,
            score: criticResult.score,
            topIssues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss)
          }
        ])
      }
      actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'done' })

      const fullProse = chosenProse
      ctx.structuredResults.push({ sceneIndex: i, structured: chosenStructured })

      if (sceneReviewMode.value && i < scenePlan.value.length - 1) {
        currentSceneResult.value = {
          scene,
          fullProse,
          structured: chosenStructured,
          sectionIdx: sectionIndexForScene(sections, i)
        }
        currentWriteIndex.value = i + 1
        phase.value = 'scene-review'
        return
      }

      await commitService.commitAndStoreScene(
        scene,
        fullProse,
        sectionIndexForScene(sections, i),
        sections,
        projectId
      )
      commitService.persistCheckpoint(projectId)

      if (retryGate && chosenEval) {
        sceneEvalResults.value.push({
          sceneIndex: i + 1,
          passed: chosenEval.pass,
          score: chosenEval.score,
          topIssues: (chosenEval.issues || []).slice(0, 3).map((iss) => iss.text || iss)
        })
        batchEvalFeedback = formatEvalFeedback(sceneEvalResults.value)
        batchFocusInstructions = buildFocusInstructions(sceneEvalResults.value)

        const judged = chosenEval && !chosenEval.evalUnavailable && chosenEval.score != null
        if (judged && !isCleanPass(chosenEval)) {
          runFailedScenes.value++
          runConsecutiveFailures.value++
          onLogRejectedPattern(
            `Scene ${scene.sceneNumber} failed critique after ${maxAttempts} attempt(s)`,
            fullProse.slice(0, 200)
          )
          if (runConsecutiveFailures.value >= QUALITY_FLOOR_CONSECUTIVE) {
            error.value = `Quality floor breached: ${runConsecutiveFailures.value} scenes in a row failed critique after retries. The writer or critic model is likely misconfigured. ${writtenScenes.value.length} scene(s) written and saved.`
            commitService.persistCheckpoint(projectId)
            await updateGenRunStage(projectId, 'prose', { status: 'failed', error: error.value })
            phase.value = 'error'
            actLog.updatePhase(ctx.currentTaskId, scenePhase, { status: 'error' })
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
          topIssues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss)
        }
        sceneEvalResults.value.push(evalEntry)
        batchEvalFeedback = formatEvalFeedback(sceneEvalResults.value)
        batchFocusInstructions = buildFocusInstructions(sceneEvalResults.value)
      }

      const latestScene = writtenScenes.value.at(-1)
      runningChapterLog.push(
        `Scene ${scene.sceneNumber} ("${scene.title || `Scene ${scene.sceneNumber}`}"): ${latestScene?.summary || '(written)'}`
      )
    }

    await consistencyService.maybeRunIncrementalConsistency(endIndex)

    const freshStructured = ctx.structuredResults.slice(lastSyncedResultIndex.value)
    lastSyncedResultIndex.value = ctx.structuredResults.length

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
        phase.value = 'sync-preview'
        if (autoMode.value) {
          await onConfirmSync({
            acceptedEntities: batchChanges,
            projectId,
            volumeId: volumeId.value
          })
        }
        return
      }
      await writeNextBatch(endIndex)
      return
    }

    if (batchChanges.length > 0) {
      syncPreview.value = batchChanges
      phase.value = 'sync-preview'
      if (autoMode.value) {
        await onConfirmSync({ acceptedEntities: batchChanges, projectId, volumeId: volumeId.value })
      }
      return
    }

    await onCompleteGeneration(projectId)
  }

  return {
    runParallelGeneration,
    writeNextBatch,
    approveScene,
    rejectScene,
    rerequestScene
  }
}
