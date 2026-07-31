import { buildRetrievalContext } from '../context/sceneContext'
import { buildExistingEntitiesBlob } from '../context/sceneContext'
import { computeSummary } from '../utils'
import { proseToHtml, countProseWords } from '../writing/liveDraft'

export class SceneInteractionService {
  writeParams: any
  scenePlan: any
  phase: any
  progress: any
  writer: any
  sync: any
  actLog: any
  writtenScenes: any
  structuredResults: any
  hasPendingBatches: any
  pendingBatchStart: any
  manuscriptStore: any
  storyBibleStore: any
  commitService: any
  rejectedPatterns: any
  autoMode: any
  sceneReviewMode: any
  currentSceneResult: any
  currentWriteIndex: any
  lastSyncedResultIndex: any
  syncPreview: any
  currentTaskId: any
  volumeId: any
  consistencyService: any
  onWriteNextBatch: ((index: number) => Promise<void>) | null = null
  onCompleteGeneration: ((projectId: string) => Promise<void>) | null = null

  constructor(args: any) {
    this.writeParams = args.writeParams
    this.scenePlan = args.scenePlan
    this.phase = args.phase
    this.progress = args.progress
    this.writer = args.writer
    this.sync = args.sync
    this.actLog = args.actLog
    this.writtenScenes = args.writtenScenes
    this.structuredResults = args.structuredResults
    this.hasPendingBatches = args.hasPendingBatches
    this.pendingBatchStart = args.pendingBatchStart
    this.manuscriptStore = args.manuscriptStore
    this.storyBibleStore = args.storyBibleStore
    this.commitService = args.commitService
    this.rejectedPatterns = args.rejectedPatterns
    this.autoMode = args.autoMode
    this.sceneReviewMode = args.sceneReviewMode
    this.currentSceneResult = args.currentSceneResult
    this.currentWriteIndex = args.currentWriteIndex
    this.lastSyncedResultIndex = args.lastSyncedResultIndex
    this.syncPreview = args.syncPreview
    this.currentTaskId = args.currentTaskId
    this.volumeId = args.volumeId
    this.consistencyService = args.consistencyService
  }

  async confirmSync({ acceptedEntities, projectId, volumeId, chapterId }: { acceptedEntities: any; projectId: any; volumeId: any; chapterId: any }) {
    if (this.phase.value !== 'sync-preview') return
    this.progress.statusText = 'Integrating accepted entities and syncing story graph network...'

    const validStructured = this.structuredResults
      .filter((sr: any) => sr.structured)
      .map((sr: any) => sr.structured)
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

    // Leave sync-preview before finishing. The terminal sequence (repair →
    // continuity → commit) is only reachable from `writing`; staying here meant
    // a run that ended on a sync batch never reached `complete` at all.
    this.phase.value = 'writing'
    await this.onCompleteGeneration?.(projectId)
  }

  async approveScene() {
    if (!this.currentSceneResult.value || !this.writeParams.value) return
    const { scene, sceneIndex, fullProse, sectionIdx, structured } = this.currentSceneResult.value
    const { projectId, sections } = this.writeParams.value
    this.currentSceneResult.value = null
    this.progress.statusText = 'Approving scene and continuing...'
    await this.commitService.commitAndStoreScene(
      scene,
      fullProse,
      sectionIdx,
      sections,
      projectId,
      structured,
      // The reviewed scene's own position, so an approval writes into the slot
      // it was drafted for instead of appending past the scenes after it.
      typeof sceneIndex === 'number' ? sceneIndex : this.currentWriteIndex.value - 1
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

  async rerequestScene(edits: any) {
    if (!this.currentSceneResult.value || !edits?.trim()) return
    const i = this.currentWriteIndex.value - 1
    this.scenePlan.value[i].reRequestInstruction = edits
    this.currentSceneResult.value = null
    this.progress.statusText = 'Rewriting scene with user revisions...'
    this.phase.value = 'writing'
    await this.onWriteNextBatch?.(i)
  }

  async regenerateScene(projectId: any, sceneIndex: any) {
    if (this.phase.value !== 'complete') return
    if (!this.writeParams.value) return

    this.progress.statusText = `Re-generating scene ${sceneIndex + 1}...`
    this.phase.value = 'writing'

    const storyDocuments = this.storyBibleStore
    const storyBibleDocs = (await storyDocuments.getStoryDocumentContext?.(projectId)) || ''

    const priorScenes = this.writtenScenes.value.filter((_: any, i: any) => i !== sceneIndex)
    const scene = this.scenePlan.value[sceneIndex]
    const embeddingContext = await buildRetrievalContext(scene, priorScenes, undefined, undefined)

    const rawLog = priorScenes.map(
      (ws: any, idx: any) => `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`
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
      onChunk: (_chunk: any, proseChunk: any) => {
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
          content: proseToHtml(fullProse),
          wordCount: countProseWords(fullProse),
          contentStatus: 'generated'
        },
        projectId
      )
    }

    await this.onCompleteGeneration?.(projectId)
  }
}
