import { autoAdjustPrompt } from '../../evaluation/autoPromptAdjuster'

/**
 * Eval bootstrap for generation runs: seed the prompt adjuster and scope the
 * eval store from persisted per-project history.
 *
 * Extracted verbatim from useVolumeStoryGenerator.ts (stage 1b of the god-file
 * split). These three functions only touch their arguments (promptAdjuster /
 * evalStore facades plus lazy useEvalPersistence), so they move as a unit.
 * Log prefixes intentionally keep the original tag.
 */

/**
 * Load evaluation history for a project and seed the prompt adjuster with
 * cumulative focus instructions. This enables cross-run learning by
 * feeding past evaluation data into the adjuster at run start.
 */
export async function seedPromptAdjusterFromHistory(projectId: string, workspaceType: string, promptAdjuster: any) {
  if (!projectId) return
  try {
    const evalPersistence = (await import('../useEvalPersistence')).useEvalPersistence()
    const evalHistory = await evalPersistence.loadHistory(projectId)
    if (evalHistory && evalHistory.length > 0) {
      const result = autoAdjustPrompt(evalHistory, {
        workspaceType,
        pastGivenHints: promptAdjuster.allGivenHints.value
      })
      promptAdjuster.focusInstructions.value = result.focusInstructions
      promptAdjuster.givenHints.value = result.givenHints
      promptAdjuster.allGivenHints.value = [...promptAdjuster.allGivenHints.value, ...result.givenHints]
    }
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Failed to seed prompt adjuster from history:', err)
  }
}

/**
 * Rehydrate the prompt adjuster from persisted history instead of clearing.
 * Used when resetting the generator to preserve cross-run hint history.
 */
export async function rehydratePromptAdjuster(projectId: string, workspaceType: string, promptAdjuster: any) {
  if (!projectId) {
    promptAdjuster.reset()
    return
  }
  try {
    const evalPersistence = (await import('../useEvalPersistence')).useEvalPersistence()
    const evalHistory = await evalPersistence.loadHistory(projectId)
    promptAdjuster.allGivenHints.value = []
    promptAdjuster.focusInstructions.value = ''
    promptAdjuster.givenHints.value = []
    if (evalHistory && evalHistory.length > 0) {
      const result = autoAdjustPrompt(evalHistory, {
        workspaceType,
        pastGivenHints: []
      })
      promptAdjuster.focusInstructions.value = result.focusInstructions
      promptAdjuster.givenHints.value = result.givenHints
      promptAdjuster.allGivenHints.value = result.givenHints
    }
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Failed to rehydrate prompt adjuster:', err)
    promptAdjuster.reset()
  }
}

/**
 * Clear the evalStore and seed it from persisted history for the current project.
 * This scopes evalStore by project and prevents cross-project contamination.
 */
export async function clearAndSeedEvalStore(projectId: string, evalStore: any) {
  if (!projectId) {
    evalStore.clearResults()
    return
  }
  try {
    const evalPersistence = (await import('../useEvalPersistence')).useEvalPersistence()
    const evalHistory = await evalPersistence.loadHistory(projectId)
    evalStore.clearResults()
    if (evalHistory && evalHistory.length > 0) {
      // Convert persisted eval results to the format expected by evalStore
      // The evalStore expects entries with sceneIndex, score, dimensionScores, etc.
      evalStore.setResults(evalHistory.map((e: any) => ({
        sceneIndex: e.sceneId,
        passed: e.score != null && e.score >= 7,
        score: e.score,
        dimensionScores: e.dimensionScores,
        topIssues: e.issues || [],
        workspaceType: e.workspaceType
      })))
    }
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Failed to seed evalStore from history:', err)
    evalStore.clearResults()
  }
}
