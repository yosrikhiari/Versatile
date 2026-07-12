interface SceneEvaluation {
  sceneIndex?: number
  passed?: boolean
  score?: number | null
  topIssues?: string[]
}

export function formatEvalFeedback(sceneEvaluations: SceneEvaluation[]): string {
  if (!sceneEvaluations || sceneEvaluations.length === 0) return ''

  const lines = sceneEvaluations.map((ev, i) => {
    const index = ev.sceneIndex ?? i + 1
    const status = ev.passed ? 'Pass' : 'FAIL'
    const score = ev.score != null ? ` (${ev.score})` : ''
    const issues =
      ev.topIssues && ev.topIssues.length > 0 ? ` Issues: ${ev.topIssues.join('; ')}` : ''
    return `Scene ${index}: ${status}${score}${issues}`
  })

  return `EVALUATION FEEDBACK FROM PREVIOUS SCENES:\n${lines.join('\n')}`
}
