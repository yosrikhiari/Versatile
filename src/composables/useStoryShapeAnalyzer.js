import { ref, computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useHeuristicAnalyzer } from './useHeuristicAnalyzer'
import { useAIShapeAnalyzer } from './useAIShapeAnalyzer'
import {
  saveShapeAnalysis,
  getLatestShapeVersion,
  getAllShapeAnalyses
} from '../services/db-story-shape'

export function useStoryShapeAnalyzer() {
  const projectStore = useProjectStore()
  const { analyzeScene } = useHeuristicAnalyzer()
  const { runAIAnalysis, isAnalyzing: isAIAnalyzing } = useAIShapeAnalyzer()

  const sceneAnalyses = ref([])
  const currentAnalysis = ref(null)
  const isAnalyzing = ref(false)
  const currentVersion = ref(0)
  const aiInsights = ref(null)

  const combinedTension = computed(() => {
    if (!currentAnalysis.value) return []
    return currentAnalysis.value.wordBasedTension || []
  })

  const hasAnalysis = computed(() => currentAnalysis.value !== null)

  async function runFullAnalysis() {
    const content = projectStore.documentContent
    if (!content || content.trim().length === 0) return

    isAnalyzing.value = true
    aiInsights.value = null
    try {
      const latestVersion = await getLatestShapeVersion(projectStore.currentProjectId)
      currentVersion.value = latestVersion + 1

      const result = analyzeScene(content)
      if (!result) return

      currentAnalysis.value = result

      await saveShapeAnalysis({
        projectId: projectStore.currentProjectId,
        sceneId: 'full-manuscript',
        version: currentVersion.value,
        analysis: result
      })

      const insights = await runAIAnalysis(content)
      if (insights) {
        aiInsights.value = insights
      }
    } catch (err) {
      console.error('[StoryShape] Analysis failed:', err)
    } finally {
      isAnalyzing.value = false
    }
  }

  async function loadLatestAnalysis() {
    const projectId = projectStore.currentProjectId
    if (!projectId) return

    const all = await getAllShapeAnalyses(projectId)
    if (all.length === 0) return

    const sorted = all.sort((a, b) => b.version - a.version)
    const latest = sorted[0]
    currentVersion.value = latest.version
    currentAnalysis.value = latest.analysis
  }

  return {
    sceneAnalyses,
    currentAnalysis,
    isAnalyzing,
    isAIAnalyzing,
    currentVersion,
    combinedTension,
    hasAnalysis,
    aiInsights,
    runFullAnalysis,
    loadLatestAnalysis
  }
}
