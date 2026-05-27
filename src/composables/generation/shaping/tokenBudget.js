const DEFAULT_BUDGET_CHARS = 6000

export function applyTokenBudget(bundle, budget = DEFAULT_BUDGET_CHARS) {
  let totalChars = Object.entries(bundle)
    .filter(([key]) => key !== 'totalChars' && key !== 'truncated')
    .reduce((sum, [, val]) => sum + (typeof val === 'string' ? val.length : 0), 0)

  if (totalChars <= budget) {
    return { ...bundle, totalChars, truncated: false }
  }

  const truncated = { ...bundle }
  const keys = ['entitiesBlock', 'relationshipBlock', 'manuscriptBlock'].filter(k => typeof truncated[k] === 'string')

  while (totalChars > budget && keys.length > 0) {
    keys.sort((a, b) => (truncated[a] || '').length - (truncated[b] || '').length)
    const target = keys.pop()
    const current = truncated[target] || ''
    const reduced = truncateToLastSentence(current, Math.floor(current.length * 0.6))
    totalChars -= current.length - reduced.length
    truncated[target] = reduced
  }

  return { ...truncated, totalChars, truncated: totalChars > budget }
}

function truncateToLastSentence(text, maxLength) {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastNewline = truncated.lastIndexOf('\n')
  const splitAt = Math.max(lastPeriod, lastNewline)
  return splitAt > maxLength * 0.5 ? truncated.slice(0, splitAt + 1) : truncated
}
