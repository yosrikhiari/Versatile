import { computeSummary } from '../utils'

export class CommitService {
  constructor({
    writeParams,
    volumeId,
    scenePlan,
    chapterPlan,
    spineArray,
    spineContext,
    autoMode,
    writtenScenes,
    lastSyncedResultIndex,
    progress,
    manuscriptStore,
    getGenRun,
    saveGenRun,
    makeInitialGenState
  }) {
    this.writeParams = writeParams
    this.volumeId = volumeId
    this.scenePlan = scenePlan
    this.chapterPlan = chapterPlan
    this.spineArray = spineArray
    this.spineContext = spineContext
    this.autoMode = autoMode
    this.writtenScenes = writtenScenes
    this.lastSyncedResultIndex = lastSyncedResultIndex
    this.progress = progress
    this.manuscriptStore = manuscriptStore
    this.getGenRun = getGenRun
    this.saveGenRun = saveGenRun
    this.makeInitialGenState = makeInitialGenState
  }

  buildCheckpointState() {
    const wp = this.writeParams.value || {}
    return {
      phase: 'writing',
      volumeId: this.volumeId.value,
      scenePlan: this.scenePlan.value,
      chapterPlan: this.chapterPlan.value,
      spineArray: this.spineArray.value,
      spineContext: this.spineContext.value,
      storyArc: wp.storyArc || null,
      storyContract: wp.storyContract || '',
      synopsis: wp.synopsis || '',
      autoMode: this.autoMode.value,
      writtenCount: this.writtenScenes.value.length,
      writtenMeta: this.writtenScenes.value
        .filter((s) => s)
        .map((s) => ({
          sceneNumber: s.sceneNumber,
          title: s.title,
          summary: s.summary,
          characters: s.characters,
          location: s.location,
          subsectionId: s.subsectionId
        })),
      lastSyncedResultIndex: this.lastSyncedResultIndex.value,
      progressTotal: this.progress.total
    }
  }

  async persistCheckpoint(projectId) {
    if (!this.autoMode.value || !projectId) return
    try {
      const run = await this.getGenRun(projectId)
      const base = run?.state?.version === 2 ? run.state : this.makeInitialGenState()
      const merged = { ...base, ...this.buildCheckpointState(), version: 2 }
      merged.stages = {
        ...base.stages,
        prose: {
          ...(base.stages?.prose || {}),
          status: 'running',
          written: this.writtenScenes.value.length,
          total: this.scenePlan.value.length
        }
      }
      merged.currentStage = 'prose'
      this.saveGenRun(projectId, merged).catch(() => {})
    } catch {
      // never let checkpointing break the run
    }
  }

  /**
   * @param {object} [structured] The writer's parsed JSON. When it carries a
   *   `summary`, that is used directly instead of spending a whole extra LLM
   *   round-trip asking the model to summarize prose it just wrote. Optional, so
   *   callers without it keep the old behaviour.
   */
  async commitAndStoreScene(scene, fullProse, sectionIdx, sections, projectId, structured) {
    this.progress.statusText =
      'Compiling prose and generating plot-accurate continuity summaries...'
    const summary = await computeSummary(fullProse, structured)
    const wordCount = fullProse.split(/\s+/).length

    if (scene.subsectionId) {
      await this.manuscriptStore.updateSubsectionData(
        scene.subsectionId,
        {
          content: fullProse,
          wordCount,
          contentStatus: 'generated'
        },
        projectId
      )
    }

    const section = sections[sectionIdx]
    if (section) {
      const idSet = new Set(section.subsectionIds || [])
      const totalWords =
        this.writtenScenes.value
          .filter((s) => s && idSet.has(s.subsectionId))
          .reduce((sum, s) => sum + (s.prose ? s.prose.split(/\s+/).length : 0), 0) + wordCount
      await this.manuscriptStore.updateSectionData(section.id, { wordCount: totalWords }, projectId)
    }

    this.writtenScenes.value.push({
      title: scene.title || `Scene ${scene.sceneNumber}`,
      prose: fullProse,
      summary,
      characters: scene.characters || scene.charactersPresent || [],
      location: scene.location || '',
      sceneNumber: scene.sceneNumber,
      subsectionId: scene.subsectionId
    })
  }
}
