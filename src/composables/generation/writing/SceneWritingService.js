import { formatEvalFeedback, buildFocusInstructions } from '../../../services/evalFeedback'
import { saveEvalResult, getEvalResultsByType } from '../../../services/db-evals'
import { buildExistingEntitiesBlob, buildRetrievalContext } from '../context/sceneContext'
import { useRagSelfRefine } from '../../rag/useRagSelfRefine'

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

export class SceneWritingService {
  constructor({
    writeParams,
    scenePlan,
    spineContext,
    storyBibleStore,
    manuscriptStore,
    writer,
    critic,
    sync,
    actLog,
    progress,
    phase,
    commitService,
    consistencyService,
    sceneEvalResults,
    inlineEvalEnabled,
    writtenScenes,
    lastSyncedResultIndex,
    rejectedPatterns,
    runConsecutiveFailures,
    runFailedScenes,
    hasPendingBatches,
    pendingBatchStart,
    syncPreview,
    currentSceneResult,
    currentWriteIndex,
    error,
    currentTaskId,
    sceneReviewMode,
    autoMode,
    structuredResults,
    volumeId,
    ragOptions
  }) {
    this.writeParams = writeParams
    this.scenePlan = scenePlan
    this.spineContext = spineContext
    this.storyBibleStore = storyBibleStore
    this.manuscriptStore = manuscriptStore
    this.writer = writer
    this.critic = critic
    this.sync = sync
    this.actLog = actLog
    this.progress = progress
    this.phase = phase
    this.commitService = commitService
    this.consistencyService = consistencyService
    this.sceneEvalResults = sceneEvalResults
    this.inlineEvalEnabled = inlineEvalEnabled
    this.writtenScenes = writtenScenes
    this.lastSyncedResultIndex = lastSyncedResultIndex
    this.rejectedPatterns = rejectedPatterns
    this.runConsecutiveFailures = runConsecutiveFailures
    this.runFailedScenes = runFailedScenes
    this.hasPendingBatches = hasPendingBatches
    this.pendingBatchStart = pendingBatchStart
    this.syncPreview = syncPreview
    this.currentSceneResult = currentSceneResult
    this.currentWriteIndex = currentWriteIndex
    this.error = error
    this.currentTaskId = currentTaskId
    this.sceneReviewMode = sceneReviewMode
    this.autoMode = autoMode
    this.structuredResults = structuredResults
    this.volumeId = volumeId
    this.ragOptions = ragOptions
  }

  onConfirmSync = null
  onCompleteGeneration = null
  onUpdateGenRunStage = null

  async writeNextBatch(startIndex) {
    if (!this.writeParams.value) return

    const { projectId, storyArc, storyContract, onChunk, storyBibleDocs, sections } =
      this.writeParams.value
    const endIndex = Math.min(startIndex + SYNC_BATCH_SIZE, this.scenePlan.value.length)

    const runningChapterLog = this.writtenScenes.value
      .filter(Boolean)
      .map((ws) => `Scene ${ws.sceneNumber} ("${ws.title}"): ${ws.summary || '(written)'}`)

    const existingEntitiesJson = buildExistingEntitiesBlob(
      this.storyBibleStore.characters,
      this.storyBibleStore.locations,
      this.storyBibleStore.plotThreads
    )

    const pastWritingEvals = projectId
      ? await getEvalResultsByType(projectId, 'writing-critique')
      : []
    const pastEvalObjects =
      pastWritingEvals.length > 0
        ? pastWritingEvals.map((e) => ({
            sceneIndex: e.sceneId != null ? Number(e.sceneId) : undefined,
            passed: e.passed,
            score: e.score,
            topIssues: (e.issues || []).slice(0, 3),
            dimensionScores: e.dimensionScores || null
          }))
        : []
    let batchEvalFeedback = pastEvalObjects.length > 0 ? formatEvalFeedback(pastEvalObjects) : ''
    let batchFocusInstructions =
      pastEvalObjects.length > 0 ? buildFocusInstructions(pastEvalObjects) : ''

    for (let i = startIndex; i < endIndex; i++) {
      const scene = this.scenePlan.value[i]
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = this.actLog.addPhase(this.currentTaskId, phaseName)
      this.progress.current = i + 1
      this.progress.sceneLabel = scene.title || `Scene ${scene.sceneNumber}`
      this.progress.statusText =
        'Drafting scene details, building continuity context, and streaming prose...'

      const embeddingContext = await buildRetrievalContext(
        scene,
        this.writtenScenes.value,
        5,
        this.ragOptions
      )

      const chapterLog = runningChapterLog.slice(-20).join('\n')

      const extraRejected =
        this.rejectedPatterns.value.length > 0 ? this.rejectedPatterns.value : undefined

      scene.totalScenes = this.scenePlan.value.length

      const effectiveStoryContract = scene.reRequestInstruction
        ? storyContract +
          `\n\nUser revision request for scene ${scene.sceneNumber}: ${scene.reRequestInstruction}`
        : storyContract
      if (scene.reRequestInstruction) delete scene.reRequestInstruction

      const retryGate = this.autoMode.value
      const maxAttempts = retryGate ? SCENE_MAX_ATTEMPTS : 1
      let chosenProse = ''
      let chosenStructured = null
      let chosenEval = null
      let attemptFeedback = batchEvalFeedback
      let attemptFocusInstructions = batchFocusInstructions

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let fullProse = ''
        const result = await this.writer.writeSceneStructured({
          sceneBrief: scene,
          storyArc,
          chapterLog,
          storyBible: storyBibleDocs,
          spineContext: this.spineContext.value,
          onChunk: (_chunk, proseChunk) => {
            fullProse += proseChunk || ''
            onChunk?.({
              sceneIndex: i + 1,
              total: this.scenePlan.value.length,
              chunk: proseChunk,
              fullProse,
              scene
            })
          },
          onRawChunk: (chunk) => this.actLog.appendThought(this.currentTaskId, scenePhase, chunk),
          embeddingContext,
          storyContract: effectiveStoryContract,
          rejectedPatterns: extraRejected,
          existingEntitiesJson,
          pastEvalResults: attemptFeedback || undefined,
          focusInstructions: attemptFocusInstructions || undefined
        })
        let proseText = result.prose

        if (this.ragOptions && embeddingContext) {
          const refined = await useRagSelfRefine(proseText, embeddingContext)
          if (refined.rounds > 0) {
            proseText = refined.revisedText
          }
        }

        if (!retryGate) {
          chosenProse = proseText
          chosenStructured = result.structured
          break
        }

        const criticResult = await this.critic.evaluateScene({
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
        const retryEval = {
          sceneIndex: i + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          topIssues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss),
          dimensionScores: criticResult.dimensionScores || null
        }
        attemptFeedback = formatEvalFeedback([retryEval])
        attemptFocusInstructions = buildFocusInstructions([retryEval])
      }
      this.actLog.updatePhase(this.currentTaskId, scenePhase, { status: 'done' })

      const fullProse = chosenProse
      this.structuredResults.push({ sceneIndex: i, structured: chosenStructured })

      if (this.sceneReviewMode.value && i < this.scenePlan.value.length - 1) {
        this.currentSceneResult.value = {
          scene,
          fullProse,
          structured: chosenStructured,
          sectionIdx: sectionIndexForScene(sections, i)
        }
        this.currentWriteIndex.value = i + 1
        this.phase.value = 'scene-review'
        return
      }

      await this.commitService.commitAndStoreScene(
        scene,
        fullProse,
        sectionIndexForScene(sections, i),
        sections,
        projectId
      )
      this.commitService.persistCheckpoint(projectId)

      if (retryGate && chosenEval) {
        this.sceneEvalResults.value.push({
          sceneIndex: i + 1,
          passed: chosenEval.pass,
          score: chosenEval.score,
          topIssues: (chosenEval.issues || []).slice(0, 3).map((iss) => iss.text || iss),
          dimensionScores: chosenEval.dimensionScores || null
        })
        if (projectId) {
          saveEvalResult({
            projectId,
            sceneId: i + 1,
            evalType: 'writing-critique',
            score: chosenEval.score,
            passed: chosenEval.pass,
            dimensionScores: chosenEval.dimensionScores || null,
            issues: (chosenEval.issues || []).slice(0, 3).map((iss) => iss.text || iss),
            strengths: (chosenEval.strengths || []).slice(0, 3),
            timestamp: new Date().toISOString()
          })
        }
        batchEvalFeedback = formatEvalFeedback(this.sceneEvalResults.value)
        batchFocusInstructions = buildFocusInstructions(this.sceneEvalResults.value)

        const judged = chosenEval && !chosenEval.evalUnavailable && chosenEval.score != null
        if (judged && !isCleanPass(chosenEval)) {
          this.runFailedScenes.value++
          this.runConsecutiveFailures.value++
          this.logRejectedPattern(
            `Scene ${scene.sceneNumber} failed critique after ${maxAttempts} attempt(s)`,
            fullProse.slice(0, 200)
          )
          if (this.runConsecutiveFailures.value >= QUALITY_FLOOR_CONSECUTIVE) {
            this.error.value = `Quality floor breached: ${this.runConsecutiveFailures.value} scenes in a row failed critique after retries. The writer or critic model is likely misconfigured. ${this.writtenScenes.value.length} scene(s) written and saved.`
            this.commitService.persistCheckpoint(projectId)
            await this.onUpdateGenRunStage?.(projectId, 'prose', {
              status: 'failed',
              error: this.error.value
            })
            this.phase.value = 'error'
            this.actLog.updatePhase(this.currentTaskId, scenePhase, { status: 'error' })
            return
          }
        } else {
          this.runConsecutiveFailures.value = 0
        }
      } else if (this.inlineEvalEnabled.value) {
        const criticResult = await this.critic.evaluateScene({
          draft: fullProse,
          sceneBrief: scene,
          storyBible: storyBibleDocs,
          chapterLog: ''
        })
        const evalEntry = {
          sceneIndex: i + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          topIssues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss),
          dimensionScores: criticResult.dimensionScores || null
        }
        this.sceneEvalResults.value.push(evalEntry)
        if (projectId) {
          saveEvalResult({
            projectId,
            sceneId: i + 1,
            evalType: 'writing-critique',
            score: criticResult.score,
            passed: criticResult.pass,
            dimensionScores: criticResult.dimensionScores || null,
            issues: (criticResult.issues || []).slice(0, 3).map((iss) => iss.text || iss),
            strengths: (criticResult.strengths || []).slice(0, 3),
            timestamp: new Date().toISOString()
          })
        }
        batchEvalFeedback = formatEvalFeedback(this.sceneEvalResults.value)
        batchFocusInstructions = buildFocusInstructions(this.sceneEvalResults.value)
      }

      const latestScene = this.writtenScenes.value.at(-1)
      runningChapterLog.push(
        `Scene ${scene.sceneNumber} ("${scene.title || `Scene ${scene.sceneNumber}`}"): ${latestScene?.summary || '(written)'}`
      )
    }

    await this.consistencyService.maybeRunIncrementalConsistency(endIndex)

    const freshStructured = this.structuredResults.slice(this.lastSyncedResultIndex.value)
    this.lastSyncedResultIndex.value = this.structuredResults.length

    const batchChanges = []
    for (const sr of freshStructured) {
      if (sr.structured) {
        const sceneChanges = this.sync.discoverSync(sr.structured)
        batchChanges.push(...sceneChanges)
      }
    }

    if (endIndex < this.scenePlan.value.length) {
      if (batchChanges.length > 0) {
        this.hasPendingBatches.value = true
        this.pendingBatchStart.value = endIndex
        this.syncPreview.value = batchChanges
        this.phase.value = 'sync-preview'
        if (this.autoMode.value) {
          await this.onConfirmSync?.({
            acceptedEntities: batchChanges,
            projectId,
            volumeId: this.volumeId?.value
          })
        }
        return
      }
      await this.writeNextBatch(endIndex)
      return
    }

    if (batchChanges.length > 0) {
      this.syncPreview.value = batchChanges
      this.phase.value = 'sync-preview'
      if (this.autoMode.value) {
        await this.onConfirmSync?.({
          acceptedEntities: batchChanges,
          projectId,
          volumeId: this.volumeId?.value
        })
      }
      return
    }

    await this.onCompleteGeneration?.(projectId)
  }

  logRejectedPattern(context, prose) {
    const entry = `[${new Date().toISOString()}] ${context}\n${prose}`
    this.rejectedPatterns.value.push(entry)
  }
}
