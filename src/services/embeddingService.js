import { getOllamaEndpoint } from '../config/ollama'
import { EMBEDDING_PROVIDERS, EMBEDDING_DEFAULTS } from '../config/ai'

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

async function embedBatch(inputs, model, provider) {
  if (inputs.length === 0) return []

  switch (provider) {
    case EMBEDDING_PROVIDERS.MISTRAL: {
      if (!mistralApiKey) throw new Error('Mistral API key not configured in .env')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)
      try {
        const response = await fetch(MISTRAL_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralApiKey}`
          },
          body: JSON.stringify({ model: model || 'mistral-embed', input: inputs }),
          signal: controller.signal
        })
        clearTimeout(timeout)
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error?.message || `Mistral error: ${response.status}`)
        }
        const data = await response.json()
        return data.data.map(d => d.embedding)
      } catch (error) {
        clearTimeout(timeout)
        throw error
      }
    }
    case EMBEDDING_PROVIDERS.OLLAMA:
    default: {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)
      try {
        const response = await fetch(`${getOllamaEndpoint()}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model || 'nomic-embed-text', input: inputs }),
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
        return data.embeddings
      } catch (error) {
        clearTimeout(timeout)
        throw error
      }
    }
  }
}

export async function getEmbedding(text, options = {}) {
  const provider = options.provider || EMBEDDING_PROVIDERS.OLLAMA
  const model = options.model
  const results = await embedBatch([text], model, provider)
  return results[0] || null
}

export async function getEmbeddings(texts, options = {}) {
  const valid = texts.map((t, i) => ({ text: t, index: i }))
  const toEmbed = valid.filter(v => v.text && v.text.trim())
  if (toEmbed.length === 0) return { vectors: texts.map(() => null), provider: null, model: null }

  const provider = options.provider || EMBEDDING_DEFAULTS.provider
  const model = options.model || EMBEDDING_DEFAULTS.model
  const vectors = await embedBatch(toEmbed.map(v => v.text), model, provider)

  const results = texts.map(() => null)
  for (let i = 0; i < toEmbed.length; i++) {
    results[toEmbed[i].index] = vectors[i] || null
  }
  return { vectors: results, provider, model }
}
