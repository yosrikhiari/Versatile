export function extractJson(raw: string): unknown {
  if (!raw || typeof raw !== 'string') throw new Error('No input to parse')

  let cleaned = raw.trim()

  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/```\s*$/i, '')

  const firstBrace = cleaned.indexOf('{')
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace)
  if (firstBrace === -1) throw new Error('No JSON object found in response')

  try {
    return JSON.parse(cleaned)
  } catch {
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')

    let opens = 0
    let closes = 0
    for (const ch of cleaned) {
      if (ch === '{' || ch === '[') opens++
      if (ch === '}' || ch === ']') closes++
    }
    while (closes < opens) {
      cleaned += '}'
      closes++
    }

    const lastClose = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (lastClose > 0 && lastClose < cleaned.length - 1) {
      cleaned = cleaned.slice(0, lastClose + 1)
    }

    try {
      return JSON.parse(cleaned)
    } catch (e2) {
      throw new Error(
        `JSON parse failed after repair: ${(e2 as Error).message}. Input start: ${raw.slice(0, 200)}`
      )
    }
  }
}

export function tryExtractJson(raw: string): { success: boolean; data?: unknown; error?: string } {
  try {
    const data = extractJson(raw)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export function finalizeStream(accumulated: string): unknown {
  return extractJson(accumulated)
}
