import { computed, ref } from 'vue'
import { useVolumeStoryGenerator } from './useVolumeStoryGenerator'
import { getGenRun, PIPELINE_STAGES } from '../services/db-generation'

// Thin, declarative orchestrator for the full "synopsis → novel" pipeline.
//
// It does NOT re-implement generation — the engine is useVolumeStoryGenerator.
// This layer owns the declared dependency graph, surfaces stage-level status for
// the UI, and coordinates resume-from-stage so a killed run re-enters at the
// first unfinished stage instead of restarting from scratch.
//
// Dependency graph (see PIPELINE-PLAN.md):
//   bible → network → structure → spine → prose → consistency
// with volume shells created up front and Canvas/Timeline derived from the above.

export const PIPELINE_DAG = [
  { key: 'bible', label: 'Story Bible', dependsOn: [] },
  { key: 'network', label: 'Story Network', dependsOn: ['bible'] },
  { key: 'structure', label: 'Structure (volumes & chapters)', dependsOn: ['bible', 'network'] },
  { key: 'spine', label: 'Narrative spine', dependsOn: ['structure'] },
  { key: 'prose', label: 'Chapter prose', dependsOn: ['structure', 'spine'] },
  { key: 'consistency', label: 'Consistency audit', dependsOn: ['prose'] }
]

export function useNovelPipeline() {
  const engine = useVolumeStoryGenerator()

  // Stage status snapshot, refreshed from the checkpoint row on demand.
  const stageState = ref(null)

  async function refreshStages(projectId) {
    if (!projectId) return null
    const run = await getGenRun(projectId)
    stageState.value = run?.state?.version === 2 ? run.state : null
    return stageState.value
  }

  const stages = computed(() => {
    const state = stageState.value
    return PIPELINE_DAG.map((stage) => ({
      ...stage,
      status: state?.stages?.[stage.key]?.status || 'pending',
      error: state?.stages?.[stage.key]?.error || null,
      ...(stage.key === 'prose'
        ? {
            written: state?.stages?.prose?.written || 0,
            total: state?.stages?.prose?.total || 0
          }
        : {})
    }))
  })

  const currentStage = computed(() => stageState.value?.currentStage || null)

  /**
   * Run the whole pipeline end-to-end for a minimal seed.
   * seed: { projectId, synopsis, genre, tone, wordTarget?, structure?, sparkContext? }
   */
  async function generate(seed, callbacks = {}) {
    if (!seed?.projectId) throw new Error('useNovelPipeline.generate requires a projectId')
    const result = await engine.startGeneration({
      projectId: seed.projectId,
      synopsis: seed.synopsis || '',
      genre: seed.genre || '',
      tone: seed.tone || '',
      wordTarget: seed.wordTarget,
      structure: seed.structure || null,
      sparkContext: seed.sparkContext || '',
      auto: true,
      onPhaseChange: async (phase) => {
        await refreshStages(seed.projectId)
        callbacks.onPhaseChange?.(phase)
      },
      onPartialData: callbacks.onPartialData,
      onChunk: callbacks.onChunk
    })
    await refreshStages(seed.projectId)
    return result
  }

  /**
   * Resume an interrupted run. If it died during prose, delegate to the engine's
   * scene-level resume (fills only empty subsections). If it died in an earlier
   * stage, those stages are safe to re-run (bootstrap enriches idempotently, the
   * network stage dedupes, planning re-plans), so start a fresh pass.
   */
  async function resume(seed, callbacks = {}) {
    const projectId = seed?.projectId
    if (!projectId) return { resumed: false, reason: 'no-project' }
    const state = await refreshStages(projectId)
    if (!state) return { resumed: false, reason: 'no-checkpoint' }

    if (state.currentStage === 'prose' || state.stages?.prose?.status === 'running') {
      const res = await engine.resumeGeneration({
        projectId,
        onChunk: callbacks.onChunk,
        onPhaseChange: callbacks.onPhaseChange
      })
      await refreshStages(projectId)
      if (res.resumed) return res
      // Fall through to a fresh pass if scene-resume couldn't proceed.
    }

    return generate(seed, callbacks)
  }

  async function getResumable(projectId) {
    return engine.getResumableRun(projectId)
  }

  return {
    // declared graph + live status
    dag: PIPELINE_DAG,
    stageKeys: PIPELINE_STAGES,
    stages,
    currentStage,
    stageState,
    refreshStages,
    // actions
    generate,
    resume,
    getResumable,
    // pass-through engine state so existing UI can bind to it unchanged
    phase: engine.phase,
    progress: engine.progress,
    error: engine.error,
    scenePlan: engine.scenePlan,
    writtenScenes: engine.writtenScenes,
    consistencyReport: engine.consistencyReport,
    reset: engine.reset,
    engine
  }
}
