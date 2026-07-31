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

/**
 * Recover an object from JSON that was cut off mid-emission.
 *
 * Grammar-constrained output (Ollama's `format`) is well-formed right up to the
 * point it runs out of `num_predict`, so a truncated plan is a complete prefix
 * plus unclosed brackets — nine good chapters and a tenth half-written. Closing
 * the open structures salvages that, which matters because the alternative is
 * re-running a generation that costs minutes on local hardware.
 *
 * Drops the trailing incomplete element rather than emitting a half-populated
 * one, so callers never see a chapter with a title and nothing else.
 *
 * @returns the parsed object, or null if nothing coherent could be recovered.
 */
export function repairTruncatedJson(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null
  const balanced = sanitizeJson(raw)
  if (balanced) return balanced

  let text = String(raw).trim()
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').trim()
  const start = text.indexOf('{')
  if (start === -1) return null
  text = text.slice(start)

  // Close whatever `prefix` left open and try to parse it. Recomputing the stack
  // per candidate keeps this honest: a cut point is only accepted if the result
  // actually parses, so no malformed object can escape.
  const closeAndParse = (prefix: string): Record<string, unknown> | null => {
    const openers: string[] = []
    let inStr = false
    let escaped = false
    for (let i = 0; i < prefix.length; i++) {
      const ch = prefix[i]
      if (inStr) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{' || ch === '[') openers.push(ch)
      else if (ch === '}' || ch === ']') openers.pop()
    }
    let candidate = prefix.replace(/[,\s]+$/, '')
    // A dangling key with no value ({"a":1,"b") cannot be closed meaningfully.
    if (/[:,]\s*$/.test(candidate) || inStr) return null
    while (openers.length) candidate += openers.pop() === '{' ? '}' : ']'
    try {
      const parsed = JSON.parse(candidate)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  // Scan once, recording every offset that sits immediately after a COMPLETED
  // value — the only places a document can be truncated without inventing data.
  // A key string is deliberately not such a place: cutting after `"title"` would
  // otherwise yield an object with a key and no value.
  const cuts: number[] = []
  const frames: Array<{ type: '{' | '['; expectKey: boolean }> = []
  let inStr = false
  let escaped = false
  let strIsKey = false
  let inLiteral = false

  // Only element boundaries qualify. Cutting after any completed value would
  // happily stop mid-object and emit a chapter carrying nothing but its number —
  // structurally valid, semantically junk. A closed container is a whole element;
  // a direct field of the root object is the one other safe stopping point.
  const noteElementEnd = (endExclusive: number) => {
    if (frames.length) cuts.push(endExclusive)
  }
  const noteScalarEnd = (endExclusive: number) => {
    if (frames.length === 1) cuts.push(endExclusive)
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') {
        inStr = false
        if (!strIsKey) noteScalarEnd(i + 1)
      }
      continue
    }

    if (inLiteral && /[,}\]\s]/.test(ch)) {
      inLiteral = false
      noteScalarEnd(i)
    }

    if (ch === '"') {
      const frame = frames[frames.length - 1]
      strIsKey = !!frame && frame.type === '{' && frame.expectKey
      inStr = true
    } else if (ch === '{' || ch === '[') {
      frames.push({ type: ch, expectKey: ch === '{' })
    } else if (ch === '}' || ch === ']') {
      frames.pop()
      noteElementEnd(i + 1)
    } else if (ch === ':') {
      const frame = frames[frames.length - 1]
      if (frame) frame.expectKey = false
    } else if (ch === ',') {
      const frame = frames[frames.length - 1]
      if (frame && frame.type === '{') frame.expectKey = true
    } else if (/[-\d]/.test(ch) || /[a-z]/.test(ch)) {
      inLiteral = true
    }
  }
  if (inLiteral) noteScalarEnd(text.length)

  // Longest surviving prefix first — that keeps the most completed chapters.
  // Bounded so a pathological input cannot turn this into a quadratic scan.
  const MAX_ATTEMPTS = 200
  const ordered = cuts.slice(-MAX_ATTEMPTS).reverse()
  for (const cut of ordered) {
    const repaired = closeAndParse(text.slice(0, cut))
    if (repaired) return repaired
  }

  // Nothing was completed (e.g. `{"chapters":[`). Closing the open containers
  // still yields a valid, empty-but-usable shape, which callers pad rather than
  // treating as a hard failure.
  return closeAndParse(text)
}

/**
 * `T` is the caller's expected parse shape — an assertion about what the model
 * was asked to emit, not a validated guarantee.
 */
export function sanitizeJsonResponse<T = Record<string, unknown>>(
  response: unknown
): T | null {
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

    return flattened as T
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
