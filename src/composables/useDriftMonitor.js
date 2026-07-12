import { ref, computed } from 'vue'
import { useEvalPersistence } from './useEvalPersistence.js'
import {
  analyzeWorkspace,
  generateReport,
  DEFAULTS
} from '../evaluation/driftAnalyzer.js'

export function useDriftMonitor() {
  const { loadHistory } = useEvalPersistence()
  const driftReport = ref(null)
  const analysisError = ref(null)
  const isAnalyzing = ref(false)

  const workspaceSummaries = computed(() => {
    if (!driftReport.value) return []
    return driftReport.value.workspaceResults || []
  })

  const flaggedRegressions = computed(() => {
    if (!driftReport.value) return []
    return driftReport.value.flaggedItems?.regressions || []
  })

  const flaggedImprovements = computed(() => {
    if (!driftReport.value) return []
    return driftReport.value.flaggedItems?.improvements || []
  })

  const flaggedVolatility = computed(() => {
    if (!driftReport.value) return []
    return driftReport.value.flaggedItems?.volatilityIncreases || []
  })

  const hasDrift = computed(() => {
    return flaggedRegressions.value.length > 0 || flaggedImprovements.value.length > 0
  })

  const hasHighSeverity = computed(() => {
    return flaggedRegressions.value.some((r) => r.severity === 'high')
  })

  async function analyze(projectId) {
    isAnalyzing.value = true
    analysisError.value = null
    driftReport.value = null

    try {
      const evals = await loadHistory(projectId)
      if (!evals || evals.length === 0) {
        driftReport.value = {
          generatedAt: new Date().toISOString(),
          pipeline: 'drift-monitor',
          config: { recentWindow: DEFAULTS.recentWindow, driftThreshold: DEFAULTS.driftThreshold, minDataPoints: DEFAULTS.minDataPoints },
          summary: { totalEvals: 0, workspacesAnalyzed: 0, workspacesWithDrift: 0, dimensionsWithRegression: 0, dimensionsWithImprovement: 0, dimensionsWithVolatility: 0 },
          workspaceResults: [],
          flaggedItems: { regressions: [], improvements: [], volatilityIncreases: [] }
        }
        return driftReport.value
      }

      const options = {
        recentWindow: DEFAULTS.recentWindow,
        threshold: DEFAULTS.driftThreshold,
        minData: DEFAULTS.minDataPoints
      }

      const workspaceTypes = [...new Set(evals.map((e) => e.workspaceType || 'unknown').filter(Boolean))]
      const results = workspaceTypes.map((wt) => analyzeWorkspace(evals, wt, options))
      driftReport.value = generateReport(results, options)
      return driftReport.value
    } catch (err) {
      analysisError.value = err.message || String(err)
      return null
    } finally {
      isAnalyzing.value = false
    }
  }

  function clear() {
    driftReport.value = null
    analysisError.value = null
  }

  return {
    driftReport,
    analysisError,
    isAnalyzing,
    workspaceSummaries,
    flaggedRegressions,
    flaggedImprovements,
    flaggedVolatility,
    hasDrift,
    hasHighSeverity,
    analyze,
    clear
  }
}
