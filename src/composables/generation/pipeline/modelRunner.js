import { aiGenerate } from '../../../services/aiService'
import { FEATURES } from '../../../config/ai'
import { retryWithBackoff, sanitizeJsonResponse, normalizeField } from '../utils'

export async function executeGeneration({ userPrompt, systemPrompt, schema }) {
  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, systemPrompt, { feature: FEATURES.WORLDBUILDING })
    )

    const parsed = sanitizeJsonResponse(response)

    if (!parsed || !isValid(parsed, schema)) {
      throw new Error('Invalid JSON')
    }

    const entity = buildEntity(parsed, schema)

    return entity
  } catch (error) {
    if (error) throw error
    throw new Error('Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

function isValid(parsed, schema) {
  const requiredFirstField = schema.promptKeys[0]
  return !!(
    parsed[requiredFirstField] ||
    parsed[requiredFirstField.charAt(0).toUpperCase() + requiredFirstField.slice(1)]
  )
}

function buildEntity(parsed, schema) {
  const result = {}
  for (const key of schema.modelKeys) {
    result[key] = normalizeField(parsed, key)
  }
  return result
}
