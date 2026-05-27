const PERMANENT_ERROR_PATTERNS = [
  'not found',
  'not found in Ollama',
  'API key',
  'Unauthorized',
  'Forbidden',
  '401',
  '403'
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomJitter(baseMs) {
  return baseMs + Math.random() * baseMs * 0.5
}

export async function retryWithBackoff(fn, maxRetries = 5) {
  const delays = [1000, 2000, 4000, 6000, 8000]

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isPermanent = PERMANENT_ERROR_PATTERNS.some(p =>
        error.message?.includes(p)
      )
      if (isPermanent || attempt >= maxRetries - 1) {
        throw error
      }
      await sleep(randomJitter(delays[attempt]))
    }
  }
}

export function sanitizeJsonResponse(response) {
  if (!response || typeof response !== 'string') {
    return null
  }

  let cleaned = response.trim()

  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')

  cleaned = cleaned.trim()

  const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return null

  try {
    let parsed = JSON.parse(jsonMatch[0])

    const flattened = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value === null || value === undefined) {
        flattened[key] = ''
      } else if (typeof value === 'string') {
        let str = value
        try {
          const innerParsed = JSON.parse(str)
          str = typeof innerParsed === 'string' ? innerParsed : Object.values(innerParsed).join('; ')
        } catch {}
        flattened[key] = str.replace(/^\{"?|"}$/g, '').replace(/\\"/g, '"')
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        flattened[key] = String(value)
      } else if (Array.isArray(value)) {
        flattened[key] = value.map(v => {
          if (typeof v === 'string') return v
          if (typeof v === 'object' && v !== null) return Object.values(v).join(': ')
          return String(v)
        }).join('; ')
      } else if (typeof value === 'object') {
        flattened[key] = Object.values(value).join('; ')
      } else {
        flattened[key] = String(value)
      }
    }

    return flattened
  } catch {
    return null
  }
}

export function normalizeField(parsed, field) {
  return parsed[field] || parsed[field.charAt(0).toUpperCase() + field.slice(1)] || ''
}

export function wrapApiError(error) {
  if (!error) return new Error('Generation failed. Ensure Ollama is running and your model is loaded.')
  const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
  throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
}

export const FIELD_LENGTH_CONSTRAINTS = {
  character: {
    name: { maxSentences: 1, maxWords: 3, guidance: '1-2 words, a proper name that fits the character' },
    role: { maxSentences: 2, maxWords: 10, guidance: '1-2 short sentences, describes their archetype or function (e.g., "Retired detective haunted by the past.")' },
    goal: { maxSentences: 2, maxWords: 20, guidance: '1-2 sentences, what the character wants to achieve' },
    voice: { maxSentences: 2, maxWords: 25, guidance: '1-2 sentences, how they speak - accent, vocabulary, rhythm' },
    notes: { maxSentences: 4, maxWords: 60, guidance: '2-4 sentences, backstory snippets or story hooks' },
    sampleDialogue: { maxSentences: 3, maxWords: 50, guidance: 'A single line this character would actually say — not a description of how they speak, but the actual words (e.g., "Get out of my sight.")' }
  },
  location: {
    name: { maxSentences: 1, maxWords: 4, guidance: '1-3 words, evocative name' },
    description: { maxSentences: 3, maxWords: 40, guidance: '2-3 sentences, physical description and atmosphere' },
    notes: { maxSentences: 3, maxWords: 50, guidance: '2-3 sentences, history, secrets, or significance' }
  },
  plotThread: {
    title: { maxSentences: 1, maxWords: 6, guidance: '1-5 words, evocative title for the plot thread' },
    notes: { maxSentences: 4, maxWords: 60, guidance: '2-4 sentences, conflict, tension, or unresolved question' }
  }
}
