import { aiGenerate } from '../useAiService'
import { FEATURES } from '../../config/ai'

export {
  retryWithBackoff,
  sanitizeJsonResponse,
  sanitizeJson,
  FIELD_LENGTH_CONSTRAINTS
} from '../../services/ai/aiHelpers'

export function normalizeField(parsed, field) {
  return parsed[field] || parsed[field.charAt(0).toUpperCase() + field.slice(1)] || ''
}

export function wrapApiError(error) {
  if (!error)
    return new Error('Generation failed. Ensure Ollama is running and your model is loaded.')
  const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
  throw new Error(
    isApiError
      ? error.message
      : 'Generation failed. Ensure Ollama is running and your model is loaded.'
  )
}

export async function computeSummary(fullProse) {
  try {
    const summaryPrompt = `You are a copyeditor. Summarize the following narrative scene in exactly one concise sentence:\n\n"${fullProse.slice(0, 3000)}"`
    const summaryResponse = await aiGenerate(
      summaryPrompt,
      'Summarize the scene in one sentence.',
      {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.3,
        maxTokens: 200
      }
    )
    return summaryResponse
      .replace(/^Summary:\s*/i, '')
      .replace(/(^")|("$)/g, '')
      .trim()
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Fallback slice summary used:', err)
    return fullProse.slice(0, 150).replace(/\s+\S*$/, '') + '...'
  }
}

export async function parallelWithLimit(tasks, limit = 3) {
  const results = []
  const executing = []
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task())
    results.push(p)
    const e = p.then(
      () => {
        const idx = executing.indexOf(e)
        if (idx !== -1) executing.splice(idx, 1)
      },
      () => {
        const idx = executing.indexOf(e)
        if (idx !== -1) executing.splice(idx, 1)
      }
    )
    executing.push(e)
    if (executing.length >= limit) await Promise.race(executing)
  }
  return Promise.all(results)
}
