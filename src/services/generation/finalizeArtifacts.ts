import { planCanvasElements } from '../storyCanvasSync'

/**
 * Bring every derived editor surface up to date once a run has produced prose.
 *
 * A generation run commits the primary data — chapters, scenes, entities, graph
 * edges — but the surfaces built ON TOP of that data were not all refreshed
 * afterwards. The Story Canvas was never written by anything but hand, and the
 * story-bible documents were only ever created when missing, never refreshed. So
 * a finished ten-chapter volume left the canvas empty and the documents
 * describing the project as it stood before the run — and those same stale
 * documents are what gets fed back to the model as canon on the next run.
 *
 * Collected in one place, rather than inline in the generator, so that "what a
 * finished run must populate" is a single testable contract instead of a
 * sequence of side effects buried in a 2,000-line composable.
 *
 * Never throws. Every artifact here is derived from data that is already
 * committed, so a failure must not fail a written volume — the report says what
 * landed and what did not.
 */

export interface FinalizeReport {
  canvasElements: number
  documents: string[]
  storyContextRebuilt: boolean
  errors: string[]
}

export async function finalizeStoryArtifacts({
  projectId,
  manuscriptStore,
  storyBibleStore,
  storyDocs
}: {
  projectId: any
  manuscriptStore: any
  storyBibleStore: any
  storyDocs: any
}): Promise<FinalizeReport> {
  const report: FinalizeReport = {
    canvasElements: 0,
    documents: [],
    storyContextRebuilt: false,
    errors: []
  }
  if (!projectId) return report

  // ── Story Canvas ──
  // Additive: planCanvasElements filters out anything already on the canvas, so
  // an arrangement the author made survives untouched.
  try {
    const plan = planCanvasElements(
      {
        sections: manuscriptStore?.sortedSections || [],
        characters: storyBibleStore?.characters || [],
        locations: storyBibleStore?.locations || [],
        plotThreads: storyBibleStore?.plotThreads || []
      },
      manuscriptStore?.storyElements || []
    )
    if (plan.length) {
      await manuscriptStore.addStoryElementsBatchData(projectId, plan)
      report.canvasElements = plan.length
    }
  } catch (err: any) {
    report.errors.push(`canvas: ${err?.message || err}`)
  }

  // ── Story-bible documents ──
  // `force` refreshes existing docs; author-edited ones are skipped inside.
  try {
    const refreshed = await storyDocs.regenerateAllDocuments(projectId, { force: true })
    report.documents = Array.isArray(refreshed) ? refreshed : []
  } catch (err: any) {
    report.errors.push(`documents: ${err?.message || err}`)
  }

  // The Story Context doc has its own author zone, so it rebuilds separately —
  // and independently, so a failure above does not cost us this one too.
  try {
    await storyDocs.rebuildStoryContextDoc(projectId)
    report.storyContextRebuilt = true
  } catch (err: any) {
    report.errors.push(`story context: ${err?.message || err}`)
  }

  return report
}

/** One-line summary for the activity log. */
export function describeFinalizeReport(report: FinalizeReport): string {
  const parts: string[] = []
  parts.push(
    report.canvasElements
      ? `${report.canvasElements} canvas elements`
      : 'canvas already up to date'
  )
  parts.push(
    report.documents.length
      ? `documents refreshed: ${report.documents.join(', ')}`
      : 'no documents needed refreshing'
  )
  if (report.storyContextRebuilt) parts.push('story context rebuilt')
  if (report.errors.length) parts.push(`failed: ${report.errors.join('; ')}`)
  return parts.join(' · ')
}
