import { useStoryDocuments } from '../../useStoryDocuments'
import { computeSummary } from '../utils'
import { proseToHtml, countProseWords } from '../writing/liveDraft'
import {
  buildRetrievalContext,
  buildExistingEntitiesBlob,
  buildFactLedger,
  planConsistencyFixes,
  CONSISTENCY_FIX_ROUNDS,
  CONSISTENCY_FIX_MAX_SCENES
} from '../context/sceneContext'
import { buildRagOptions } from '../../../services/researchScope'

export class ConsistencyService {
  writeParams: any
  scenePlan: any
  chapterPlan: any
  spineArray: any
  autoMode: any
  writtenScenes: any
  consistencyReport: any
  phase: any
  progress: any
  storyBibleStore: any
  critic: any
  writer: any
  manuscriptStore: any
  updateGenRunStage: any
  actLog: any

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
  }: {
    writeParams: any
    scenePlan: any
    chapterPlan: any
    spineArray: any
    autoMode: any
    writtenScenes: any
    consistencyReport: any
    phase: any
    progress: any
    storyBibleStore: any
    critic: any
    writer: any
    manuscriptStore: any
    updateGenRunStage: any
    actLog: any
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

  async rewriteSceneForConsistency(projectId: any, sceneIndex: any, instruction: any, storyBibleDocs: any) {
    const scene = this.scenePlan.value[sceneIndex]
    if (!scene || !this.writeParams.value) return
    const { storyArc, storyContract } = this.writeParams.value
    const priorScenes = this.writtenScenes.value.filter((_: any, i: any) => i !== sceneIndex)
    // Same research the run was written from — a continuity fix that loses the
    // source material can "fix" a fact back into being wrong.
    const embeddingContext = await buildRetrievalContext(
      scene,
      priorScenes,
      5,
      buildRagOptions(projectId, this.writeParams.value?.research)
    )
    const chapterLog = priorScenes
      .map((ws: any, idx: any) => `Scene ${idx + 1} ("${ws.title}"): ${ws.summary || '(written)'}`)
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
          content: proseToHtml(fullProse),
          wordCount: countProseWords(fullProse),
          contentStatus: 'generated'
        },
        projectId
      )
    }
  }

  async maybeRunIncrementalConsistency(writtenUpToIndex: any) {
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

  /**
   * Terminal continuity audit + (in auto mode) bounded fix rounds.
   *
   * Does NOT set `phase` itself. It used to assign `phase.value = 'consistency-check'`
   * directly, which moved the delegator into a phase the caller's next event had
   * no route out of — every clean run ended by throwing a routing error that
   * surfaced as "Conjuration Failed". The delegator owns phase transitions; this
   * reports what it found and lets the caller route on it.
   *
   * @returns {{ issueCount: number, checked: boolean }}
   */
  async runTerminalConsistencyAudit(projectId: any, currentTaskId: any) {
    const consistencyPhase = this.actLog.addPhase(currentTaskId, 'Consistency Check')
    await this.updateGenRunStage(projectId, 'consistency', { status: 'running' })
    this.progress.statusText =
      'Auditing written prose against character bio sheets to find narrative contradictions...'
    const characters = this.storyBibleStore.characters
    const locations = this.storyBibleStore.locations
    // A scene that failed generation leaves a null hole in the positional array;
    // the critic must never be handed one.
    const written = this.writtenScenes.value.filter(Boolean)
    const canCheck = (characters.length > 1 || locations.length > 1) && written.length > 0

    if (canCheck) {
      const report = await this.critic.checkContradictions({
        characters,
        locations,
        sceneProse: written,
        synopsis: '',
        ledger: buildFactLedger(this.spineArray.value, written)
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
        const rechecked = this.writtenScenes.value.filter(Boolean)
        const recheck = await this.critic.checkContradictions({
          characters,
          locations,
          sceneProse: rechecked,
          synopsis: '',
          ledger: buildFactLedger(this.spineArray.value, rechecked)
        })
        this.consistencyReport.value = recheck
        if ((recheck.characterIssues?.length || 0) + (recheck.locationIssues?.length || 0) === 0)
          break
      }
    }

    this.actLog.updatePhase(currentTaskId, consistencyPhase, { status: 'done' })
    await this.updateGenRunStage(projectId, 'consistency', { status: 'done' })

    const report = this.consistencyReport.value
    const issueCount =
      (report?.characterIssues?.length || 0) + (report?.locationIssues?.length || 0)
    return { issueCount, checked: canCheck }
  }
}
