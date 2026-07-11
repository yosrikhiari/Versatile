import { sanitizeJson } from '../services/ai/aiHelpers'
import { aiGenerate, aiStream, resolveFeatureConfig } from '../services/aiService'

export { aiGenerate, aiStream, resolveFeatureConfig }

export async function aiGenerateJson(prompt, systemPrompt, options = {}) {
  const text = await aiGenerate(prompt, systemPrompt, options)
  const parsed = sanitizeJson(text)
  if (!parsed) {
    throw new Error('Failed to parse JSON response from AI')
  }
  return parsed
}
