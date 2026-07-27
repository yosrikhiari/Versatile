import { getOllamaEndpoint } from '../config/ollama'
import { aiGenerate, aiStream } from '../composables/useAiService'
import { FEATURES } from '../config/ai'
import { STORAGE_KEYS } from '../config/storageKeys'
import Dexie from 'dexie'

const LOG_PREFIX = '[OllamaService]'

function log(...args: unknown[]) {
  console.debug(LOG_PREFIX, ...args)
}

const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'

const embeddingDB = new Dexie('VersatileEmbeddings')
embeddingDB.version(1).stores({
  embeddings: 'key, embedding, text, timestamp'
})

const CRYPTO_KEY_NAME = 'versatile-crypto-key'

interface EmbeddingRecord {
  key: string
  embedding: number[]
  text: string
  timestamp: number
}

type EmbeddingCacheEntry = Omit<EmbeddingRecord, 'key'>

async function getCryptoKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(CRYPTO_KEY_NAME)
  if (stored) {
    const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt'
    ])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt'
  ])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  localStorage.setItem(CRYPTO_KEY_NAME, btoa(String.fromCharCode(...raw)))
  return key
}

export async function encrypt(text: string): Promise<string> {
  try {
    const key = await getCryptoKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(text)
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)
    return btoa(String.fromCharCode(...combined))
  } catch {
    return ''
  }
}

function legacyDeobfuscate(encoded: string): string {
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
    )
  } catch {
    return ''
  }
}
export { legacyDeobfuscate as deobfuscate }

export async function decrypt(encoded: string): Promise<string> {
  try {
    const key = await getCryptoKey()
    const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(decrypted)
  } catch {
    const legacy = legacyDeobfuscate(encoded)
    if (legacy) return legacy
    return ''
  }
}

export async function getStoredOpenAIKey(): Promise<string | null> {
  const encrypted = localStorage.getItem(STORAGE_KEYS.OPENAI_KEY)
  if (!encrypted) return null
  try {
    return await decrypt(encrypted)
  } catch {
    return legacyDeobfuscate(encrypted) || null
  }
}

export async function setStoredOpenAIKey(key: string | null) {
  localStorage.setItem(STORAGE_KEYS.OPENAI_KEY, key ? await encrypt(key) : '')
}

export async function hasOpenAIKey(): Promise<boolean> {
  return !!(await getStoredOpenAIKey())
}

export function hasPromptedForOpenAI(): boolean {
  return localStorage.getItem(STORAGE_KEYS.OPENAI_FALLBACK_PROMPTED) === 'true'
}

const CONNECTION_TEST_PROMPT = `Respond with 'OK' only. No other text.`

export async function testOllamaConnection(): Promise<{ success: boolean; message: string }> {
  if (await hasOpenAIKey()) {
    return { success: true, message: 'Using OpenAI' }
  }
  try {
    const response = await aiGenerate(CONNECTION_TEST_PROMPT, 'You are a helpful assistant.', {
      feature: FEATURES.CONTENT
    })
    const trimmed = (response as string).trim().toUpperCase()
    return { success: trimmed === 'OK', message: trimmed }
  } catch {
    if (hasPromptedForOpenAI()) {
      return { success: false, message: 'Ollama unavailable. OpenAI not configured.' }
    }
    return { success: false, message: 'Connection failed' }
  }
}

export function setPromptedForOpenAI() {
  localStorage.setItem(STORAGE_KEYS.OPENAI_FALLBACK_PROMPTED, 'true')
}

export function getEmbeddingModel(): string {
  return localStorage.getItem(STORAGE_KEYS.EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL
}

export function setEmbeddingModel(model: string) {
  localStorage.setItem(STORAGE_KEYS.EMBEDDING_MODEL, model)
}

function embeddings() {
  return embeddingDB.table<EmbeddingRecord>('embeddings')
}

export async function getEmbeddingCache(): Promise<Record<string, EmbeddingCacheEntry>> {
  try {
    const all = await embeddings().toArray()
    return all.reduce<Record<string, EmbeddingCacheEntry>>((acc, item) => {
      acc[item.key] = { embedding: item.embedding, text: item.text, timestamp: item.timestamp }
      return acc
    }, {})
  } catch {
    return {}
  }
}

export async function setEmbeddingCache(cache: Record<string, EmbeddingCacheEntry>) {
  try {
    const entries = Object.entries(cache).map(([key, value]) => ({
      key,
      embedding: value.embedding,
      text: value.text,
      timestamp: value.timestamp
    }))
    await embeddings().clear()
    await embeddings().bulkAdd(entries)
  } catch (e) {
    console.warn('Failed to save embedding cache:', e)
  }
}

export async function clearEmbeddingCache() {
  await embeddings().clear()
}

export function cosineSimilarity(a: number[], b: number[]): number {
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

export async function ollamaEmbeddings(text: string, model: string | null = null): Promise<number[] | null> {
  if (!text || text.trim().length === 0) {
    return null
  }

  const embeddingModel = model || getEmbeddingModel()
  log('Generating embedding with model:', embeddingModel, 'text length:', text.length)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: embeddingModel,
        input: text
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
    const embedding = data.embeddings?.[0]
    log('Embedding generated, dimensions:', embedding?.length || 0)
    return embedding
  } catch (error) {
    clearTimeout(timeout)
    log('Ollama embeddings failed:', (error as Error).message)
    throw error
  }
}

export async function getEmbedding(
  entityType: string,
  entityId: string,
  fullText: string
): Promise<number[] | null> {
  const cache = await getEmbeddingCache()
  const cacheKey = `${entityType}_${entityId}`
  const cached = cache[cacheKey]

  if (cached?.text === fullText) {
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
    log('Failed to get embedding:', (error as Error).message)
    return null
  }
}

export async function getAvailableEmbeddingModels(): Promise<string[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(`${getOllamaEndpoint()}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    if (response.ok) {
      const data = await response.json()
      const allModels: string[] = data.models?.map((m: any) => m.name) || []
      const embeddingModels = allModels.filter(
        m => m.includes('embed') || m.includes('nomic') || m.includes('e5') || m.includes('bge')
      )
      return embeddingModels.length > 0 ? embeddingModels : allModels.slice(0, 5)
    }
    return []
  } catch {
    return []
  }
}

export async function checkEmbeddingModelAvailable(model: string | null = null): Promise<boolean> {
  const modelToCheck = model || getEmbeddingModel()
  try {
    const testEmbedding = await ollamaEmbeddings('test', modelToCheck)
    return testEmbedding !== null
  } catch {
    return false
  }
}

export async function ollamaGenerate(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  return await aiGenerate(prompt, systemPrompt, { feature: FEATURES.CONTENT })
}

export async function ollamaStream(
  prompt: string,
  systemPrompt: string,
  onChunk: (chunk: string) => void
): Promise<unknown> {
  return await aiStream(prompt, systemPrompt, onChunk, { feature: FEATURES.CONTENT })
}

export async function checkOllamaHealth(): Promise<{ online: boolean; message: string }> {
  try {
    const ok = await checkOllamaConnection()
    if (!ok)
      return {
        online: false,
        message: 'Ollama is not reachable. Make sure it is running on port 11434.'
      }
    return { online: true, message: 'Ollama is reachable.' }
  } catch {
    return {
      online: false,
      message: 'Ollama is not reachable. Make sure it is running on port 11434.'
    }
  }
}

export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${getOllamaEndpoint()}/api/tags`, {
      signal: controller.signal
    })

    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

export async function checkOpenAIConnection(apiKey: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal
    })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

export async function getAvailableModels(): Promise<string[]> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(`${getOllamaEndpoint()}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    if (response.ok) {
      const data = await response.json()
      return data.models?.map((m: any) => m.name) || []
    }
    return []
  } catch {
    return []
  }
}
