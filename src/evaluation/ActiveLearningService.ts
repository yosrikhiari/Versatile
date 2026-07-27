import {
  aggregateDimensionScores,
  generateRecommendations,
  generateReport
} from './activeLearningAnalyzer'
import { autoAdjustPrompt } from './autoPromptAdjuster'
import dimensionPromptMap from './dimensionPromptMap.json'

export class ActiveLearningService {
  analyzeAndAdjust({
    evalHistory,
    workspaceType,
    options = {}
  }: {
    evalHistory: any
    workspaceType: any
    options?: any
  }) {
    if (!evalHistory || evalHistory.length === 0) {
      return {
        focusInstructions: '',
        givenHints: [],
        recommendations: [],
        report: null,
        dimensionStats: null
      }
    }

    const dimensionStats = aggregateDimensionScores(evalHistory, workspaceType || 'creative')
    const recommendations = generateRecommendations(dimensionStats, dimensionPromptMap)
    const report = generateReport([dimensionStats], recommendations)

    const { focusInstructions, givenHints } = autoAdjustPrompt(evalHistory, {
      workspaceType: workspaceType || 'creative',
      ...options
    })

    return { focusInstructions, givenHints, recommendations, report, dimensionStats }
  }
}
