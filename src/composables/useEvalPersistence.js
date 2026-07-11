import { ref } from 'vue'
import {
  saveEvalResult,
  getEvalResultsByProject,
  getEvalResultsByScene,
  getEvalScoreHistory,
  getAggregateStats,
  deleteEvalResultsByProject
} from '../services/db-evals'

export function useEvalPersistence() {
  const evalHistory = ref([])
  const historyLoading = ref(false)
  const aggregateStats = ref(null)

  async function saveRecord(record) {
    if (!record.projectId) return null
    return saveEvalResult(record)
  }

  async function loadHistory(projectId) {
    if (!projectId) {
      evalHistory.value = []
      return []
    }
    historyLoading.value = true
    try {
      const results = await getEvalResultsByProject(projectId)
      evalHistory.value = results
      return results
    } finally {
      historyLoading.value = false
    }
  }

  async function loadSceneHistory(projectId, sceneId) {
    if (!projectId) return []
    return getEvalResultsByScene(projectId, sceneId)
  }

  async function loadScoreTrend(projectId, evalType, limit) {
    if (!projectId) return []
    return getEvalScoreHistory(projectId, evalType, limit)
  }

  async function refreshStats(projectId) {
    if (!projectId) {
      aggregateStats.value = null
      return null
    }
    const stats = await getAggregateStats(projectId)
    aggregateStats.value = stats
    return stats
  }

  async function clearHistory(projectId) {
    if (!projectId) return
    await deleteEvalResultsByProject(projectId)
    evalHistory.value = []
    aggregateStats.value = null
  }

  return {
    evalHistory,
    historyLoading,
    aggregateStats,
    saveRecord,
    loadHistory,
    loadSceneHistory,
    loadScoreTrend,
    refreshStats,
    clearHistory
  }
}
