import { getOllamaEndpoint } from '../config/ollama'
import {
  EMBEDDING_PROVIDERS,
  EMBEDDING_DEFAULTS,
  EMBEDDING_PROVIDER_CAPABILITIES
} from '../config/ai'
import { getBulkCachedEmbeddings, setEmbeddingCacheEntry } from './researchDb'

const BACKEND_API_BASE = '/api'
const MISTRAL_API_URL = `${BACKEND_API_BASE}/embedding/mistral`

export function hasMistralKey(): boolean {
  return true
}

const embeddingCache = new Map<string, Float32Array>()

const MAX_CACHE_SIZE = 5000

function ensureCacheSize(): void {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    const halfSize = Math.floor(MAX_CACHE_SIZE / 2)
    const keysToDelete = [...embeddingCache.keys()].slice(0, embeddingCache.size - halfSize)
    for (const key of keysToDelete) {
      embeddingCache.delete(key)
    }
  }
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear()
}

export function getEmbeddingCacheSize(): number {
  return embeddingCache.size
}

async function embedBatch(inputs: string[], model: string | null, provider: string): Promise<(Float32Array | null)[]> {
  if (inputs.length === 0) return []

  const caps =
    EMBEDDING_PROVIDER_CAPABILITIES[provider as keyof typeof EMBEDDING_PROVIDER_CAPABILITIES] ||
    EMBEDDING_PROVIDER_CAPABILITIES[EMBEDDING_PROVIDERS.OLLAMA as keyof typeof EMBEDDING_PROVIDER_CAPABILITIES]
  const batchSize = caps.maxBatchSize || 32

  if (inputs.length <= batchSize) {
    return embedBatchInternal(inputs, model, provider)
  }

  const maxConcurrent = caps.maxConcurrentRequests || 1

  const batches: string[][] = []
  for (let i = 0; i < inputs.length; i += batchSize) {
    batches.push(inputs.slice(i, i + batchSize))
  }

  const results: ((Float32Array | null)[])[] = new Array(batches.length)
  let nextBatch = 0

  async function worker(): Promise<void> {
    while (nextBatch < batches.length) {
      const idx = nextBatch++
      results[idx] = await embedBatchInternal(batches[idx], model, provider)
    }
  }

  const poolSize = Math.min(maxConcurrent, batches.length)
  const workers = Array.from({ length: poolSize }, () => worker())
  await Promise.all(workers)

  return results.flat()
}

interface EmbeddingApiResult {
  vectors: (Float32Array | null)[]
  provider: string | null
  model: string | null
}

async function embedBatchInternal(inputs: string[], model: string | null, provider: string): Promise<(Float32Array | null)[]> {
  if (inputs.length === 0) return []

  const keyModel =
    model || (provider === EMBEDDING_PROVIDERS.MISTRAL ? 'mistral-embed' : 'nomic-embed-text')
  const keyPrefix = `${provider}:${keyModel}:`
  const hashes = await Promise.all(inputs.map((t) => sha256(keyPrefix + t)))
  const results: (Float32Array | null)[] = new Array(inputs.length)
  const uncachedInputs: string[] = []
  const uncachedIndices: number[] = []

  for (let i = 0; i < inputs.length; i++) {
    const cached = embeddingCache.get(hashes[i])
    if (cached !== undefined) {
      results[i] = cached
    } else {
      uncachedInputs.push(inputs[i])
      uncachedIndices.push(i)
    }
  }

  if (uncachedInputs.length > 0) {
    const dexieCached = await getBulkCachedEmbeddings(uncachedIndices.map((idx) => hashes[idx]))
    if (dexieCached.size > 0) {
      const stillUncachedInputs: string[] = []
      const stillUncachedIndices: number[] = []
      for (let i = 0; i < uncachedIndices.length; i++) {
        const hash = hashes[uncachedIndices[i]]
        const dexieEntry = dexieCached.get(hash)
        if (dexieEntry) {
          results[uncachedIndices[i]] = dexieEntry
          embeddingCache.set(hash, dexieEntry)
        } else {
          stillUncachedInputs.push(uncachedInputs[i])
          stillUncachedIndices.push(uncachedIndices[i])
        }
      }
      uncachedInputs.length = 0
      uncachedIndices.length = 0
      uncachedInputs.push(...stillUncachedInputs)
      uncachedIndices.push(...stillUncachedIndices)
    }
  }

  if (uncachedInputs.length === 0) return results

  let apiResults: number[][]
  switch (provider) {
    case EMBEDDING_PROVIDERS.MISTRAL: {
      const controller = new AbortController()
      const timeout = setTimeout(
        () =>
          controller.abort(
            new DOMException('Embedding request timed out after 300000ms', 'AbortError')
          ),
        300000
      )
      try {
        const response = await fetch(MISTRAL_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model || 'mistral-embed', input: uncachedInputs }),
          signal: controller.signal
        })
        clearTimeout(timeout)
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error?.message || `Mistral error: ${response.status}`)
        }
        const data: { data: { embedding: number[] }[] } = await response.json()
        apiResults = data.data.map((d) => d.embedding)
      } catch (error) {
        clearTimeout(timeout)
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Embedding request timed out after 300000ms')
        }
        throw error
      }
      break
    }
    case EMBEDDING_PROVIDERS.OLLAMA:
    default: {
      const controller = new AbortController()
      const timeout = setTimeout(
        () =>
          controller.abort(
            new DOMException('Embedding request timed out after 300000ms', 'AbortError')
          ),
        300000
      )
      try {
        const response = await fetch(`${getOllamaEndpoint()}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'nomic-embed-text',
            input: uncachedInputs,
            keep_alive: '5m'
          }),
          signal: controller.signal
        })
        clearTimeout(timeout)
        if (!response.ok) {
          let detail = ''
          try {
            const errBody = await response.json()
            detail = errBody.error || JSON.stringify(errBody)
          } catch {
            // Error body wasn't JSON; throw with status only (below).
          }
          throw new Error(`Ollama embeddings error (${response.status}): ${detail}`.trim())
        }
        const data: { embeddings: number[][] } = await response.json()
        apiResults = data.embeddings
      } catch (error) {
        clearTimeout(timeout)
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Embedding request timed out after 300000ms')
        }
        throw error
      }
      break
    }
  }

  const dexieWrites: Promise<void>[] = []
  for (let i = 0; i < apiResults.length; i++) {
    const raw = apiResults[i]
    const embedding = raw ? new Float32Array(raw) : null
    const idx = uncachedIndices[i]
    results[idx] = embedding
    if (embedding) {
      embeddingCache.set(hashes[idx], embedding)
      dexieWrites.push(setEmbeddingCacheEntry(hashes[idx], embedding))
    }
  }
  ensureCacheSize()
  if (dexieWrites.length > 0) {
    Promise.all(dexieWrites).catch(() => {})
  }

  return results
}

export async function getEmbedding(text: string, options: { provider?: string; model?: string } = {}): Promise<Float32Array | null> {
  const provider = options.provider || EMBEDDING_PROVIDERS.OLLAMA
  const model = options.model || null
  const results = await embedBatch([text], model, provider)
  return results[0] || null
}

export async function getEmbeddings(texts: string[], options: { provider?: string; model?: string } = {}): Promise<EmbeddingApiResult> {
  const valid = texts.map((t, i) => ({ text: t, index: i }))
  const toEmbed = valid.filter((v) => v.text && v.text.trim())
  if (toEmbed.length === 0) return { vectors: texts.map(() => null), provider: null, model: null }

  const uniqueMap = new Map<string, number[]>()
  for (const v of toEmbed) {
    if (!uniqueMap.has(v.text)) {
      uniqueMap.set(v.text, [v.index])
    } else {
      uniqueMap.get(v.text)!.push(v.index)
    }
  }
  const uniqueTexts = [...uniqueMap.keys()]

  const provider = options.provider || EMBEDDING_DEFAULTS.provider
  const model = options.model || EMBEDDING_DEFAULTS.model

  const t0 = performance.now()
  const vectors = await embedBatch(uniqueTexts, model, provider)
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  if (uniqueTexts.length !== toEmbed.length) {
    console.debug(
      `[embedding] deduped ${toEmbed.length} inputs → ${uniqueTexts.length} unique, embedded in ${elapsed}s`
    )
  } else if (Number(elapsed) > 2) {
    console.debug(`[embedding] ${uniqueTexts.length} inputs embedded in ${elapsed}s`)
  }

  const results: (Float32Array | null)[] = texts.map(() => null)
  let vi = 0
  for (const text of uniqueMap.keys()) {
    const indices = uniqueMap.get(text)!
    const vec = vectors[vi] || null
    for (const idx of indices) {
      results[idx] = vec
    }
    vi++
  }
  return { vectors: results, provider, model }
}
