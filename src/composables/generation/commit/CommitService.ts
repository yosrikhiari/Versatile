import { computeSummary } from '../utils'
import { proseToHtml, countProseWords } from '../writing/liveDraft'

export class CommitService {
  writeParams: any
  volumeId: any
  scenePlan: any
  chapterPlan: any
  spineArray: any
  spineContext: any
  autoMode: any
  writtenScenes: any
  lastSyncedResultIndex: any
  progress: any
  manuscriptStore: any
  getGenRun: any
  saveGenRun: any
  makeInitialGenState: any

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
  }: {
    writeParams: any
    volumeId: any
    scenePlan: any
    chapterPlan: any
    spineArray: any
    spineContext: any
    autoMode: any
    writtenScenes: any
    lastSyncedResultIndex: any
    progress: any
    manuscriptStore: any
    getGenRun: any
    saveGenRun: any
    makeInitialGenState: any
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
      // Positional array — length is the plan size, not the number written.
      writtenCount: this.writtenScenes.value.filter((s: any) => s).length,
      writtenMeta: this.writtenScenes.value
        .filter((s: any) => s)
        .map((s: any) => ({
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

  async persistCheckpoint(projectId: any) {
    // Previously gated on autoMode, which meant the one-click path — the only
    // one long enough to need resuming — was also the only one that never wrote
    // a checkpoint from the parallel writer. A run that stops for any reason is
    // worth being able to pick back up regardless of how it was started.
    if (!projectId) return
    try {
      const run = await this.getGenRun(projectId)
      const base = run?.state?.version === 2 ? run.state : this.makeInitialGenState()
      const merged = { ...base, ...this.buildCheckpointState(), version: 2 }
      merged.stages = {
        ...base.stages,
        prose: {
          ...(base.stages?.prose || {}),
          status: 'running',
          written: this.writtenScenes.value.filter((s: any) => s).length,
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
   * @param {number} [sceneIndex] Position of this scene in the plan. `writtenScenes`
   *   is positional everywhere else (the parallel path allocates it as a fixed-length
   *   array and assigns by index); appending here instead produced two array shapes
   *   for the same ref, so every index-based consumer — evaluation, repair, retrieval
   *   context — could pair prose with the wrong plan entry. Falls back to appending
   *   when the caller has no index.
   */
  async commitAndStoreScene(
    scene: any,
    fullProse: any,
    sectionIdx: any,
    sections: any,
    projectId: any,
    structured: any,
    sceneIndex?: number
  ) {
    this.progress.statusText =
      'Compiling prose and generating plot-accurate continuity summaries...'
    const summary = await computeSummary(fullProse, structured)
    const wordCount = countProseWords(fullProse)

    if (scene.subsectionId) {
      await this.manuscriptStore.updateSubsectionData(
        scene.subsectionId,
        {
          // The editor round-trips this field through Tiptap, so it has to be
          // HTML. Storing raw model text collapsed every paragraph break.
          content: proseToHtml(fullProse),
          wordCount,
          contentStatus: 'generated'
        },
        projectId
      )
    }

    const entry = {
      title: scene.title || `Scene ${scene.sceneNumber}`,
      prose: fullProse,
      summary,
      characters: scene.characters || scene.charactersPresent || [],
      location: scene.location || '',
      sceneNumber: scene.sceneNumber,
      subsectionId: scene.subsectionId
    }

    if (typeof sceneIndex === 'number' && sceneIndex >= 0) {
      this.writtenScenes.value[sceneIndex] = entry
    } else {
      this.writtenScenes.value.push(entry)
    }

    // Section total is recomputed from committed scenes (this one included), so
    // it stays correct on re-commit instead of double-counting a rewrite.
    const section = sections[sectionIdx]
    if (section) {
      const idSet = new Set(section.subsectionIds || [])
      const totalWords = this.writtenScenes.value
        .filter((s: any) => s && idSet.has(s.subsectionId))
        .reduce((sum: number, s: any) => sum + countProseWords(s.prose), 0)
      await this.manuscriptStore.updateSectionData(section.id, { wordCount: totalWords }, projectId)
    }
  }
}
