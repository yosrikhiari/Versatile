import { ref, computed } from 'vue'

/**
 * Everything a run's UI needs that is not the generator itself: the per-scene
 * live streams, the plan the writer edited in preview, the arc/contract the
 * planner returned, and the handlers that call back into the generator.
 *
 * `StoryGeneratorPanel` used to carry two hand-written copies of all of this —
 * one for the arc pipeline, one for the chapter pipeline — because sharing
 * *state* between them let a chapter run and an arc run trample each other's
 * streams. A factory gives each pipeline its own instance without duplicating
 * the code. Nothing here reaches across instances.
 */

/** Phases in which nothing is in flight. Everything else shows the stage list. */
export const GENERATION_RESTING_PHASES = ['idle', 'complete', 'error']

export interface RunControllerDeps {
  projectStore: any
  manuscriptStore: any
  storyDocuments: any
  sceneEval: any
  exportAsText: (args: { title: string; scenes: any[] }) => Promise<unknown>
  exportAsMarkdown: (args: { title: string; scenes: any[] }) => Promise<unknown>
  /** Title used for TXT/Markdown exports ("Generated Story", "Generated Chapter"). */
  exportTitle: string
  /** Which written scene the complete panel is focused on (shared chrome). */
  selectedSceneIndex: { value: number | null }
  /** Where "Saved N scene(s)" is shown (shared chrome). */
  saveStatus: { value: any }
  /** Called after a save/regenerate that may have changed the drift picture. */
  onAfterEvaluate?: () => void | Promise<void>
}

export function useGenerationRunController(generator: any, deps: RunControllerDeps) {
  const {
    projectStore,
    manuscriptStore,
    storyDocuments,
    sceneEval,
    exportAsText,
    exportAsMarkdown,
    exportTitle,
    selectedSceneIndex,
    saveStatus
  } = deps

  // ── Live streams ──────────────────────────────────────────────────────────
  // Kept per scene rather than in one shared string: parallel generation has
  // several scenes in flight, and a single buffer read as one scene glitching.
  const streams = ref<Record<number, string>>({})
  const streamSceneIndex = ref(0)
  const streamingText = computed(() => streams.value[streamSceneIndex.value] || '')
  const activeStreamCount = computed(
    () => Object.values(streams.value).filter((t) => t && t.length > 0).length
  )
  const currentScene = ref(0)
  const totalScenes = ref(0)

  /** The preview follows the lowest in-flight scene so it reads in story order. */
  function handleChunk({ sceneIndex, total, fullProse }: any) {
    if (total) totalScenes.value = total
    streams.value = { ...streams.value, [sceneIndex]: fullProse }
    const inFlight = Object.keys(streams.value).map(Number)
    streamSceneIndex.value = inFlight.length ? Math.min(...inFlight) : sceneIndex
    currentScene.value = Math.max(currentScene.value, sceneIndex)
  }

  function resetStreams() {
    streams.value = {}
    streamSceneIndex.value = 0
    currentScene.value = 0
    totalScenes.value = 0
  }

  // ── Run-scoped state ──────────────────────────────────────────────────────
  const storyArc = ref<any>(null)
  const storyContract = ref('')
  const planEdits = ref<any[]>([])
  const liveEntities = ref<any[]>([])
  const resumableRun = ref<any>(null)

  const isActive = computed(() => !GENERATION_RESTING_PHASES.includes(generator.phase.value))
  const previewScenes = computed(() =>
    planEdits.value.length > 0 ? planEdits.value : generator.scenePlan.value
  )

  const sceneReviewEnabled = computed({
    get: () => generator.sceneReviewMode.value,
    set: (val: boolean) => {
      generator.sceneReviewMode.value = val
    }
  })
  const inlineEvalEnabled = computed({
    get: () => generator.inlineEvalEnabled.value,
    set: (val: boolean) => {
      generator.inlineEvalEnabled.value = val
    }
  })
  const autoRun = computed({
    get: () => generator.autoMode.value,
    set: (val: boolean) => {
      generator.autoMode.value = val
    }
  })

  function noteLiveEntity(type: string, name: string) {
    liveEntities.value.push({
      id: Date.now().toString(36) + performance.now().toString(36).replace('.', ''),
      type,
      name
    })
  }

  /** Clear everything a fresh start must not inherit from the last run. */
  function beginRun() {
    resetStreams()
    storyArc.value = null
    storyContract.value = ''
    planEdits.value = []
    liveEntities.value = []
  }

  /** Record what the planner returned so confirmPlan can hand it back. */
  function notePlanned(result: any) {
    if (!result) return
    storyArc.value = result.storyArc
    storyContract.value = result.storyContract
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function confirmPlan(ctx: { synopsis: string; sparkContext: string; focus: string }) {
    if (!projectStore.currentProjectId) return
    const editedPlan = planEdits.value.length > 0 ? planEdits.value : generator.scenePlan.value
    try {
      await generator.confirmPlan({
        projectId: projectStore.currentProjectId,
        editedPlan,
        storyArc: storyArc.value,
        storyContract: storyContract.value,
        synopsis: ctx.synopsis,
        sparkContext: ctx.sparkContext,
        focus: ctx.focus,
        onPhaseChange: () => {},
        onChunk: handleChunk
      })
    } catch {
      // error.value and phase are set inside the generator
    }
  }

  async function resume() {
    if (!projectStore.currentProjectId) return
    resumableRun.value = null
    resetStreams()
    try {
      await generator.resumeGeneration({
        projectId: projectStore.currentProjectId,
        onPhaseChange: () => {},
        onChunk: handleChunk
      })
    } catch {
      // phase/error set inside the generator
    }
  }

  async function confirmSync(acceptedEntities: any) {
    if (!projectStore.currentProjectId) return
    try {
      await generator.confirmSync({
        acceptedEntities,
        projectId: projectStore.currentProjectId,
        volumeId: generator.volumeId.value,
        chapterId: null
      })
    } catch {
      // handled inside the generator
    }
  }

  async function approve() {
    await generator.approveScene()
  }
  async function reject() {
    await generator.rejectScene()
  }
  async function rerequest(edits: string) {
    if (!edits?.trim()) return
    // The chapter wrapper spells it reRequestScene; the volume pipeline rerequestScene.
    const fn = generator.rerequestScene || generator.reRequestScene
    await fn.call(generator, edits)
  }

  async function reset() {
    await generator.reset()
    resetStreams()
    storyArc.value = null
    storyContract.value = ''
    planEdits.value = []
    liveEntities.value = []
    resumableRun.value = null
    if (selectedSceneIndex) selectedSceneIndex.value = 0
  }

  function sceneEdit(sceneIndex: number, field: string, value: any) {
    if (!planEdits.value.length) {
      planEdits.value = JSON.parse(JSON.stringify(generator.scenePlan.value))
    }
    if (planEdits.value[sceneIndex]) planEdits.value[sceneIndex][field] = value
  }

  /** "Ines → the truth, Tomas → to be left alone" → { Ines: 'the truth', … } */
  function wantsEdit(sceneIndex: number, text: string) {
    const wants: Record<string, string> = {}
    if (text) {
      text.split(',').forEach((part) => {
        const trimmed = part.trim()
        const sep = trimmed.indexOf('→')
        if (sep > 0) {
          const name = trimmed.slice(0, sep).trim()
          const goal = trimmed.slice(sep + 1).trim()
          if (name && goal) wants[name] = goal
        }
      })
    }
    sceneEdit(sceneIndex, 'characterWants', wants)
  }

  async function regenerateScene(sceneIndex: number) {
    if (!projectStore.currentProjectId) return
    await generator.regenerateScene(projectStore.currentProjectId, sceneIndex)
  }

  function chapterLogUpTo(idx: number) {
    return (generator.writtenScenes.value || [])
      .filter((_: any, i: number) => i < idx)
      .filter(Boolean)
      .map((s: any) => `Scene ${s.sceneNumber} ("${s.title}"): ${s.summary || '(written)'}`)
      .slice(-20)
      .join('\n')
  }

  async function evaluateScene(idx: number) {
    const scene = generator.writtenScenes.value?.[idx]
    const planItem = generator.scenePlan.value?.[idx]
    if (!scene) return
    const ws = projectStore.activeWorkspaceType || 'creative'
    const storyBible = await storyDocuments.getStoryDocumentContext(projectStore.currentProjectId)
    sceneEval.evaluate(
      scene,
      ws,
      planItem,
      idx,
      projectStore.currentProjectId,
      storyBible,
      chapterLogUpTo(idx)
    )
    await deps.onAfterEvaluate?.()
  }

  async function reviseScene(idx: number) {
    const scene = generator.writtenScenes.value?.[idx]
    const planItem = generator.scenePlan.value?.[idx]
    if (!scene || !sceneEval.critiqueResult.value) return
    const ws = projectStore.activeWorkspaceType || 'creative'
    const storyBible = await storyDocuments.getStoryDocumentContext(projectStore.currentProjectId)
    sceneEval.revise(scene, ws, planItem, idx, projectStore.currentProjectId, storyBible)
  }

  function acceptRevision() {
    const idx = selectedSceneIndex?.value
    if (idx === null || idx === undefined) return
    const scene = generator.writtenScenes.value?.[idx]
    if (!scene || !sceneEval.revisionResult.value) return
    scene.prose = sceneEval.revisionResult.value.revisedProse
  }

  async function saveToManuscript() {
    const scenes = generator.writtenScenes.value || []
    if (scenes.length === 0 || !projectStore.currentProjectId) return

    saveStatus.value = { type: 'saving', message: `Saving ${scenes.length} scene(s)...` }
    let saved = 0
    let skipped = 0
    let errors = 0
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const subsectionId = scene?.subsectionId || generator.scenePlan.value[i]?.subsectionId
      if (!scene || !subsectionId) {
        skipped++
        continue
      }
      try {
        await manuscriptStore.updateSubsectionData(
          subsectionId,
          { content: scene.prose, wordCount: scene.prose.split(/\s+/).filter(Boolean).length },
          projectStore.currentProjectId
        )
        saved++
      } catch (err) {
        console.error('[GenerationRun] failed to save scene', i, err)
        errors++
      }
    }
    saveStatus.value = {
      type: 'done',
      message:
        `Saved ${saved} scene(s)` +
        (skipped > 0 ? `, ${skipped} skipped (no subsection)` : '') +
        (errors > 0 ? `, ${errors} error(s)` : '')
    }
    setTimeout(() => {
      saveStatus.value = null
    }, 5000)
  }

  function exportable() {
    const scenes = generator.writtenScenes.value || []
    return scenes.filter(Boolean).map((s: any) => ({ title: s.title, prose: s.prose }))
  }
  async function exportTxt() {
    const scenes = exportable()
    if (scenes.length === 0) return
    await exportAsText({ title: exportTitle, scenes })
  }
  async function exportMd() {
    const scenes = exportable()
    if (scenes.length === 0) return
    await exportAsMarkdown({ title: exportTitle, scenes })
  }

  return {
    generator,
    // streams
    streams,
    streamSceneIndex,
    streamingText,
    activeStreamCount,
    currentScene,
    totalScenes,
    handleChunk,
    resetStreams,
    // run state
    storyArc,
    storyContract,
    planEdits,
    liveEntities,
    resumableRun,
    isActive,
    previewScenes,
    sceneReviewEnabled,
    inlineEvalEnabled,
    autoRun,
    noteLiveEntity,
    beginRun,
    notePlanned,
    // handlers
    confirmPlan,
    resume,
    confirmSync,
    approve,
    reject,
    rerequest,
    reset,
    sceneEdit,
    wantsEdit,
    regenerateScene,
    evaluateScene,
    reviseScene,
    acceptRevision,
    saveToManuscript,
    exportTxt,
    exportMd
  }
}
