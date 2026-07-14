import { computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { db } from '../services/db-core'
import { getProject } from '../services/db-structure'
import { WORKSPACE_TYPES } from '../config/workspace'

export function useEvalExport() {
  const projectStore = useProjectStore()
  const exporting = computed(() => false)

  async function fetchFullEvalHistory(projectId) {
    const project = await getProject(projectId)
    if (!project) return null

    const category = (project.category || '').toLowerCase().trim()
    const workspaceTypes = Object.values(WORKSPACE_TYPES)
    const workspaceType = workspaceTypes.includes(category) ? category : WORKSPACE_TYPES.CREATIVE

    const evals = await db.evalResults.where('projectId').equals(projectId).toArray()
    const enriched = evals.map((e) => ({
      projectId: e.projectId,
      sceneId: e.sceneId,
      evalType: e.evalType,
      score: e.score,
      dimensionScores: e.dimensionScores,
      issues: e.issues,
      strengths: e.strengths,
      timestamp: e.timestamp,
      sceneTitle: e.sceneTitle,
      rawResult: e.rawResult,
      workspaceType: e.workspaceType || workspaceType
    }))

    const sections = await db.sections.where('projectId').equals(projectId).toArray()
    const sectionIds = sections.map((s) => s.id)
    const subsections = await db.subsections
      .where('sectionId')
      .anyOf(sectionIds)
      .sortBy('order')

    const sectionOrder = {}
    sections.forEach((s) => { sectionOrder[s.id] = s.order || 0 })
    subsections.sort((a, b) => {
      const sa = sectionOrder[a.sectionId] || 0
      const sb = sectionOrder[b.sectionId] || 0
      return sa !== sb ? sa - sb : (a.order || 0) - (b.order || 0)
    })

    const content = {}
    subsections.forEach((sub, i) => {
      content[String(i)] = sub.content || ''
    })

    return { evals: enriched, content, projectName: project.name }
  }

  async function downloadEvalHistory(projectId) {
    const data = await fetchFullEvalHistory(projectId)
    if (!data) return

    const payload = {
      version: 1,
      description: `Eval history exported for project ${data.projectName || projectId}`,
      exportedAt: new Date().toISOString(),
      evals: data.evals,
      content: data.content
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eval-history-${projectId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return { fetchFullEvalHistory, downloadEvalHistory, exporting }
}
