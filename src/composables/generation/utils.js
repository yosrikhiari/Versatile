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

/**
 * Strip the wrappers models put around a one-line summary.
 *
 * Peels in a loop rather than one pass because the two wrappers nest in either
 * order — `Summary: "X"` and `"Summary: X"` both occur. The original stripped
 * the prefix first and the quotes second, so the latter left `Summary: X`
 * stranded in the chapter log.
 */
function cleanSummary(text) {
  let out = String(text).trim()
  for (let i = 0; i < 3; i++) {
    const before = out
    out = out
      .replace(/^summary:\s*/i, '')
      .replace(/^["']|["']$/g, '')
      .trim()
    if (out === before) break
  }
  return out
}

/** Last resort: the opening of the prose, cut at a word boundary. */
function sliceSummary(fullProse) {
  return String(fullProse || '')
    .slice(0, 150)
    .replace(/\s+\S*$/, '')
    .concat('...')
}

/**
 * One-sentence summary of a scene, for the chapter log.
 *
 * Prefers the summary the writer already produced. This used to be an
 * unconditional `aiGenerate` — a whole extra round-trip, with a 3,000-char
 * prompt, asking the model to summarize prose it had just written itself. At one
 * per scene that was ~30 calls on a 30-scene volume: 13-23% of the entire call
 * budget of a run, spent on a task the writer was already mid-way through.
 *
 * The writer emits structured JSON regardless (prose, usedEntities, newEntities,
 * networkEvents, keyFacts), so a `summary` field costs ~20 output tokens on a
 * request already in flight. The LLM path stays as the fallback for callers with
 * no structured output and for models that ignore the field.
 *
 * @param {string} fullProse
 * @param {object} [structured] The writer's parsed JSON, when the caller has it.
 * @returns {Promise<string>}
 */
export async function computeSummary(fullProse, structured) {
  const provided = structured?.summary
  if (typeof provided === 'string' && provided.trim()) return cleanSummary(provided)

  try {
    const summaryPrompt = `You are a copyeditor. Summarize the following narrative scene in exactly one concise sentence:\n\n"${String(fullProse || '').slice(0, 3000)}"`
    const summaryResponse = await aiGenerate(
      summaryPrompt,
      'Summarize the scene in one sentence.',
      {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.3,
        maxTokens: 200
      }
    )
    return cleanSummary(summaryResponse)
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] Fallback slice summary used:', err)
    return sliceSummary(fullProse)
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
