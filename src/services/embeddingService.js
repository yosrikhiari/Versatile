import { getOllamaEndpoint } from '../config/ollama'
import { EMBEDDING_PROVIDERS } from '../config/ai'

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/embeddings'

let mistralApiKey = null
try {
  if (import.meta.env.VITE_MISTRAL_API_KEY) {
    mistralApiKey = import.meta.env.VITE_MISTRAL_API_KEY
  }
} catch {
}

export function hasMistralKey() {
  return !!mistralApiKey
}

async function ollamaEmbed(text, model) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!response.ok) {
      let detail = ''
      try {
        const errBody = await response.json()
        detail = errBody.error || JSON.stringify(errBody)
      } catch {}
      throw new Error(`Ollama embeddings error (${response.status}): ${detail}`.trim())
    }
    const data = await response.json()
    return data.embedding
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

async function mistralEmbed(text, model) {
  if (!mistralApiKey) throw new Error('Mistral API key not configured in .env')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        model: model || 'mistral-embed',
        input: text
      }),
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Mistral error: ${response.status}`)
    }

    const data = await response.json()
    return data.data[0]?.embedding
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

export async function getEmbedding(text, options = {}) {
  const provider = options.provider || EMBEDDING_PROVIDERS.OLLAMA
  const model = options.model

  switch (provider) {
    case EMBEDDING_PROVIDERS.MISTRAL:
      return await mistralEmbed(text, model)
    case EMBEDDING_PROVIDERS.OLLAMA:
    default:
      return await ollamaEmbed(text, model || 'nomic-embed-text')
  }
}

export async function getEmbeddings(texts, options = {}) {
  const results = []
  for (const text of texts) {
    if (!text || !text.trim()) {
      results.push(null)
      continue
    }
    try {
      const embedding = await getEmbedding(text, options)
      results.push(embedding)
    } catch {
      results.push(null)
    }
  }
  return results
}
