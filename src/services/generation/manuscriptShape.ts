/**
 * Manuscript-scoped shape analysis — the entry the finalize contract needed.
 *
 * `useStoryShapeAnalyzer().runFullAnalysis()` reads the open editor document,
 * so wiring it into finalize would analyse whatever happens to be open (and
 * spend an LLM call per run). This entry analyses the run's committed
 * manuscript instead, heuristic-only: no model calls, so finalize stays
 * free and never-throwing. AI insights remain on-demand in the shape panel.
 */

import { useHeuristicAnalyzer } from '../../composables/useHeuristicAnalyzer'
import { getSubsections } from '../db-structure'
import { saveShapeAnalysis, getLatestShapeVersion } from '../db-story-shape'

export interface ManuscriptShapeOutcome {
  ok: boolean
  version: number | null
  detail: string
}

/**
 * Assemble the committed manuscript as plain text: sections in order, each
 * with its subsections in order under a header. Markup stripped — the
 * heuristic counts words, not tags.
 */
export function buildManuscriptText(sections: any[], subsections: any[]): string {
  const orderedSections = [...(sections || [])].sort((a, b) => (a?.order || 0) - (b?.order || 0))
  const parts: string[] = []
  for (const section of orderedSections) {
    const chunks = (subsections || [])
      .filter((s: any) => String(s?.sectionId) === String(section?.id))
      .sort((a: any, b: any) => (a?.order || 0) - (b?.order || 0))
      .map((s: any) => String(s?.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (chunks.length === 0) continue
    parts.push(`[Section ${(section?.order || 0) + 1}: ${section?.title || 'Untitled'}]`)
    parts.push(chunks.join('\n\n'))
  }
  return parts.join('\n\n')
}

/**
 * Analyse the committed manuscript and store a versioned record under the
 * same `full-manuscript` scene id the panel reads, so the panel shows the
 * run's output rather than going stale. Best-effort by contract: reports,
 * never throws.
 */
export async function analyzeManuscriptShape({
  projectId,
  sections,
  loadSubsections = getSubsections
}: {
  projectId: any
  sections: any[]
  loadSubsections?: (projectId: any) => Promise<any[]>
}): Promise<ManuscriptShapeOutcome> {
  if (!projectId) return { ok: false, version: null, detail: 'missing projectId' }
  try {
    const subsections = await loadSubsections(projectId)
    const text = buildManuscriptText(sections, subsections)
    if (!text.trim()) return { ok: false, version: null, detail: 'manuscript is empty' }
    const { analyzeScene } = useHeuristicAnalyzer()
    const analysis = analyzeScene(text)
    if (!analysis) return { ok: false, version: null, detail: 'heuristic found no content' }
    const version = (await getLatestShapeVersion(projectId)) + 1
    await saveShapeAnalysis({ projectId, sceneId: 'full-manuscript', version, analysis })
    return { ok: true, version, detail: `shape v${version}` }
  } catch (err: any) {
    return { ok: false, version: null, detail: String(err?.message || err) }
  }
}
