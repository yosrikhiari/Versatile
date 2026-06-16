/**
 * Shared AI utility functions: retry logic, JSON response sanitization,
 * project context building, and field length constraints.
 *
 * Extracted from useOllama.js to eliminate duplication across generation modules.
 */
import { useProjectStore } from '../../stores/projectStore'
import { useStoryDocuments } from '../../composables/useStoryDocuments'

// --- Retry & sleep ---

const PERMANENT_ERROR_PATTERNS = [
  'not found',
  'not found in Ollama',
  'API key',
  'Unauthorized',
  'Forbidden',
  '401',
  '403'
]

export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function randomJitter(baseMs) {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return baseMs + (array[0] / 4294967296) * baseMs * 0.5
}

/**
 * Retries an asynchronous function with exponential backoff.
 * @param {Function} fn - The asynchronous function to retry.
 * @param {number} [maxRetries=5] - Maximum number of retry attempts.
 * @returns {Promise<any>} The result of the function if successful.
 * @throws {Error} The last error encountered if all retries fail or if a permanent error occurs.
 */
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

// --- JSON sanitization ---

/**
 * Strips markdown code fences from a raw LLM response and parses the JSON.
 * Returns the raw parsed object without flattening values.
 * @param {string} raw - The raw response string from the language model.
 * @returns {Object|null} The parsed JSON object, or null if parsing fails.
 */
export function sanitizeJson(raw) {
  if (!raw || typeof raw !== 'string') return null
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')
  cleaned = cleaned.trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

/**
 * Sanitizes a raw LLM response string and attempts to extract/flatten a JSON object.
 * @param {string} response - The raw response string from the language model.
 * @returns {Object|null} The parsed and flattened JSON object, or null if parsing fails.
 */
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
        })
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

// --- Project context builders ---

/**
 * Retrieves the current project context including category and description.
 * @returns {string} The formatted project context string, or an empty string if none exists.
 */
export function getProjectContext() {
  const projectStore = useProjectStore()
  const parts = []
  if (projectStore.currentCategory) {
    parts.push(`Category: ${projectStore.currentCategory}`)
  }
  if (projectStore.currentDescription) {
    parts.push(`Description: ${projectStore.currentDescription}`)
  }
  return parts.length > 0 ? `\n\n${parts.join('\n')}` : ''
}

/**
 * Retrieves the existing story entities context asynchronously.
 * @returns {Promise<string>} The formatted context string containing existing story documents.
 */
export async function getExistingEntitiesContext() {
  try {
    const projectStore = useProjectStore()
    const { getStoryDocumentContext } = useStoryDocuments()
    const context = await getStoryDocumentContext(projectStore.currentProjectId)
    return context ? `\n\n${context}` : ''
  } catch {
    return ''
  }
}

// --- Field length constraints ---

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