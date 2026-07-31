import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

export function createQualityGuard(
  opts: {
    enabled?: boolean
    minProseLength?: number
    maxRepeatPhrase?: number
  } = {}
): GuardFunction {
  const { enabled = true, minProseLength = 50, maxRepeatPhrase = 3 } = opts

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const data = context.data as Record<string, unknown> | undefined
    if (!data) return []

    const proseTexts: string[] = []
    if (typeof data.content === 'string') proseTexts.push(data.content)
    if (typeof data.narrative === 'string') proseTexts.push(data.narrative)
    if (typeof data.title === 'string') proseTexts.push(data.title)
    if (typeof data.summary === 'string') proseTexts.push(data.summary)
    if (typeof data.analysis === 'string') proseTexts.push(data.analysis)

    for (const text of proseTexts) {
      if (text.length < minProseLength) {
        results.push({
          kind: 'quality',
          passed: false,
          severity: 'detective',
          message: `Output is very short (${text.length} chars, min ${minProseLength})`,
          details: { length: text.length, minLength: minProseLength },
          layer: context.layer,
          timestamp: Date.now(),
        })
      }

      const repeatCount = countMaxPhraseRepeat(text)
      if (repeatCount >= maxRepeatPhrase) {
        results.push({
          kind: 'quality',
          passed: false,
          severity: 'detective',
          message: `Output contains repeated phrase (${repeatCount}x)`,
          details: { repeatCount, maxRepeatPhrase },
          layer: context.layer,
          timestamp: Date.now(),
        })
      }
    }

    return results
  }
}

function countMaxPhraseRepeat(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length < 6) return 0

  let maxCount = 0
  for (let len = 3; len <= 6; len++) {
    const seen = new Map<string, number>()
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(' ')
      const count = (seen.get(phrase) ?? 0) + 1
      seen.set(phrase, count)
      if (count > maxCount) maxCount = count
    }
  }
  return maxCount
}
