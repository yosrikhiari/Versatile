import { ref } from 'vue'
import { db } from '../services/db-core'

// Generation history + resumable-run state for the story generator, extracted
// from StoryGeneratorPanel so that component can stay an orchestrator. These are
// the read-only queries; the actual resume orchestration stays in the panel
// because it drives panel-local streaming state.
//
// Dependencies are injected (a project-id getter and the volume generator) so
// the queries can be exercised without mounting the component.
export function useGenerationHistory(getProjectId, volumeGenerator) {
  const previousGenerations = ref([])
  const resumableRun = ref(null)

  async function loadPreviousGenerations() {
    const pid = getProjectId?.()
    if (!pid) return
    try {
      previousGenerations.value = await db.generatedStories
        .where('projectId')
        .equals(pid)
        .reverse()
        .sortBy('generatedAt')
    } catch {
      // History is informational; a read failure just shows none.
    }
  }

  async function checkResumable() {
    const pid = getProjectId?.()
    if (!pid) {
      resumableRun.value = null
      return
    }
    try {
      resumableRun.value = await volumeGenerator.getResumableRun(pid)
    } catch {
      resumableRun.value = null
    }
  }

  async function handleDiscardResumable() {
    const pid = getProjectId?.()
    if (!pid) return
    try {
      const { clearGenRun } = await import('../services/db-generation')
      await clearGenRun(pid)
    } catch {
      // Best-effort clear; leave the checkpoint in place if it fails.
    }
    resumableRun.value = null
  }

  return {
    previousGenerations,
    resumableRun,
    loadPreviousGenerations,
    checkResumable,
    handleDiscardResumable
  }
}
