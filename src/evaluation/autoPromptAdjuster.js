import dimensionPromptMap from './dimensionPromptMap.json'
import { getDimensionsForWorkspace } from '../config/evalDimensions'

const DEFAULTS = {
  threshold: 7,
  maxFocusAreas: 3,
  dampenRepeats: true,
  repeatWeight: 1.5
}

/**
 * Analyzes eval history and generates targeted focus instructions for the
 * writer prompt. Uses dimensionPromptMap.json for concrete improvement hints.
 *
 * Pure function — no state, no stores. Accepts pastGivenHints to dampen
 * repeated instructions across batches and retries.
 *
 * @param {Array} evalHistory - Eval results with dimensionScores
 * @param {object} [options]
 * @param {string} [options.workspaceType='creative']
 * @param {number} [options.threshold=7]
 * @param {number} [options.maxFocusAreas=3]
 * @param {Array} [options.pastGivenHints] - {dimension, hint}[] from prior rounds
 * @param {boolean} [options.dampenRepeats=true]
 * @param {number} [options.repeatWeight=1.5]
 * @returns {{ focusInstructions: string, givenHints: Array<object> }}
 */
export function autoAdjustPrompt(evalHistory, options = {}) {
  const {
    workspaceType = 'creative',
    threshold = DEFAULTS.threshold,
    maxFocusAreas = DEFAULTS.maxFocusAreas,
    pastGivenHints = [],
    dampenRepeats = DEFAULTS.dampenRepeats,
    repeatWeight = DEFAULTS.repeatWeight
  } = options

  if (!evalHistory || evalHistory.length === 0) {
    return { focusInstructions: '', givenHints: [] }
  }

  const dimConfig = getDimensionsForWorkspace(workspaceType)
  const map = dimensionPromptMap.dimensionMap || {}

  const dimScores = {}
  for (const ev of evalHistory) {
    if (!ev.dimensionScores) continue
    for (const [dim, score] of Object.entries(ev.dimensionScores)) {
      if (typeof score !== 'number') continue
      if (!dimScores[dim]) dimScores[dim] = []
      dimScores[dim].push(score)
    }
  }

  const dimKeys = Object.keys(dimScores)
  if (dimKeys.length === 0) {
    return { focusInstructions: '', givenHints: [] }
  }

  const dimAverages = dimKeys.map((dim) => {
    const scores = dimScores[dim]
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return { dim, avg, count: scores.length }
  })

  dimAverages.sort((a, b) => a.avg - b.avg)

  const weakDims = dimAverages.filter((d) => d.avg < threshold)

  if (weakDims.length === 0) {
    return { focusInstructions: '', givenHints: [] }
  }

  const repeatCounts = {}
  if (dampenRepeats) {
    for (const h of pastGivenHints) {
      repeatCounts[h.dimension] = (repeatCounts[h.dimension] || 0) + 1
    }
  }

  const scored = weakDims.map((d) => {
    const repeatPenalty = dampenRepeats
      ? (repeatCounts[d.dim] || 0) * repeatWeight
      : 0
    const gap = threshold - d.avg
    const score = gap - repeatPenalty
    return { ...d, gap, repeatPenalty, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const selected = scored.slice(0, maxFocusAreas)
  const lines = []
  const givenHints = []

  for (const d of selected) {
    const entry = map[d.dim]
    const dimCfg = dimConfig[d.dim]
    const label = dimCfg?.label || d.dim.replace(/_/g, ' ')

    if (entry) {
      const hint = entry.exampleSnippet || entry.improvementGuidance || `Improve ${label}.`
      lines.push(`- ${label} (${d.avg.toFixed(1)}/10): ${hint}`)
      givenHints.push({ dimension: d.dim, hint, avg: d.avg, count: d.count, label })
    } else {
      const hint = `Prioritize improving ${label} in the upcoming scene.`
      lines.push(`- ${label} (${d.avg.toFixed(1)}/10): ${hint}`)
      givenHints.push({ dimension: d.dim, hint, avg: d.avg, count: d.count, label })
    }
  }

  const focusInstructions = `FOCUS AREAS FOR THIS SCENE (based on past evaluation):\n${lines.join('\n')}`

  return { focusInstructions, givenHints }
}
