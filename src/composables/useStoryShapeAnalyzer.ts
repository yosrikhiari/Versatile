import { ref, computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useHeuristicAnalyzer } from './useHeuristicAnalyzer'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { buildManuscriptText } from '../services/generation/manuscriptShape'
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

  const sceneAnalyses = ref<any[]>([])
  const currentAnalysis = ref<any>(null)
  const isAnalyzing = ref(false)
  const currentVersion = ref(0)
  const aiInsights = ref<any>(null)

  const combinedTension = computed(() => {
    if (!currentAnalysis.value) return []
    return currentAnalysis.value.wordBasedTension || []
  })

  const hasAnalysis = computed(() => currentAnalysis.value !== null)

  /**
   * The whole manuscript as text: the loose root draft, then every chapter's
   * scenes in manuscript order. The panel used to analyse the root document
   * alone, which is empty for a book written in scenes, so Reanalyze did
   * nothing and the panel showed whatever the last generation run had stored.
   */
  function manuscriptText(): string {
    const manuscriptStore = useManuscriptStore()
    const parts: string[] = []
    const root = String(projectStore.documentContent || '')
    if (root.trim()) parts.push(root)
    parts.push(
      buildManuscriptText(manuscriptStore.sections as any[], manuscriptStore.subsections as any[])
    )
    return parts.filter((p) => p.trim()).join('\n\n')
  }

  const hasManuscript = computed(() => {
    const manuscriptStore = useManuscriptStore()
    return (
      String(projectStore.documentContent || '').trim().length > 0 ||
      (manuscriptStore.subsections as any[]).some((s) => String(s?.content || '').trim())
    )
  })

  async function runFullAnalysis() {
    const content = manuscriptText()
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

    // Version, then id: two records can share a version (the panel and a
    // generation run both write), and the older one used to win.
    const sorted = all.sort(
      (a: any, b: any) => b.version - a.version || (Number(b.id) || 0) - (Number(a.id) || 0)
    )
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
    hasManuscript,
    aiInsights,
    runFullAnalysis,
    loadLatestAnalysis
  }
}
