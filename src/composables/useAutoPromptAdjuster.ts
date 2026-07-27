import { ref } from 'vue'
import { autoAdjustPrompt } from '../evaluation/autoPromptAdjuster'

export function useAutoPromptAdjuster() {
  const allGivenHints = ref<any[]>([])
  const focusInstructions = ref('')
  const givenHints = ref<any[]>([])

  function updateAdjustments(evalHistory: any) {
    if (!evalHistory || evalHistory.length === 0) {
      focusInstructions.value = ''
      givenHints.value = []
      return { focusInstructions: '', givenHints: [] }
    }
    const result = autoAdjustPrompt(evalHistory, { pastGivenHints: allGivenHints.value })
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
