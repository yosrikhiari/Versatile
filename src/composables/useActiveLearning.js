import { ref, computed } from 'vue'
import { useEvalPersistence } from './useEvalPersistence.js'
import {
  aggregateDimensionScores,
  generateRecommendations,
  generateReport
} from '../evaluation/activeLearningAnalyzer.js'
import { getDefaultThreshold, getDimensionsForWorkspace } from '../config/evalDimensions.js'
import dimensionPromptMap from '../evaluation/dimensionPromptMap.json'

const CALIBRATION_KEY = 'versatile_active_learning_calibration'

function loadCalibrationData() {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY)
    if (!raw) return { thresholds: {}, examples: {} }
    return JSON.parse(raw)
  } catch {
    return { thresholds: {}, examples: {} }
  }
}

function saveCalibrationData(data) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(data))
}

export function useActiveLearning() {
  const { loadHistory } = useEvalPersistence()
  const analysisReport = ref(null)
  const analysisError = ref(null)
  const isAnalyzing = ref(false)

  const calibration = ref(loadCalibrationData())

  function persistCalibration() {
    saveCalibrationData(calibration.value)
  }

  function calibrationKey(workspaceType, dimension) {
    return `${workspaceType}:${dimension}`
  }

  function getCustomThreshold(workspaceType, dimension) {
    const key = calibrationKey(workspaceType, dimension)
    const val = calibration.value.thresholds[key]
    return typeof val === 'number' ? val : null
  }

  function setCustomThreshold(workspaceType, dimension, value) {
    const key = calibrationKey(workspaceType, dimension)
    const dims = getDimensionsForWorkspace(workspaceType)
    const dim = dims[dimension]
    if (!dim) return
    const clamped = Math.max(1, Math.min(10, Math.round(value)))
    if (clamped === dim.defaultThreshold) {
      delete calibration.value.thresholds[key]
    } else {
      calibration.value.thresholds[key] = clamped
    }
    persistCalibration()
  }

  function getCalibrationExample(workspaceType, dimension) {
    const key = calibrationKey(workspaceType, dimension)
    return calibration.value.examples[key] || ''
  }

  function setCalibrationExample(workspaceType, dimension, text) {
    const key = calibrationKey(workspaceType, dimension)
    if (!text || text.trim() === '') {
      delete calibration.value.examples[key]
    } else {
      calibration.value.examples[key] = text.trim()
    }
    persistCalibration()
  }

  function resetThresholds(workspaceType, dimension) {
    const key = calibrationKey(workspaceType, dimension)
    delete calibration.value.thresholds[key]
    delete calibration.value.examples[key]
    persistCalibration()
  }

  function resetAllForWorkspace(workspaceType) {
    const prefix = `${workspaceType}:`
    for (const key of Object.keys(calibration.value.thresholds)) {
      if (key.startsWith(prefix)) delete calibration.value.thresholds[key]
    }
    for (const key of Object.keys(calibration.value.examples)) {
      if (key.startsWith(prefix)) delete calibration.value.examples[key]
    }
    persistCalibration()
  }

  function getActiveThreshold(workspaceType, dimension) {
    const custom = getCustomThreshold(workspaceType, dimension)
    if (custom !== null) return custom
    const dims = getDimensionsForWorkspace(workspaceType)
    const dim = dims[dimension]
    return dim ? dim.defaultThreshold : 7
  }

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
          const activeThreshold = getActiveThreshold(wt, r.dimension)
          r.threshold = activeThreshold
          r.activeThresholdIsCustom =
            getCustomThreshold(wt, r.dimension) !== null
          if (r.avgScore !== null) {
            r.gap = parseFloat(Math.max(0, activeThreshold - r.avgScore).toFixed(1))
          }
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
    calibration,
    getCustomThreshold,
    setCustomThreshold,
    getCalibrationExample,
    setCalibrationExample,
    resetThresholds,
    resetAllForWorkspace,
    getActiveThreshold,
    analyze,
    clear
  }
}
