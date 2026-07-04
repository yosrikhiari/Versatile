export function computeDegradation(originalCritique, revisedCritique) {
  if (!originalCritique || !revisedCritique) {
    return { dimensions: {}, hasRegressions: false, hasMajorRegressions: false }
  }

  const origScores = originalCritique.dimensionScores || {}
  const revScores = revisedCritique.dimensionScores || {}
  const allDims = new Set([...Object.keys(origScores), ...Object.keys(revScores)])

  const dimensions = {}
  let hasRegressions = false
  let hasMajorRegressions = false

  for (const dim of allDims) {
    const before = origScores[dim] ?? null
    const after = revScores[dim] ?? null

    if (before != null && after != null) {
      const delta = after - before
      let status
      if (delta > 0) status = 'improved'
      else if (delta === 0) status = 'unchanged'
      else if (delta <= -2) {
        status = 'major_regression'
        hasRegressions = true
        hasMajorRegressions = true
      } else {
        status = 'regressed'
        hasRegressions = true
      }

      dimensions[dim] = { before, after, delta, status }
    } else {
      dimensions[dim] = {
        before,
        after,
        delta: before != null ? -after : after != null ? after : 0,
        status: 'unknown'
      }
    }
  }

  return { dimensions, hasRegressions, hasMajorRegressions }
}
