import {
  aggregateDimensionScores,
  generateRecommendations,
  generateReport
} from './activeLearningAnalyzer.js'
import { autoAdjustPrompt } from './autoPromptAdjuster.js'
import dimensionPromptMap from './dimensionPromptMap.json'

export class ActiveLearningService {
  analyzeAndAdjust({ evalHistory, workspaceType, options = {} }) {
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
