import { sanitizeJson } from '../services/ai/aiHelpers'
import {
  aiGenerate,
  aiStream,
  aiGenerateStructured,
  resolveFeatureConfig
} from '../services/aiService'

export { aiGenerate, aiStream, aiGenerateStructured, resolveFeatureConfig }

export async function aiGenerateJson(prompt, systemPrompt, options = {}) {
  // When the caller supplies a JSON `schema`, prefer native structured output
  // (Anthropic tool-use / OpenAI json_schema / Ollama grammar) — aiGenerateStructured
  // handles its own text+sanitize fallback for providers/models that don't
  // support it, so this never regresses below the old behaviour. Schema-less
  // callers keep the original generate + sanitize path byte-for-byte.
  if (options.schema && typeof aiGenerateStructured === 'function') {
    return aiGenerateStructured(prompt, systemPrompt, options)
  }
  const text = await aiGenerate(prompt, systemPrompt, options)
  const parsed = sanitizeJson(text)
  if (!parsed) {
    throw new Error('Failed to parse JSON response from AI')
  }
  return parsed
}
