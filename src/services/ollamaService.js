import { OLLAMA_MODEL, OLLAMA_BASE_URL } from '../config/ollama'

const LOG_PREFIX = '[OllamaService]'

function log(...args) {
  console.log(LOG_PREFIX, ...args)
}

const OPENAI_KEY_STORAGE = 'versatile_openai_key'
const OPENAI_FALLBACK_PROMPTED = 'versatile_openai_prompted'

const EMBEDDING_MODEL_STORAGE = 'versatile_embedding_model'
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'
const EMBEDDING_CACHE_KEY = 'versatile_embedding_cache'

export function getStoredOpenAIKey() {
  return localStorage.getItem(OPENAI_KEY_STORAGE)
}

export function setStoredOpenAIKey(key) {
  localStorage.setItem(OPENAI_KEY_STORAGE, key)
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

export function getEmbeddingCache() {
  try {
    const cached = localStorage.getItem(EMBEDDING_CACHE_KEY)
    return cached ? JSON.parse(cached) : {}
  } catch {
    return {}
  }
}

export function setEmbeddingCache(cache) {
  localStorage.setItem(EMBEDDING_CACHE_KEY, JSON.stringify(cache))
}

export function clearEmbeddingCache() {
  localStorage.removeItem(EMBEDDING_CACHE_KEY)
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
  const cache = getEmbeddingCache()
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
      setEmbeddingCache(cache)
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
  const openaiKey = getStoredOpenAIKey()
  
  if (openaiKey) {
    try {
      return await openaiGenerateWithOpenAI(prompt, systemPrompt, openaiKey)
    } catch (error) {
      throw error
    }
  }
  
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180000)

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: systemPrompt,
        prompt: prompt,
        stream: false
      }),
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    
    if (!response.ok) {
      if (response.status === 500 || response.status === 503) {
        return await handleOllamaFallback(prompt, systemPrompt)
      }
      throw new Error(`Ollama error: ${response.status}`)
    }
    const data = await response.json()
    return data.response
  } catch (error) {
    clearTimeout(timeout)
    if (error.name === 'AbortError' || error.message.includes('Ollama error')) {
      return await handleOllamaFallback(prompt, systemPrompt)
    }
    throw error
  }
}

export async function ollamaStream(prompt, systemPrompt, onChunk) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: systemPrompt,
        prompt: prompt,
        stream: true
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      if (response.status === 500 || response.status === 503) {
        return await handleOllamaFallback(prompt, systemPrompt)
      }
      throw new Error(`Ollama error: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.response) {
            fullResponse += parsed.response
            if (onChunk) {
              onChunk(parsed.response, fullResponse)
            }
          }
        } catch {}
      }
    }

    return fullResponse
  } catch (error) {
    clearTimeout(timeout)
    if (error.name === 'AbortError' || error.message.includes('Ollama error')) {
      return await handleOllamaFallback(prompt, systemPrompt)
    }
    throw error
  }
}

async function handleOllamaFallback(prompt, systemPrompt) {
  if (hasOpenAIKey()) {
    return await openaiGenerateWithOpenAI(prompt, systemPrompt, getStoredOpenAIKey())
  }
  
  if (hasPromptedForOpenAI()) {
    throw new Error('Ollama unavailable. Please configure OpenAI API key in settings.')
  }
  
  throw new Error('Ollama unavailable. Would you like to use OpenAI instead?')
}

async function openaiGenerateWithOpenAI(prompt, systemPrompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7
    })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || `OpenAI error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.choices[0]?.message?.content || ''
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
