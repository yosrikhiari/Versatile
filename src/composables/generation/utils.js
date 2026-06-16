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
  if (!error) return new Error('Generation failed. Ensure Ollama is running and your model is loaded.')
  const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
  throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
}


