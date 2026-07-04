export function extractJson(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('No input to parse')

  let cleaned = raw.trim()

  // Strip markdown code fences (```json or ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  cleaned = cleaned.replace(/```\s*$/i, '')

  // Strip any preamble text before the first {
  const firstBrace = cleaned.indexOf('{')
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace)
  if (firstBrace === -1) throw new Error('No JSON object found in response')

  // Attempt parse
  try {
    return JSON.parse(cleaned)
  } catch {
    // Repair: remove trailing commas before } or ]
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')

    // Repair: close unclosed braces/brackets
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

    // Repair: strip trailing text after the last complete } or ]
    const lastClose = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (lastClose > 0 && lastClose < cleaned.length - 1) {
      cleaned = cleaned.slice(0, lastClose + 1)
    }

    // Retry parse
    try {
      return JSON.parse(cleaned)
    } catch (e2) {
      throw new Error(
        `JSON parse failed after repair: ${e2.message}. Input start: ${raw.slice(0, 200)}`
      )
    }
  }
}

export function tryExtractJson(raw) {
  try {
    const data = extractJson(raw)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export function finalizeStream(accumulated) {
  return extractJson(accumulated)
}
