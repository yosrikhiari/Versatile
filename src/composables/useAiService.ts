import { sanitizeJson } from '../services/ai/aiHelpers'
import {
  aiGenerate,
  aiStream,
  aiGenerateStructured,
  resolveFeatureConfig,
  type AiGenerateOptions
} from '../services/aiService'

export { aiGenerate, aiStream, aiGenerateStructured, resolveFeatureConfig }

/**
 * `T` is the caller's expected parse shape. It is an assertion, not a guarantee —
 * the model's output is validated by the caller's schema, not by TypeScript.
 */
export async function aiGenerateJson<T = Record<string, unknown>>(
  prompt: any,
  systemPrompt: any,
  options: AiGenerateOptions = {}
): Promise<T> {
  // When the caller supplies a JSON `schema`, prefer native structured output
  // (Anthropic tool-use / OpenAI json_schema / Ollama grammar) — aiGenerateStructured
  // handles its own text+sanitize fallback for providers/models that don't
  // support it, so this never regresses below the old behaviour. Schema-less
  // callers keep the original generate + sanitize path byte-for-byte.
  if (options.schema && typeof aiGenerateStructured === 'function') {
    return (await aiGenerateStructured(prompt, systemPrompt, options)) as T
  }
  const text = await aiGenerate(prompt, systemPrompt, options)
  const parsed = sanitizeJson(text)
  if (!parsed) {
    throw new Error('Failed to parse JSON response from AI')
  }
  return parsed as T
}
