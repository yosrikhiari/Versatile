import { ref, computed } from 'vue'
import { useEvalPersistence } from './useEvalPersistence.js'
import {
  aggregateDimensionScores,
  generateRecommendations,
  generateReport
} from '../evaluation/activeLearningAnalyzer.js'
import dimensionPromptMap from '../evaluation/dimensionPromptMap.json'

export function useActiveLearning() {
  const { loadHistory } = useEvalPersistence()
  const analysisReport = ref(null)
  const analysisError = ref(null)
  const isAnalyzing = ref(false)

  const recommendations = computed(() => {
    if (!analysisReport.value) return []
    return analysisReport.value.recommendations || []
  })

  const belowThresholdRecs = computed(() => {
    return recommendations.value.filter((r) => r.severity === 'below_threshold')
  })

  const noDataRecs = computed(() => {
    return recommendations.value.filter((r) => r.severity === 'insufficient_data')
  })

  const hasActionableItems = computed(() => {
    return recommendations.value.length > 0
  })

  const workspaceResults = computed(() => {
    if (!analysisReport.value) return []
    return analysisReport.value.workspaceResults || []
  })

  async function analyze(projectId) {
    isAnalyzing.value = true
    analysisError.value = null
    analysisReport.value = null

    try {
      const evals = await loadHistory(projectId)
      if (!evals || evals.length === 0) {
        analysisReport.value = {
          generatedAt: new Date().toISOString(),
          summary: {
            workspacesAnalyzed: 0,
            totalEvals: 0,
            dimensionsFlagged: 0,
            dimensionsWithNoData: 0,
            actionableRecommendations: 0
          },
          workspaceResults: [],
          recommendations: [],
          overview: 'No eval data available.'
        }
        return analysisReport.value
      }

      const workspaceTypes = [
        ...new Set(evals.map((e) => e.workspaceType || 'unknown').filter(Boolean))
      ]
      const aggregatedList = []
      const allRecommendations = []

      for (const wt of workspaceTypes) {
        const result = aggregateDimensionScores(evals, wt)
        aggregatedList.push(result)
        const recs = generateRecommendations(result, dimensionPromptMap)
        for (const r of recs) {
          r.workspaceType = wt
        }
        allRecommendations.push(...recs)
      }

      analysisReport.value = generateReport(aggregatedList, allRecommendations)
      return analysisReport.value
    } catch (err) {
      analysisError.value = err.message || String(err)
      return null
    } finally {
      isAnalyzing.value = false
    }
  }

  function clear() {
    analysisReport.value = null
    analysisError.value = null
  }

  return {
    analysisReport,
    analysisError,
    isAnalyzing,
    recommendations,
    belowThresholdRecs,
    noDataRecs,
    hasActionableItems,
    workspaceResults,
    analyze,
    clear
  }
}
