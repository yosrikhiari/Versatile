import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

export function createInputGuard(
  opts: {
    enabled?: boolean
    maxPromptLength?: number
    blockedPatterns?: RegExp[]
  } = {}
): GuardFunction {
  const {
    enabled = true,
    maxPromptLength = 16000,
    blockedPatterns = [
      /ignore\s+(previous|all)\s+(instructions|commands)/i,
      /you\s+(are\s+)?(now|will\s+now)\s+/i,
      /system\s+(prompt|instruction|message)/i,
    ],
  } = opts

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const data = context.data as Record<string, unknown> | undefined
    if (!data) return []

    const promptTexts: string[] = []
    if (typeof data.prompt === 'string') promptTexts.push(data.prompt)
    if (typeof data.systemPrompt === 'string') promptTexts.push(data.systemPrompt)
    if (typeof data.userMessage === 'string') promptTexts.push(data.userMessage)

    for (const text of promptTexts) {
      if (text.length > maxPromptLength) {
        results.push({
          kind: 'input',
          passed: false,
          severity: 'blocking',
          message: `Prompt exceeds max length (${text.length} > ${maxPromptLength})`,
          details: { length: text.length, maxLength: maxPromptLength },
          layer: context.layer,
          timestamp: Date.now(),
        })
      }

      for (const pattern of blockedPatterns) {
        const match = text.match(pattern)
        if (match) {
          results.push({
            kind: 'input',
            passed: false,
            severity: 'blocking',
            message: `Prompt contains blocked pattern: "${match[0]}"`,
            details: { pattern: pattern.source, match: match[0] },
            layer: context.layer,
            timestamp: Date.now(),
          })
        }
      }
    }

    return results
  }
}
