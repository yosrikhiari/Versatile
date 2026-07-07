import { aiGenerate } from '../../useAiService'
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
    if (error.message === 'Invalid JSON') {
      throw new Error('Model returned malformed JSON. The response could not be parsed.')
    }
    throw error
  }
}

function isValid(parsed, schema) {
  const alternates = [
    schema.modelKeys,
    schema.promptKeys
  ]
  const keys = alternates.find((k) => k?.length) || schema.modelKeys
  return keys.every((key) => {
    const val = parsed[key] ?? parsed[key.charAt(0).toUpperCase() + key.slice(1)]
    return val !== undefined && val !== null && val !== ''
  })
}

function buildEntity(parsed, schema) {
  const result = {}
  for (const key of schema.modelKeys) {
    result[key] = normalizeField(parsed, key)
  }
  return result
}
