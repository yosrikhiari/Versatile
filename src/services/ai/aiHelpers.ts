const PERMANENT_ERROR_PATTERNS = [
  'not found',
  'not found in Ollama',
  'API key',
  'Unauthorized',
  'Forbidden',
  '401',
  '403'
]

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomJitter(baseMs: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return baseMs + (array[0] / 4294967296) * baseMs * 0.5
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  const delays = [1000, 2000, 4000, 6000, 8000]

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isPermanent = PERMANENT_ERROR_PATTERNS.some((p) =>
        (error as Error).message?.includes(p)
      )
      if (isPermanent || attempt >= maxRetries - 1) {
        throw error
      }
      await sleep(randomJitter(delays[attempt]))
    }
  }

  throw new Error('retryWithBackoff exhausted')
}

/**
 * Extract the first balanced top-level JSON object from a string, respecting
 * string literals and escapes. Replaces the previous regex approaches which
 * were either non-greedy (`/\{[\s\S]*?\}/`, truncates at the first `}` and so
 * breaks on any nested object) or greedy (`/\{[\s\S]*\}/`, over-matches when
 * trailing text contains a `}`).
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      inStr = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export function sanitizeJson(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')
  cleaned = cleaned.trim()
  const match = extractJsonObject(cleaned)
  if (!match) return null
  try {
    return JSON.parse(match) as Record<string, unknown>
  } catch {
    return null
  }
}

export function sanitizeJsonResponse(response: unknown): Record<string, unknown> | null {
  if (!response || typeof response !== 'string') {
    return null
  }

  let cleaned = response.trim()

  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')

  cleaned = cleaned.trim()

  const jsonMatch = extractJsonObject(cleaned)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch) as Record<string, unknown>

    const flattened: Record<string, string | string[]> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (value === null || value === undefined) {
        flattened[key] = ''
      } else if (typeof value === 'string') {
        let str = value
        try {
          const innerParsed = JSON.parse(str)
          str =
            typeof innerParsed === 'string' ? innerParsed : Object.values(innerParsed).join('; ')
        } catch {
          /* not inner JSON */
        }
        flattened[key] = str.replace(/^\{"?|"}$/g, '').replace(/\\"/g, '"')
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        flattened[key] = String(value)
      } else if (Array.isArray(value)) {
        flattened[key] = value.map((v: unknown) => {
          if (typeof v === 'string') return v
          if (typeof v === 'object' && v !== null) return Object.values(v).join(': ')
          return String(v)
        })
      } else if (typeof value === 'object') {
        flattened[key] = Object.values(value as Record<string, unknown>).join('; ')
      } else {
        flattened[key] = String(value)
      }
    }

    return flattened
  } catch {
    return null
  }
}

export function getProjectContext(category?: string, description?: string): string {
  const parts: string[] = []
  if (category) {
    parts.push(`Category: ${category}`)
  }
  if (description) {
    parts.push(`Description: ${description}`)
  }
  return parts.length > 0 ? `\n\n${parts.join('\n')}` : ''
}

export async function getExistingEntitiesContext(context?: string): Promise<string> {
  return context ? `\n\n${context}` : ''
}

export const FIELD_LENGTH_CONSTRAINTS = {
  character: {
    name: {
      maxSentences: 1,
      maxWords: 3,
      guidance: '1-2 words, a proper name that fits the character'
    },
    role: {
      maxSentences: 2,
      maxWords: 10,
      guidance:
        '1-2 short sentences, describes their archetype or function (e.g., "Retired detective haunted by the past.")'
    },
    goal: {
      maxSentences: 2,
      maxWords: 20,
      guidance: '1-2 sentences, what the character wants to achieve'
    },
    voice: {
      maxSentences: 2,
      maxWords: 25,
      guidance: '1-2 sentences, how they speak - accent, vocabulary, rhythm'
    },
    notes: {
      maxSentences: 4,
      maxWords: 60,
      guidance: '2-4 sentences, backstory snippets or story hooks'
    },
    sampleDialogue: {
      maxSentences: 3,
      maxWords: 50,
      guidance:
        'A single line this character would actually say — not a description of how they speak, but the actual words (e.g., "Get out of my sight.")'
    },
    traits: {
      maxSentences: 3,
      maxWords: 30,
      guidance:
        '3-5 traits, EACH rooted in this character\'s role, goal, or backstory — never generic or a random quirk. Every trait must connect to who they are and what they have been through (e.g., for a healer who lost her parents to plague: "distrusts any cure she did not make herself"). Do not invent unmotivated tics.'
    }
  },
  location: {
    name: { maxSentences: 1, maxWords: 4, guidance: '1-3 words, evocative name' },
    description: {
      maxSentences: 3,
      maxWords: 40,
      guidance: '2-3 sentences, physical description and atmosphere'
    },
    notes: {
      maxSentences: 3,
      maxWords: 50,
      guidance: '2-3 sentences, history, secrets, or significance'
    }
  },
  plotThread: {
    title: {
      maxSentences: 1,
      maxWords: 6,
      guidance: '1-5 words, evocative title for the plot thread'
    },
    notes: {
      maxSentences: 4,
      maxWords: 60,
      guidance: '2-4 sentences, conflict, tension, or unresolved question'
    },
    traits: {
      maxSentences: 3,
      maxWords: 30,
      guidance:
        '2-4 tags describing this thread (e.g., "slow-burn", "betrayal", "mystery"), each consistent with how the involved characters are already described.'
    }
  }
} as const
