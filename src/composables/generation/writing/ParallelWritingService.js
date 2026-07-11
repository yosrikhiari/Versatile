import { formatEvalFeedback } from '../../../services/evalFeedback'
import { buildExistingEntitiesBlob } from '../context/sceneContext'
import { computeSummary, parallelWithLimit } from '../utils'

let PARALLEL_CHAPTER_LIMIT = () => 5

export function setParallelChapterLimit(fn) {
  PARALLEL_CHAPTER_LIMIT = fn
}

export class ParallelWritingService {
  constructor({
    writeParams,
    scenePlan,
    chapterPlan,
    spineArray,
    spineContext,
    storyBibleStore,
    manuscriptStore,
    writer,
    critic,
    actLog,
    progress,
    phase,
    sceneEvalResults,
    inlineEvalEnabled,
    writtenScenes,
    rejectedPatterns,
    currentTaskId,
    volumeId
  }) {
    this.writeParams = writeParams
    this.scenePlan = scenePlan
    this.chapterPlan = chapterPlan
    this.spineArray = spineArray
    this.spineContext = spineContext
    this.storyBibleStore = storyBibleStore
    this.manuscriptStore = manuscriptStore
    this.writer = writer
    this.critic = critic
    this.actLog = actLog
    this.progress = progress
    this.phase = phase
    this.sceneEvalResults = sceneEvalResults
    this.inlineEvalEnabled = inlineEvalEnabled
    this.writtenScenes = writtenScenes
    this.rejectedPatterns = rejectedPatterns
    this.currentTaskId = currentTaskId
    this.volumeId = volumeId
  }

  onCompleteGeneration = null

  async runParallelGeneration(writeParamsVal) {
    if (!writeParamsVal) return
    const { storyArc, storyBibleDocs, storyContract, projectId, onChunk } = writeParamsVal

    const existingEntitiesJson = buildExistingEntitiesBlob(
      this.storyBibleStore.characters,
      this.storyBibleStore.locations,
      this.storyBibleStore.plotThreads
    )

    this.writtenScenes.value = new Array(this.scenePlan.value.length).fill(null)
    const chaptersWithScenes = []
    let offset = 0
    for (const c of this.chapterPlan.value) {
      const group = this.scenePlan.value.slice(offset, offset + c.scenes.length)
      chaptersWithScenes.push({ chapterMeta: c, scenes: group, startIndex: offset })
      offset += c.scenes.length
    }

    this.progress.statusText = 'Phase 1: Generating chapter anchors in parallel...'
    this.phase.value = 'writing'

    const generateAnchor = async (scene, role, constraints, sceneIndex, chapterIndex) => {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = this.actLog.addPhase(this.currentTaskId, phaseName)
      try {
        let fullProse = ''
        const result = await this.writer.writeSceneStructured({
          sceneBrief: scene,
          storyArc,
          chapterLog: '',
          storyBible: storyBibleDocs,
          spineContext: this.spineContext.value,
          anchorRole: role,
          anchorConstraints: constraints,
          storyContract,
          existingEntitiesJson,
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
          onRawChunk: (chunk) => this.actLog.appendThought(this.currentTaskId, scenePhase, chunk)
        })
        fullProse = result.prose

        this.progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse)
        const wordCount = fullProse.split(/\s+/).length

        if (scene.subsectionId) {
          await this.manuscriptStore.updateSubsectionData(
            scene.subsectionId,
            { content: fullProse, wordCount, contentStatus: 'generated' },
            projectId
          )
        }

        const chapterNumber = chaptersWithScenes[chapterIndex].chapterMeta.chapterNumber
        this.writtenScenes.value[sceneIndex] = {
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
        this.actLog.updatePhase(this.currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: result.structured }
      } catch (err) {
        this.actLog.updatePhase(this.currentTaskId, scenePhase, { status: 'failed' })
        return { success: false, sceneIndex, error: err.message }
      }
    }

    const anchorTasks = chaptersWithScenes.map((chGroup, chapterIndex) => {
      return async () => {
        const { chapterMeta, scenes, startIndex } = chGroup
        const prevSpine = chapterIndex > 0 ? this.spineArray.value[chapterIndex - 1] : null
        const prevEmotion = prevSpine?.emotionalStateAtEnd || 'story beginning'

        const openingConstraints = `Previous chapter ended with: ${prevEmotion}\nThis scene must begin where the previous chapter left off emotionally.`
        const closingConstraints = `This scene MUST end on this exact hook:\n"${chapterMeta.hookEnding}"\nDo not soften it. Do not add resolution. End there.`

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
    if (this.inlineEvalEnabled.value) {
      this.progress.statusText = 'Evaluating chapter anchors...'
      const anchorResults = []
      for (let idx = 0; idx < this.writtenScenes.value.length; idx++) {
        const s = this.writtenScenes.value[idx]
        if (!s) continue
        const sceneBrief = this.scenePlan.value.find((sp) => sp.sceneNumber === s.sceneNumber) || {}
        const criticResult = await this.critic.evaluateScene({
          draft: s.prose,
          sceneBrief,
          storyBible: storyBibleDocs,
          chapterLog: ''
        })
        anchorResults.push({
          sceneIndex: idx + 1,
          passed: criticResult.pass,
          score: criticResult.score,
          topIssues: (criticResult.issues || []).slice(0, 3).map((i) => i.text || i)
        })
      }
      this.sceneEvalResults.value = anchorResults
      anchorEvalFeedback = formatEvalFeedback(anchorResults)
    }

    this.progress.statusText = 'Phase 2: Generating chapter middle scenes...'

    const generateMiddleScene = async (scene, sceneIndex, chapterMeta) => {
      const phaseName = `Writing: "${scene.title || `Scene ${scene.sceneNumber}`}"`
      const scenePhase = this.actLog.addPhase(this.currentTaskId, phaseName)
      try {
        const logEntries = this.writtenScenes.value
          .filter((s) => s && s.chapterId === chapterMeta.chapterNumber && s.summary)
          .map((s) => `Scene ${s.sceneNumber} ("${s.title}"): ${s.summary}`)
        const chapterLog = logEntries.join('\n')

        let fullProse = ''
        const result = await this.writer.writeSceneStructured({
          sceneBrief: scene,
          storyArc,
          chapterLog,
          storyBible: storyBibleDocs,
          spineContext: this.spineContext.value,
          storyContract,
          existingEntitiesJson,
          pastEvalResults: anchorEvalFeedback || undefined,
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
          onRawChunk: (chunk) => this.actLog.appendThought(this.currentTaskId, scenePhase, chunk)
        })
        fullProse = result.prose

        this.progress.statusText = `Compiling prose for scene ${scene.sceneNumber}...`
        const summary = await computeSummary(fullProse)
        const wordCount = fullProse.split(/\s+/).length

        if (scene.subsectionId) {
          await this.manuscriptStore.updateSubsectionData(
            scene.subsectionId,
            { content: fullProse, wordCount, contentStatus: 'generated' },
            projectId
          )
        }

        this.writtenScenes.value[sceneIndex] = {
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

        this.actLog.updatePhase(this.currentTaskId, scenePhase, { status: 'done' })
        return { success: true, sceneIndex, structured: result.structured }
      } catch (err) {
        this.actLog.updatePhase(this.currentTaskId, scenePhase, { status: 'failed' })
        return { success: false, sceneIndex, error: err.message }
      }
    }

    const middleTasks = []
    for (let chapterIndex = 0; chapterIndex < chaptersWithScenes.length; chapterIndex++) {
      const { chapterMeta, scenes, startIndex } = chaptersWithScenes[chapterIndex]
      for (let j = 0; j < scenes.length; j++) {
        const sceneIndex = startIndex + j
        if (this.writtenScenes.value[sceneIndex] !== null) continue
        const scene = scenes[j]
        middleTasks.push(() => generateMiddleScene(scene, sceneIndex, chapterMeta))
      }
    }

    let middleOutcomes = []
    if (middleTasks.length > 0) {
      middleOutcomes = await parallelWithLimit(middleTasks, limit)
    }

    if (this.inlineEvalEnabled.value) {
      this.progress.statusText = 'Evaluating middle scenes...'
      const middleResults = []
      for (let idx = 0; idx < this.writtenScenes.value.length; idx++) {
        const s = this.writtenScenes.value[idx]
        if (!s || this.sceneEvalResults.value.some((r) => r.sceneIndex === idx + 1)) continue
        const sceneBrief = this.scenePlan.value.find((sp) => sp.sceneNumber === s.sceneNumber) || {}
        const criticResult = await this.critic.evaluateScene({
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
      this.sceneEvalResults.value = [...this.sceneEvalResults.value, ...middleResults]
    }

    await this.onCompleteGeneration?.(projectId)
  }
}
