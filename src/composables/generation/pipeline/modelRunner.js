import { aiGenerate } from '../../useAiService'
import { FEATURES } from '../../../config/ai'
import { sanitizeJsonResponse, normalizeField } from '../utils'

// aiGenerate already owns transport retries + provider fallback, so we do NOT
// re-wrap it in retryWithBackoff here — that stacked up to ~15 sequential calls
// before one entity failed, and retried non-retryable 400s five times. The only
// failure aiGenerate can't fix is a syntactically-malformed JSON body, so we
// keep a single reparse retry (a fresh generation) for that case alone.
const MAX_PARSE_RETRIES = 1

export async function executeGeneration({ userPrompt, systemPrompt, schema, complexity, workspaceType }) {
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    // Transport/auth errors propagate out of the loop as-is (aiGenerate has
    // already retried + fallen back); we don't re-retry them here.
    const response = await aiGenerate(userPrompt, systemPrompt, {
      feature: FEATURES.WORLDBUILDING,
      complexity: complexity || undefined,
      workspaceType
    })

    const parsed = sanitizeJsonResponse(response)
    if (parsed && isValid(parsed, schema)) {
      return buildEntity(parsed, schema)
    }
  }

  throw new Error('Model returned malformed JSON. The response could not be parsed.')
}

function isValid(parsed, schema) {
  const alternates = [schema.modelKeys, schema.promptKeys]
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
