import { OLLAMA_BASE_URL } from '../config/ollama'
import { aiGenerate, aiStream } from './aiService'
import { PROVIDERS, FEATURES } from '../config/ai'
import Dexie from 'dexie'

const LOG_PREFIX = '[OllamaService]'

function log(...args) {
  console.log(LOG_PREFIX, ...args)
}

const OPENAI_KEY_STORAGE = 'versatile_openai_key'
const OPENAI_FALLBACK_PROMPTED = 'versatile_openai_prompted'

const EMBEDDING_MODEL_STORAGE = 'versatile_embedding_model'
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'

const embeddingDB = new Dexie('VersatileEmbeddings')
embeddingDB.version(1).stores({
  embeddings: 'key, embedding, text, timestamp'
})

export function simpleEncrypt(text) {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    return btoa(String.fromCharCode(...data))
  } catch {
    return text
  }
}

export function simpleDecrypt(encoded) {
  try {
    const binaryString = atob(encoded)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return encoded
  }
}

export function getStoredOpenAIKey() {
  const encrypted = localStorage.getItem(OPENAI_KEY_STORAGE)
  if (!encrypted) return null
  return simpleDecrypt(encrypted)
}

export function setStoredOpenAIKey(key) {
  const encrypted = simpleEncrypt(key)
  localStorage.setItem(OPENAI_KEY_STORAGE, encrypted)
}

export function hasOpenAIKey() {
  return !!getStoredOpenAIKey()
}

export function hasPromptedForOpenAI() {
  return localStorage.getItem(OPENAI_FALLBACK_PROMPTED) === 'true'
}

export function setPromptedForOpenAI() {
  localStorage.setItem(OPENAI_FALLBACK_PROMPTED, 'true')
}

export function getEmbeddingModel() {
  return localStorage.getItem(EMBEDDING_MODEL_STORAGE) || DEFAULT_EMBEDDING_MODEL
}

export function setEmbeddingModel(model) {
  localStorage.setItem(EMBEDDING_MODEL_STORAGE, model)
}

export async function getEmbeddingCache() {
  try {
    const all = await embeddingDB.embeddings.toArray()
    return all.reduce((acc, item) => {
      acc[item.key] = { embedding: item.embedding, text: item.text, timestamp: item.timestamp }
      return acc
    }, {})
  } catch {
    return {}
  }
}

export async function setEmbeddingCache(cache) {
  try {
    const entries = Object.entries(cache).map(([key, value]) => ({
      key,
      embedding: value.embedding,
      text: value.text,
      timestamp: value.timestamp
    }))
    await embeddingDB.embeddings.clear()
    await embeddingDB.embeddings.bulkAdd(entries)
  } catch (e) {
    console.warn('Failed to save embedding cache:', e)
  }
}

export async function clearEmbeddingCache() {
  await embeddingDB.embeddings.clear()
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function ollamaEmbeddings(text, model = null) {
  if (!text || text.trim().length === 0) {
    return null
  }

  const embeddingModel = model || getEmbeddingModel()
  log('Generating embedding with model:', embeddingModel, 'text length:', text.length)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: embeddingModel,
        prompt: text
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text()
      log('Ollama embeddings error:', response.status, errorText)
      throw new Error(`Ollama embeddings error: ${response.status}`)
    }

    const data = await response.json()
    log('Embedding generated, dimensions:', data.embedding?.length || 0)
    return data.embedding
  } catch (error) {
    clearTimeout(timeout)
    log('Ollama embeddings failed:', error.message)
    throw error
  }
}

export async function getEmbedding(entityType, entityId, fullText) {
  const cache = await getEmbeddingCache()
  const cacheKey = `${entityType}_${entityId}`
  const cached = cache[cacheKey]

  if (cached && cached.text === fullText) {
    log('Using cached embedding for:', cacheKey)
    return cached.embedding
  }

  try {
    const embedding = await ollamaEmbeddings(fullText)
    if (embedding) {
      cache[cacheKey] = { embedding, text: fullText, timestamp: Date.now() }
      await setEmbeddingCache(cache)
    }
    return embedding
  } catch (error) {
    log('Failed to get embedding:', error.message)
    return null
  }
}

export async function getAvailableEmbeddingModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (response.ok) {
      const data = await response.json()
      const allModels = data.models?.map(m => m.name) || []
      const embeddingModels = allModels.filter(m => 
        m.includes('embed') || m.includes('nomic') || m.includes('e5') || m.includes('bge')
      )
      return embeddingModels.length > 0 ? embeddingModels : allModels.slice(0, 5)
    }
    return []
  } catch {
    return []
  }
}

export async function checkEmbeddingModelAvailable(model = null) {
  const modelToCheck = model || getEmbeddingModel()
  try {
    const testEmbedding = await ollamaEmbeddings('test', modelToCheck)
    return testEmbedding !== null
  } catch {
    return false
  }
}

function sanitizeJSON(text) {
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return cleaned
}

function parseJSONWithRetry(text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const cleaned = sanitizeJSON(text)
      return JSON.parse(cleaned)
    } catch (e) {
      if (i === retries - 1) throw e
      if (text.includes('```')) {
        text = text.replace(/```[\s\S]*?```/g, '')
      }
    }
  }
  throw new Error('Failed to parse JSON after retries')
}

export async function ollamaGenerate(prompt, systemPrompt) {
  return await aiGenerate(prompt, systemPrompt, { feature: FEATURES.CONTENT })
}

export async function ollamaStream(prompt, systemPrompt, onChunk) {
  return await aiStream(prompt, systemPrompt, onChunk, { feature: FEATURES.CONTENT })
}

export async function checkOllamaConnection() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

export async function checkOpenAIConnection(apiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    })
    return response.ok
  } catch {
    return false
  }
}

export async function getAvailableModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
    if (response.ok) {
      const data = await response.json()
      return data.models?.map(m => m.name) || []
    }
    return []
  } catch {
    return []
  }
}

export { sanitizeJSON, parseJSONWithRetry }
