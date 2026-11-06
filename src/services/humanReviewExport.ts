import type {
  HumanReviewExport,
  HumanReviewResponse,
  HumanReviewSession,
  HumanReviewStudyRecord,
  RaterLabelRow
} from '../types/humanReview'

/**
 * Build the raw rater file consumed by `tools/labelling/agreement.py`.
 *
 * One file is one rater/pass. Keeping `labeller`, `studyId`, `rubricVersion`
 * and `packHash` on every row makes provenance survive a copied file; the
 * agreement tool's `--require-human` check reads the labeller field.
 */
export function buildHumanReviewExport(
  study: HumanReviewStudyRecord,
  session: HumanReviewSession,
  responses: HumanReviewResponse[]
): HumanReviewExport {
  if (session.status !== 'complete') {
    throw new Error('Finish the study before exporting its labels.')
  }
  const byScene = new Map(responses.map((response) => [response.sceneId, response]))
  const labels: RaterLabelRow[] = []
  for (const scene of study.scenes) {
    const response = byScene.get(scene.sceneId)
    if (!response) {
      throw new Error(`Missing a label for scene "${scene.sceneId}".`)
    }
    labels.push({
      sceneId: scene.sceneId,
      overall: response.overall,
      dims: response.dims,
      note: response.note,
      labeller: session.raterId,
      studyId: study.studyId,
      rubricVersion: study.rubricVersion,
      packHash: study.packHash,
      pass: session.passLabel
    })
  }
  if (labels.length !== study.scenes.length) {
    throw new Error('The session is incomplete.')
  }
  return {
    studyId: study.studyId,
    rubricVersion: study.rubricVersion,
    packHash: study.packHash,
    raterId: session.raterId,
    pass: session.passLabel,
    sessionId: session.id!,
    exportedAt: new Date().toISOString(),
    labels
  }
}

export function exportFilename(exported: HumanReviewExport): string {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${safe(exported.studyId)}-${safe(exported.raterId)}-${safe(exported.pass)}.json`
}

export function downloadHumanReviewExport(exported: HumanReviewExport): void {
  const blob = new Blob([JSON.stringify(exported.labels, null, 2)], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exportFilename(exported)
  anchor.click()
  URL.revokeObjectURL(url)
}
