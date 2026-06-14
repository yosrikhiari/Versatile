import { aiGenerate } from '../../../services/aiService'
import { FEATURES } from '../../../config/ai'
import { retryWithBackoff, sanitizeJsonResponse, normalizeField } from '../utils'
import { debugSnapshot } from '../../../services/debugSnapshot'

export async function executeGeneration({ userPrompt, systemPrompt, schema }) {
  try {
    debugSnapshot(`model-runner-${schema.type}-call`, {
      entityType: schema.type,
      userPromptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
      feature: FEATURES.WORLDBUILDING
    })

    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, systemPrompt, { feature: FEATURES.WORLDBUILDING })
    )

    debugSnapshot(`model-runner-${schema.type}-raw-response`, {
      entityType: schema.type,
      responseLength: response?.length || 0,
      responsePreview: response?.slice(0, 500) || '(empty)'
    })

    const parsed = sanitizeJsonResponse(response)

    debugSnapshot(`model-runner-${schema.type}-parsed`, {
      entityType: schema.type,
      parseSuccess: !!parsed,
      parsedKeys: parsed ? Object.keys(parsed) : [],
      parsed
    })

    if (!parsed || !isValid(parsed, schema)) {
      debugSnapshot(`model-runner-${schema.type}-validation-fail`, {
        entityType: schema.type,
        hasParsed: !!parsed,
        requiredField: schema.promptKeys[0],
        requiredFieldFound: parsed ? !!(parsed[schema.promptKeys[0]] || parsed[schema.promptKeys[0].charAt(0).toUpperCase() + schema.promptKeys[0].slice(1)]) : false
      })
      throw new Error('Invalid JSON')
    }

    const entity = buildEntity(parsed, schema)

    debugSnapshot(`model-runner-${schema.type}-built`, {
      entityType: schema.type,
      entity
    })

    return entity
  } catch (error) {
    debugSnapshot(`model-runner-${schema.type}-error`, {
      entityType: schema.type,
      errorMessage: error?.message || 'Unknown error',
      errorStack: error?.stack?.slice(0, 500) || ''
    })
    if (error) throw error
    throw new Error('Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

function isValid(parsed, schema) {
  const requiredFirstField = schema.promptKeys[0]
  return !!(parsed[requiredFirstField] || parsed[requiredFirstField.charAt(0).toUpperCase() + requiredFirstField.slice(1)])
}

function buildEntity(parsed, schema) {
  const result = {}
  for (const key of schema.modelKeys) {
    result[key] = normalizeField(parsed, key)
  }
  return result
}
