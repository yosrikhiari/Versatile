import { estimateTokens } from '../../../services/ai/contextBudget'

// This module was always called "tokenBudget" but measured characters, so its
// `budget` argument meant something different from the token budgets everywhere
// else in the pipeline. Values are the old character counts divided by 4 — the
// ratio the rest of the code was implicitly assuming — so the effective budget
// is unchanged and is now stated in the unit the name promises.
export const DEFAULT_BUDGET_TOKENS = 1500

export function applyTokenBudget(bundle: any, budget = DEFAULT_BUDGET_TOKENS, systemPrompt = '') {
  const overheadTokens = typeof systemPrompt === 'string' ? estimateTokens(systemPrompt) : 0
  const effectiveBudget = Math.max(budget - overheadTokens, 250)

  let totalTokens = Object.entries(bundle)
    .filter(([key]) => key !== 'totalTokens' && key !== 'truncated')
    .reduce((sum, [, val]) => sum + (typeof val === 'string' ? estimateTokens(val) : 0), 0)

  if (totalTokens <= effectiveBudget) {
    return { ...bundle, totalTokens, truncated: false, systemPromptTokens: overheadTokens }
  }

  const truncated = { ...bundle }
  // Derive truncatable keys from the bundle itself. The previous hardcoded list
  // (`entitiesBlock`/`relationshipBlock`) did not match the keys `shapeContext`
  // actually emits (`charactersBlock`/`locationsBlock`/`plotThreadsBlock`/
  // `relationshipsBlock`), so entity context was never trimmed and the budget
  // was effectively a no-op for real callers.
  const RESERVED = new Set(['totalTokens', 'truncated', 'systemPromptTokens'])
  const keys = Object.keys(truncated).filter(
    (k) => !RESERVED.has(k) && typeof truncated[k] === 'string'
  )

  // Cheapest correct approach: keep the block sizes we already measured rather
  // than re-tokenizing every block on every pass of the loop.
  const sizes = new Map<string, number>(keys.map((k) => [k, estimateTokens(truncated[k] || '')]))

  while (totalTokens > effectiveBudget && keys.length > 0) {
    keys.sort((a, b) => (sizes.get(a) || 0) - (sizes.get(b) || 0))
    const target = keys.pop() as string
    const current = truncated[target] || ''
    const reduced = truncateToLastSentence(current, Math.floor(current.length * 0.6))
    const reducedTokens = estimateTokens(reduced)
    totalTokens -= (sizes.get(target) || 0) - reducedTokens
    sizes.set(target, reducedTokens)
    truncated[target] = reduced
  }

  return {
    ...truncated,
    totalTokens,
    truncated: totalTokens > effectiveBudget,
    systemPromptTokens: overheadTokens
  }
}

function truncateToLastSentence(text: any, maxLength: any) {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastNewline = truncated.lastIndexOf('\n')
  const splitAt = Math.max(lastPeriod, lastNewline)
  return splitAt > maxLength * 0.5 ? truncated.slice(0, splitAt + 1) : truncated
}
