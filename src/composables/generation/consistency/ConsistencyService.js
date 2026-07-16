import { useStoryDocuments } from '../../useStoryDocuments'
import { computeSummary } from '../utils'
import {
  buildRetrievalContext,
  buildExistingEntitiesBlob,
  buildFactLedger,
  planConsistencyFixes,
  CONSISTENCY_FIX_ROUNDS,
  CONSISTENCY_FIX_MAX_SCENES
} from '../context/sceneContext'

export class ConsistencyService {
  constructor({
    writeParams,
    scenePlan,
    chapterPlan,
    spineArray,
    autoMode,
    writtenScenes,
    consistencyReport,
    phase,
    progress,
    storyBibleStore,
    critic,
    writer,
    manuscriptStore,
    updateGenRunStage,
    actLog
  }) {
    this.writeParams = writeParams
    this.scenePlan = scenePlan
    this.chapterPlan = chapterPlan
    this.spineArray = spineArray
    this.autoMode = autoMode
    this.writtenScenes = writtenScenes
    this.consistencyReport = consistencyReport
    this.phase = phase
    this.progress = progress
    this.storyBibleStore = storyBibleStore
    this.critic = critic
    this.writer = writer
    this.manuscriptStore = manuscriptStore
    this.updateGenRunStage = updateGenRunStage
    this.actLog = actLog
  }

  async rewriteSceneForConsistency(projectId, sceneIndex, instruction, storyBibleDocs) {
    const scene = this.scenePlan.value[sceneIndex]
    if (!scene || !this.writeParams.value) return
    const { storyArc, storyContract } = this.writeParams.value
    const priorScenes = this.writtenScenes.value.filter((_, i) => i !== sceneIndex)
    const embeddingContext = await buildRetrievalContext(scene, priorScenes)
    const chapterLog = priorScenes
      .map((ws, idx) => `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`)
      .slice(-20)
      .join('\n')
    const existingEntitiesJson = buildExistingEntitiesBlob(
      this.storyBibleStore.characters,
      this.storyBibleStore.locations,
      this.storyBibleStore.plotThreads
    )
    scene.totalScenes = this.scenePlan.value.length

    const fixContract = `${storyContract}\n\nCONTINUITY FIX (mandatory): rewrite this scene to resolve the following contradictions while keeping the scene's events, outcome and length the same:\n${instruction}`

    const result = await this.writer.writeSceneStructured({
      sceneBrief: scene,
      storyArc,
      chapterLog,
      storyBible: storyBibleDocs,
      embeddingContext,
      storyContract: fixContract,
      existingEntitiesJson
    })
    const fullProse = result.prose
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
  }

  async maybeRunIncrementalConsistency(writtenUpToIndex) {
    const chapters = this.chapterPlan.value
    if (!Array.isArray(chapters) || chapters.length < 1) return
    let boundary = 0
    let atChapterEnd = false
    for (const ch of chapters) {
      boundary += (ch.scenes && ch.scenes.length) || 0
      if (boundary === writtenUpToIndex) {
        atChapterEnd = true
        break
      }
    }
    if (!atChapterEnd || writtenUpToIndex >= this.scenePlan.value.length) return

    const characters = this.storyBibleStore.characters
    const locations = this.storyBibleStore.locations
    if (characters.length <= 1 && locations.length <= 1) return

    const written = this.writtenScenes.value.filter(Boolean)
    if (written.length < 2) return

    try {
      const report = await this.critic.checkContradictions({
        characters,
        locations,
        sceneProse: written,
        synopsis: '',
        ledger: buildFactLedger(this.spineArray.value, this.writtenScenes.value)
      })
      const issueCount =
        (report.characterIssues?.length || 0) + (report.locationIssues?.length || 0)
      if (issueCount > 0) {
        this.consistencyReport.value = report
      }
    } catch (err) {
      console.warn('[ConsistencyService] incremental consistency check failed:', err)
    }
  }

  async runTerminalConsistencyAudit(projectId, currentTaskId) {
    const consistencyPhase = this.actLog.addPhase(currentTaskId, 'Consistency Check')
    this.phase.value = 'consistency-check'
    await this.updateGenRunStage(projectId, 'consistency', { status: 'running' })
    this.progress.statusText =
      'Auditing written prose against character bio sheets to find narrative contradictions...'
    const characters = this.storyBibleStore.characters
    const locations = this.storyBibleStore.locations
    const canCheck = characters.length > 1 || locations.length > 1

    if (canCheck) {
      const report = await this.critic.checkContradictions({
        characters,
        locations,
        sceneProse: this.writtenScenes.value,
        synopsis: '',
        ledger: buildFactLedger(this.spineArray.value, this.writtenScenes.value)
      })
      this.consistencyReport.value = report
    }

    if (this.autoMode.value && canCheck && this.consistencyReport.value) {
      const storyDocuments = useStoryDocuments()
      const storyBibleDocs =
        this.writeParams.value?.storyBibleDocs ||
        (await storyDocuments.getStoryDocumentContext(projectId))
      for (let round = 0; round < CONSISTENCY_FIX_ROUNDS; round++) {
        const fixMap = planConsistencyFixes(this.consistencyReport.value, this.writtenScenes.value)
        if (fixMap.size === 0) break
        const targets = [...fixMap.entries()]
          .sort((a, b) => b[0] - a[0])
          .slice(0, CONSISTENCY_FIX_MAX_SCENES)
        this.progress.statusText = `Resolving ${targets.length} continuity issue(s) (pass ${round + 1})...`
        for (const [sceneIndex, reasons] of targets) {
          try {
            await this.rewriteSceneForConsistency(
              projectId,
              sceneIndex,
              [...reasons].map((r) => `- ${r}`).join('\n'),
              storyBibleDocs
            )
          } catch (err) {
            console.warn('[ConsistencyService] Consistency fix failed for scene', sceneIndex, err)
          }
        }
        const recheck = await this.critic.checkContradictions({
          characters,
          locations,
          sceneProse: this.writtenScenes.value,
          synopsis: '',
          ledger: buildFactLedger(this.spineArray.value, this.writtenScenes.value)
        })
        this.consistencyReport.value = recheck
        if ((recheck.characterIssues?.length || 0) + (recheck.locationIssues?.length || 0) === 0)
          break
      }
    }

    this.actLog.updatePhase(currentTaskId, consistencyPhase, { status: 'done' })
    await this.updateGenRunStage(projectId, 'consistency', { status: 'done' })
  }
}
