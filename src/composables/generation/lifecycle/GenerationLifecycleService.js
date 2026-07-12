export class GenerationLifecycleService {
  constructor({
    volumeStore,
    manuscriptStore,
    storyBibleStore,
    director,
    bootstrapper,
    writer,
    critic,
    actLog,
    progress,
    phase,
    scenePlan,
    chapterPlan,
    spineArray,
    spineContext,
    writtenScenes,
    consistencyReport,
    rejectedPatterns,
    syncPreview,
    hasPendingBatches,
    pendingBatchStart,
    lastSyncedResultIndex,
    writeParams,
    sceneReviewMode,
    autoMode,
    runConsecutiveFailures,
    runFailedScenes,
    currentSceneResult,
    currentWriteIndex,
    error,
    sceneEvalResults,
    inlineEvalEnabled,
    structuredResults,
    volumeId,
    currentTaskId,
    commitService,
    consistencyService
  }) {
    this.volumeStore = volumeStore
    this.manuscriptStore = manuscriptStore
    this.storyBibleStore = storyBibleStore
    this.director = director
    this.bootstrapper = bootstrapper
    this.writer = writer
    this.critic = critic
    this.actLog = actLog
    this.progress = progress
    this.phase = phase
    this.scenePlan = scenePlan
    this.chapterPlan = chapterPlan
    this.spineArray = spineArray
    this.spineContext = spineContext
    this.writtenScenes = writtenScenes
    this.consistencyReport = consistencyReport
    this.rejectedPatterns = rejectedPatterns
    this.syncPreview = syncPreview
    this.hasPendingBatches = hasPendingBatches
    this.pendingBatchStart = pendingBatchStart
    this.lastSyncedResultIndex = lastSyncedResultIndex
    this.writeParams = writeParams
    this.sceneReviewMode = sceneReviewMode
    this.autoMode = autoMode
    this.runConsecutiveFailures = runConsecutiveFailures
    this.runFailedScenes = runFailedScenes
    this.currentSceneResult = currentSceneResult
    this.currentWriteIndex = currentWriteIndex
    this.error = error
    this.sceneEvalResults = sceneEvalResults
    this.inlineEvalEnabled = inlineEvalEnabled
    this.structuredResults = structuredResults
    this.volumeId = volumeId
    this.currentTaskId = currentTaskId
    this.commitService = commitService
    this.consistencyService = consistencyService
  }

  onRunParallelGeneration = null
  onWriteNextBatch = null

  async startGeneration(opts = {}) {
    const { projectId, volumeId, forceRegenerate: _forceRegenerate, autoMode } = opts
    this.volumeId.value = volumeId || this.volumeId.value
    this.currentTaskId.value = this.actLog.startPhase(
      'volume-generation',
      `Starting volume generation: ${projectId}`
    )
    this.phase.value = 'preparing'
    this.error.value = null

    try {
      this.actLog.appendThought(this.currentTaskId.value, 'Step 1/4: Analyzing outline...')
      await this.volumeStore.loadVolume(projectId, volumeId)
      const volume = this.volumeStore.currentVolume
      const fullStructure = volume.structure
      const structureParts = volume.structureParts
      const novelSettings = volume.metadata?.novelSettings || {}
      const creativeBrief = volume.metadata?.creativeBrief || {}
      this.actLog.appendThought(
        this.currentTaskId.value,
        `Volume loaded: ${volume?.metadata?.title || 'Untitled'}`
      )

      this.actLog.appendThought(this.currentTaskId.value, 'Step 2/4: Directing scene chapters...')
      const directed = await this.director.direct(fullStructure, structureParts, {
        novelSettings,
        creativeBrief
      })
      this.scenePlan.value = directed.scenePlan
      this.chapterPlan.value = directed.chapterPlan
      this.spineArray.value = directed.spineArray
      this.spineContext.value = directed.spineContext
      this.actLog.appendThought(
        this.currentTaskId.value,
        `Directed ${directed.scenePlan?.length || 0} sections, ${directed.chapterPlan?.length || 0} chapters`
      )

      this.actLog.appendThought(
        this.currentTaskId.value,
        'Step 3/4: Bootstrapping creative context...'
      )
      const bootstrapped = await this.bootstrapper.bootstrap({
        volume,
        scenePlan: this.scenePlan.value,
        chapterPlan: this.chapterPlan.value,
        spineArray: this.spineArray.value,
        spineContext: this.spineContext.value,
        novelSettings,
        creativeBrief
      })
      this.storyBibleStore.bible = bootstrapped.bible
      this.storyBibleStore.lore = bootstrapped.lore
      this.storyBibleStore.notes = bootstrapped.notes
      this.actLog.appendThought(
        this.currentTaskId.value,
        `Bootstrapped: Bible (${Object.keys(bootstrapped.bible || {}).length}), Lore (${Object.keys(bootstrapped.lore || {}).length}), Notes (${Object.keys(bootstrapped.notes || {}).length})`
      )

      const totalScenes = this.scenePlan.value.reduce((sum, s) => sum + s.scenes.length, 0)
      this.writeParams.value = {
        projectId,
        volumeId,
        volumeNumber: this.volumeStore.currentVolume?.metadata?.volumeNumber || 1,
        novelSettings,
        creativeBrief,
        scenePlan: this.scenePlan,
        chapterPlan: this.chapterPlan,
        spineArray: this.spineArray,
        spineContext: this.spineContext,
        parallelBatch: opts.parallelBatch || 5,
        batchSize: opts.batchSize || 5,
        needsAnchor: opts.needsAnchor !== undefined ? opts.needsAnchor : true
      }

      this.actLog.appendThought(
        this.currentTaskId.value,
        `Step 4/4: Planning complete. ${totalScenes} scenes to generate.`
      )

      if (autoMode || this.autoMode.value) {
        this.phase.value = 'confirming'
        await this.confirmPlan(projectId)
      } else {
        this.phase.value = 'confirming'
      }

      return { success: true, totalScenes }
    } catch (err) {
      this.error.value = err.message || 'Generation failed'
      this.phase.value = 'error'
      this.actLog.appendThought(this.currentTaskId.value, `Generation error: ${err.message}`)
      throw err
    } finally {
      this.actLog.endPhase(this.currentTaskId.value)
    }
  }

  async resumeGeneration(projectId, opts = {}) {
    const { resumePhase, resumeFrom } = opts
    this.currentTaskId.value = this.actLog.startPhase(
      'volume-generation',
      `Resuming volume generation: ${projectId}`
    )
    this.phase.value = 'generating'

    try {
      if (resumePhase === 'generate') {
        const resumeIndex = resumeFrom || this.lastSyncedResultIndex.value || 0
        this.actLog.appendThought(
          this.currentTaskId.value,
          `Resuming generation from scene index ${resumeIndex}`
        )
        if (this.onWriteNextBatch) {
          await this.onWriteNextBatch(resumeIndex)
        }
      }

      if (resumePhase === 'review') {
        this.phase.value = 'review'
        this.sceneReviewMode.value = 'confirm'
      }

      return { success: true }
    } catch (err) {
      this.error.value = err.message || 'Resume failed'
      this.phase.value = 'error'
      this.actLog.appendThought(this.currentTaskId.value, `Resume error: ${err.message}`)
      throw err
    } finally {
      this.actLog.endPhase(this.currentTaskId.value)
    }
  }

  async confirmPlan(projectId, _opts = {}) {
    this.phase.value = 'confirming'
    this.actLog.appendThought(this.currentTaskId.value, 'Plan confirmed, starting generation...')
    if (this.onRunParallelGeneration) {
      await this.onRunParallelGeneration(this.writeParams.value)
    }
  }

  async completeGeneration(_projectId) {
    this.phase.value = 'completing'
    this.actLog.appendThought(
      this.currentTaskId.value,
      'Generation phase complete. Running consistency checks...'
    )

    try {
      const synced = this.writtenScenes.value.filter((s) => s && s.content && s.content.trim())
      if (synced.length === 0) {
        this.actLog.appendThought(
          this.currentTaskId.value,
          'No scenes were generated — skipping consistency checks'
        )
        this.phase.value = 'generated'
        return { success: true, sceneCount: 0 }
      }

      const { scenePlan, chapterPlan, spineArray, spineContext } = this.writeParams.value
      const consistencyReport = await this.consistencyService.checkChapterConsistency(synced, {
        chapterPlan,
        scenePlan,
        spineArray,
        spineContext
      })
      this.consistencyReport.value = consistencyReport

      this.manuscriptStore.mergeScenes(synced)
      await this.commitService.commitInterim(synced)

      let totalWordCount = 0
      const sceneSummary = synced.map((s) => {
        totalWordCount += s.wordCount || 0
        return `${s.title} (${s.wordCount || '?'} words, score: ${this.sceneEvalResults.value.find((e) => e.index === s.index)?.score || 'N/A'})`
      })

      this.actLog.appendThought(
        this.currentTaskId.value,
        `Generation complete! ${synced.length} scenes, ~${totalWordCount} words.`
      )
      this.phase.value = 'generated'
      this.progress.value = { current: synced.length, total: synced.length, stage: 'complete' }

      return {
        success: true,
        sceneCount: synced.length,
        totalWords: totalWordCount,
        scenes: sceneSummary,
        report: { consistencyReport }
      }
    } catch (err) {
      this.error.value = err.message || 'Completion failed'
      this.phase.value = 'error'
      this.actLog.appendThought(this.currentTaskId.value, `Completion error: ${err.message}`)
      return { success: false, error: err.message }
    }
  }

  async repairFailedScenes(projectId, opts = {}) {
    const scenePlan = this.scenePlan.value || opts.scenePlan
    const failed = this.rejectedPatterns.value || []
    const failedIndexes = opts.failedIndexes || failed.map((f) => f.index) || []
    if (failedIndexes.length === 0) {
      this.actLog.appendThought(this.currentTaskId.value, 'No failed scenes to repair')
      return { success: true, repaired: 0 }
    }

    const novelSettings = this.writeParams.value.novelSettings

    let repaired = 0
    for (const idx of failedIndexes) {
      const planEntry = scenePlan.reduce((acc, section) => {
        for (const ch of section.chapters) {
          for (const s of ch.scenes) {
            if (s.index === idx) acc.push({ scene: s, chapter: ch, section })
          }
        }
        return acc
      }, [])
      const match = planEntry[0]
      if (!match) continue

      const scene = match.scene
      const feedback = failed.find((f) => f.index === idx)
      this.actLog.appendThought(
        this.currentTaskId.value,
        `Repairing scene #${idx}: "${scene.title}"`
      )

      const systemPrompt = `You are an elite novelist. Rewrite the following scene to address issues: ${feedback?.feedback || 'Improve quality and depth.'}
Maintain the style of ${novelSettings.settingDescription || novelSettings.setting}.`

      let result,
        attempts = 0
      do {
        result = await this.writer.generate(
          systemPrompt,
          `Rewrite scene "${scene.title}". Scene overview: ${scene.content}.
Required entities: ${(scene.entities || []).join(', ')}
IMPORTANT: Return JSON with keys: title, content (1500-2500 words), overview, wordCount, entities, summary`,
          { temperature: 0.8, maxTokens: 4000, responseFormat: { type: 'json_object' } }
        )
        attempts++
      } while ((!result || !result.content || result.content.trim().length < 200) && attempts < 3)

      if (result && result.content && result.content.trim().length >= 200) {
        const existing = this.structuredResults.find((r) => r && r.index === idx)
        if (existing) {
          existing.content = result.content
          existing.title = result.title || existing.title
          existing.wordCount =
            result.wordCount || Math.round(result.content.split(/\s+/).filter(Boolean).length)
        }
        repaired++
        this.actLog.appendThought(this.currentTaskId.value, `Repaired scene #${idx}`)
      }
    }

    this.writtenScenes.value = this.structuredResults
      .filter((r) => r && r.content && r.content.trim())
      .sort((a, b) => a.index - b.index)
    this.actLog.appendThought(
      this.currentTaskId.value,
      `Repair complete. ${repaired}/${failedIndexes.length} scenes repaired.`
    )
    return { success: true, repaired }
  }

  async reset() {
    this.phase.value = 'idle'
    Object.assign(this.progress, { current: 0, total: 0, stage: '' })
    this.scenePlan.value = []
    this.chapterPlan.value = []
    this.spineArray.value = []
    this.spineContext.value = []
    this.writtenScenes.value = []
    this.consistencyReport.value = null
    this.rejectedPatterns.value = []
    this.syncPreview.value = []
    this.hasPendingBatches.value = false
    this.pendingBatchStart.value = 0
    this.lastSyncedResultIndex.value = 0
    this.sceneReviewMode.value = null
    this.autoMode.value = true
    this.runConsecutiveFailures.value = 0
    this.runFailedScenes.value = []
    this.currentSceneResult.value = null
    this.currentWriteIndex.value = 0
    this.error.value = null
    this.sceneEvalResults.value = []
    this.structuredResults.splice(0)
    this.currentTaskId.value = null
    this.volumeId.value = null
  }
}
