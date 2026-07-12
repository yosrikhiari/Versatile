import { getDimensionsForWorkspace } from '@/config/evalDimensions'

interface SceneEvaluation {
  sceneIndex?: number
  passed?: boolean
  score?: number | null
  topIssues?: string[]
  dimensionScores?: Record<string, number> | null
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

  const dimensionFeedback = buildDimensionFeedback(sceneEvaluations)

  let result = `EVALUATION FEEDBACK FROM PREVIOUS SCENES:\n${lines.join('\n')}`
  if (dimensionFeedback) {
    result += `\n\n${dimensionFeedback}`
  }
  return result
}

function buildDimensionFeedback(sceneEvaluations: SceneEvaluation[]): string {
  const dimScores: Record<string, number[]> = {}

  for (const ev of sceneEvaluations) {
    if (!ev.dimensionScores) continue
    for (const [dim, score] of Object.entries(ev.dimensionScores)) {
      if (typeof score !== 'number') continue
      if (!dimScores[dim]) dimScores[dim] = []
      dimScores[dim].push(score)
    }
  }

  const dimKeys = Object.keys(dimScores)
  if (dimKeys.length === 0) return ''

  const dimAverages: { dim: string; avg: number }[] = dimKeys.map((dim) => {
    const scores = dimScores[dim]
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return { dim, avg: Math.round(avg * 10) / 10 }
  })

  dimAverages.sort((a, b) => a.avg - b.avg)
  const weakest = dimAverages[0]
  const strongest = dimAverages[dimAverages.length - 1]

  const avgLines = dimAverages.map(
    (d) => `  ${d.dim.replace(/_/g, ' ')}: ${d.avg}/10`
  )

  const parts: string[] = [`PER-DIMENSION AVERAGES:\n${avgLines.join('\n')}`]
  parts.push(`Recommended Focus: ${weakest.dim.replace(/_/g, ' ')} is the weakest dimension (${weakest.avg}/10). Prioritize improving this area in upcoming scenes.`)

  if (strongest.avg >= 7) {
    parts.push(`Keep up the strong ${strongest.dim.replace(/_/g, ' ')} (${strongest.avg}/10).`)
  }

  return parts.join('\n')
}

export function buildFocusInstructions(
  sceneEvaluations: SceneEvaluation[],
  options?: { workspaceType?: string; threshold?: number }
): string {
  const dims = getDimensionsForWorkspace(options?.workspaceType ?? 'creative')
  const effectiveThreshold = options?.threshold ?? 7

  const dimScores: Record<string, number[]> = {}
  for (const ev of sceneEvaluations) {
    if (!ev.dimensionScores) continue
    for (const [dim, score] of Object.entries(ev.dimensionScores)) {
      if (typeof score !== 'number') continue
      if (!dimScores[dim]) dimScores[dim] = []
      dimScores[dim].push(score)
    }
  }

  const dimKeys = Object.keys(dimScores)
  if (dimKeys.length === 0) return ''

  const dimAverages: { dim: string; avg: number }[] = dimKeys.map((dim) => {
    const scores = dimScores[dim]
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return { dim, avg: Math.round(avg * 10) / 10 }
  })

  dimAverages.sort((a, b) => a.avg - b.avg)

  const weakDims = dimAverages.filter((d) => d.avg < effectiveThreshold)
  if (weakDims.length === 0) return ''

  const lines = weakDims.map((d) => {
    const dimConfig = dims[d.dim]
    const instruction = dimConfig?.focusInstruction
    const label = dimConfig?.label || d.dim.replace(/_/g, ' ')
    if (instruction) {
      return `- ${label} (${d.avg}/10): ${instruction}`
    }
    return `- ${label} (${d.avg}/10): Prioritize improving this area in the upcoming scene.`
  })

  return `FOCUS AREAS FOR THIS SCENE (based on past evaluation):\n${lines.join('\n')}`
}
