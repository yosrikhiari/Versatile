import { ref } from 'vue'
import { autoAdjustPrompt } from '../evaluation/autoPromptAdjuster'
import { getDefaultThreshold } from '../config/evalDimensions'

export function useAutoPromptAdjuster() {
  const allGivenHints = ref<any[]>([])
  const focusInstructions = ref('')
  const givenHints = ref<any[]>([])

  function updateAdjustments(evalHistory: any, options: { workspaceType?: string; threshold?: number } = {}) {
    if (!evalHistory || evalHistory.length === 0) {
      focusInstructions.value = ''
      givenHints.value = []
      return { focusInstructions: '', givenHints: [] }
    }
    const { workspaceType = 'creative', threshold = getDefaultThreshold(workspaceType) } = options
    const result = autoAdjustPrompt(evalHistory, { workspaceType, threshold, pastGivenHints: allGivenHints.value })
    focusInstructions.value = result.focusInstructions
    givenHints.value = result.givenHints
    allGivenHints.value = [...allGivenHints.value, ...result.givenHints]
    return result
  }

  function reset() {
    allGivenHints.value = []
    focusInstructions.value = ''
    givenHints.value = []
  }

  return {
    allGivenHints,
    focusInstructions,
    givenHints,
    updateAdjustments,
    reset
  }
}
