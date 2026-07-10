export const DEFAULT_BUDGET_CHARS = 6000

export function applyTokenBudget(bundle, budget = DEFAULT_BUDGET_CHARS, systemPrompt = '') {
  const overheadChars = typeof systemPrompt === 'string' ? systemPrompt.length : 0
  const effectiveBudget = Math.max(budget - overheadChars, 1000)

  let totalChars = Object.entries(bundle)
    .filter(([key]) => key !== 'totalChars' && key !== 'truncated')
    .reduce((sum, [, val]) => sum + (typeof val === 'string' ? val.length : 0), 0)

  if (totalChars <= effectiveBudget) {
    const result = { ...bundle, totalChars, truncated: false, systemPromptLength: overheadChars }
    return result
  }

  const truncated = { ...bundle }
  const keys = ['entitiesBlock', 'relationshipBlock', 'manuscriptBlock'].filter(
    (k) => typeof truncated[k] === 'string'
  )

  while (totalChars > effectiveBudget && keys.length > 0) {
    keys.sort((a, b) => (truncated[a] || '').length - (truncated[b] || '').length)
    const target = keys.pop()
    const current = truncated[target] || ''
    const reduced = truncateToLastSentence(current, Math.floor(current.length * 0.6))
    const reduction = current.length - reduced.length
    totalChars -= reduction
    truncated[target] = reduced
  }

  const result = {
    ...truncated,
    totalChars,
    truncated: totalChars > effectiveBudget,
    systemPromptLength: overheadChars
  }
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
