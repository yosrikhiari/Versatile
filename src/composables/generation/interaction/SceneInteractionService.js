import { buildRetrievalContext } from '../context/sceneContext'
import { buildExistingEntitiesBlob } from '../context/sceneContext'
import { computeSummary } from '../utils'

export class SceneInteractionService {
  constructor({
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
  }) {
    this.writeParams = writeParams
    this.scenePlan = scenePlan
    this.phase = phase
    this.progress = progress
    this.writer = writer
    this.sync = sync
    this.actLog = actLog
    this.writtenScenes = writtenScenes
    this.structuredResults = structuredResults
    this.hasPendingBatches = hasPendingBatches
    this.pendingBatchStart = pendingBatchStart
    this.manuscriptStore = manuscriptStore
    this.storyBibleStore = storyBibleStore
    this.commitService = commitService
    this.rejectedPatterns = rejectedPatterns
    this.autoMode = autoMode
    this.sceneReviewMode = sceneReviewMode
    this.currentSceneResult = currentSceneResult
    this.currentWriteIndex = currentWriteIndex
    this.sceneEvalResults = sceneEvalResults
    this.lastSyncedResultIndex = lastSyncedResultIndex
    this.syncPreview = syncPreview
    this.currentTaskId = currentTaskId
    this.volumeId = volumeId
    this.consistencyService = consistencyService
  }

  onWriteNextBatch = null
  onCompleteGeneration = null

  async confirmSync({ acceptedEntities, projectId, volumeId, chapterId }) {
    if (this.phase.value !== 'sync-preview') return
    this.progress.statusText = 'Integrating accepted entities and syncing story graph network...'

    const validStructured = this.structuredResults
      .filter((sr) => sr.structured)
      .map((sr) => sr.structured)
    await this.sync.commitSync({
      structuredOutputs: validStructured,
      acceptedEntities,
      projectId,
      volumeId: volumeId || this.volumeId,
      chapterId: chapterId || null
    })

    if (this.hasPendingBatches.value) {
      this.hasPendingBatches.value = false
      const resumeFrom = this.pendingBatchStart.value
      this.pendingBatchStart.value = 0
      this.phase.value = 'writing'
      await this.onWriteNextBatch?.(resumeFrom)
      return
    }

    await this.onCompleteGeneration?.(projectId)
  }

  async approveScene() {
    if (!this.currentSceneResult.value || !this.writeParams.value) return
    const { scene, fullProse, sectionIdx, structured } = this.currentSceneResult.value
    const { projectId, sections } = this.writeParams.value
    this.currentSceneResult.value = null
    this.progress.statusText = 'Approving scene and continuing...'
    await this.commitService.commitAndStoreScene(
      scene,
      fullProse,
      sectionIdx,
      sections,
      projectId,
      structured
    )
    this.phase.value = 'writing'
    await this.onWriteNextBatch?.(this.currentWriteIndex.value)
  }

  async rejectScene() {
    if (!this.currentSceneResult.value) return
    const { scene, fullProse } = this.currentSceneResult.value
    this.rejectedPatterns.value.push({
      index: this.currentWriteIndex.value,
      feedback: fullProse.slice(0, 500),
      title: scene.goal || scene.title
    })
    this.currentSceneResult.value = null
    this.progress.statusText = 'Rejecting scene, rewriting...'
    this.phase.value = 'writing'
    await this.onWriteNextBatch?.(this.currentWriteIndex.value - 1)
  }

  async rerequestScene(edits) {
    if (!this.currentSceneResult.value || !edits?.trim()) return
    const i = this.currentWriteIndex.value - 1
    this.scenePlan.value[i].reRequestInstruction = edits
    this.currentSceneResult.value = null
    this.progress.statusText = 'Rewriting scene with user revisions...'
    this.phase.value = 'writing'
    await this.onWriteNextBatch?.(i)
  }

  async regenerateScene(projectId, sceneIndex) {
    if (this.phase.value !== 'complete') return
    if (!this.writeParams.value) return

    this.progress.statusText = `Re-generating scene ${sceneIndex + 1}...`
    this.phase.value = 'writing'

    const storyDocuments = this.storyBibleStore
    const storyBibleDocs = (await storyDocuments.getStoryDocumentContext?.(projectId)) || ''

    const priorScenes = this.writtenScenes.value.filter((_, i) => i !== sceneIndex)
    const scene = this.scenePlan.value[sceneIndex]
    const embeddingContext = await buildRetrievalContext(scene, priorScenes)

    const rawLog = priorScenes.map(
      (ws, idx) => `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`
    )
    const chapterLog = rawLog.slice(-20).join('\n')
    const extraRejected =
      this.rejectedPatterns.value.length > 0 ? this.rejectedPatterns.value : undefined

    const existingEntitiesJson = buildExistingEntitiesBlob(
      this.storyBibleStore.characters,
      this.storyBibleStore.locations,
      this.storyBibleStore.plotThreads
    )

    scene.totalScenes = this.scenePlan.value.length

    const { storyArc, storyContract, onChunk } = this.writeParams.value

    let fullProse = ''
    const result = await this.writer.writeSceneStructured({
      sceneBrief: scene,
      storyArc,
      chapterLog,
      storyBible: storyBibleDocs,
      onChunk: (_chunk, proseChunk) => {
        fullProse += proseChunk || ''
        onChunk?.({
          sceneIndex: sceneIndex + 1,
          total: this.scenePlan.value.length,
          chunk: proseChunk,
          fullProse,
          scene
        })
      },
      embeddingContext,
      storyContract,
      rejectedPatterns: extraRejected,
      existingEntitiesJson
    })
    fullProse = result.prose

    this.writtenScenes.value[sceneIndex] = {
      title: scene.title || `Scene ${scene.sceneNumber}`,
      prose: fullProse,
      // Reuses the summary the writer already returned; only costs a separate
      // LLM call when the model omitted it.
      summary: await computeSummary(fullProse, result.structured),
      characters: scene.characters || scene.charactersPresent || [],
      location: scene.location || '',
      sceneNumber: scene.sceneNumber,
      subsectionId: scene.subsectionId
    }

    if (scene.subsectionId) {
      await this.manuscriptStore.updateSubsectionData(
        scene.subsectionId,
        {
          content: fullProse,
          wordCount: fullProse.split(/\s+/).length,
          contentStatus: 'generated'
        },
        projectId
      )
    }

    await this.onCompleteGeneration?.(projectId)
  }
}
