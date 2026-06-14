const DEFAULT_BUDGET_CHARS = 6000

export function applyTokenBudget(bundle, budget = DEFAULT_BUDGET_CHARS) {
  let totalChars = Object.entries(bundle)
    .filter(([key]) => key !== 'totalChars' && key !== 'truncated')
    .reduce((sum, [, val]) => sum + (typeof val === 'string' ? val.length : 0), 0)

  if (totalChars <= budget) {
    const result = { ...bundle, totalChars, truncated: false }
    return result
  }

  const truncated = { ...bundle }
  const keys = ['entitiesBlock', 'relationshipBlock', 'manuscriptBlock'].filter(k => typeof truncated[k] === 'string')

  const reductionLog = []
  while (totalChars > budget && keys.length > 0) {
    keys.sort((a, b) => (truncated[a] || '').length - (truncated[b] || '').length)
    const target = keys.pop()
    const current = truncated[target] || ''
    const reduced = truncateToLastSentence(current, Math.floor(current.length * 0.6))
    const reduction = current.length - reduced.length
    reductionLog.push({ key: target, before: current.length, after: reduced.length, reduction })
    totalChars -= reduction
    truncated[target] = reduced
  }

  const result = { ...truncated, totalChars, truncated: totalChars > budget }
  return result
}

function truncateToLastSentence(text, maxLength) {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastNewline = truncated.lastIndexOf('\n')
  const splitAt = Math.max(lastPeriod, lastNewline)
  return splitAt > maxLength * 0.5 ? truncated.slice(0, splitAt + 1) : truncated
}
