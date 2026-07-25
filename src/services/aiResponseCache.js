import { getEmbedding } from './embeddingService'

const IN_MEMORY_MAX = 1000
const DEXIE_MAX = 10000
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const SEMANTIC_THRESHOLD = 0.95

const inMemoryCache = new Map()

export const cacheStats = { hits: 0, misses: 0, semanticHits: 0 }

export function getCacheStats() {
  return { ...cacheStats }
}

export function resetCacheStats() {
  cacheStats.hits = 0
  cacheStats.misses = 0
  cacheStats.semanticHits = 0
}

export function computeCosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0,
    magA = 0,
    magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB)
  return mag === 0 ? 0 : dot / mag
}

function computeCanonicalKey(provider, model, temperature, feature, systemPrompt, prompt) {
  return { provider, model, temperature, feature, systemPrompt, prompt }
}

async function generateHash(key) {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(key))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

let _db = null
async function getDb() {
  if (!_db) {
    _db = (await import('./db-core.js')).db
  }
  return _db
}

function isCacheable(feature) {
  return feature && (feature.startsWith('writer.') || feature.startsWith('critic.'))
}

function ensureInMemorySize() {
  if (inMemoryCache.size >= IN_MEMORY_MAX) {
    const half = Math.floor(IN_MEMORY_MAX / 2)
    const keys = [...inMemoryCache.keys()].slice(0, inMemoryCache.size - half)
    for (const k of keys) inMemoryCache.delete(k)
  }
}

async function evictDexieEntries() {
  try {
    const db = await getDb()
    const table = db.aiResponseCache
    const cutoff = new Date(Date.now() - TTL_MS).toISOString()

    await table.where('createdAt').below(cutoff).delete()

    const count = await table.count()
    if (count > DEXIE_MAX) {
      const toRemove = count - DEXIE_MAX
      const oldest = await table.orderBy('createdAt').limit(toRemove).toArray()
      const ids = oldest.map((e) => e.hash)
      await table.bulkDelete(ids)
    }
  } catch (err) {
    console.warn('[aiResponseCache] eviction error:', err)
  }
}

export async function lookup(provider, model, temperature, feature, systemPrompt, prompt) {
  if (!isCacheable(feature)) {
    cacheStats.misses++
    return null
  }

  const key = computeCanonicalKey(provider, model, temperature, feature, systemPrompt, prompt)
  const hash = await generateHash(key)

  const memEntry = inMemoryCache.get(hash)
  if (memEntry) {
    memEntry.accessCount++
    cacheStats.hits++
    return memEntry.output
  }

  try {
    const db = await getDb()
    const row = await db.aiResponseCache.get(hash)
    if (row) {
      ensureInMemorySize()
      inMemoryCache.set(hash, { output: row.output, createdAt: row.createdAt, accessCount: 1 })
      cacheStats.hits++
      return row.output
    }
  } catch (err) {
    console.warn('[aiResponseCache] dexie lookup error:', err)
    cacheStats.misses++
    return null
  }

  try {
    const db = await getDb()
    const candidates = await db.aiResponseCache
      .where('[provider+model+temperature+feature]')
      .equals([provider, model, temperature, feature])
      .toArray()

    if (candidates.length > 0) {
      const promptEmbedding = await getEmbedding(prompt)
      if (promptEmbedding) {
        for (const candidate of candidates) {
          if (candidate.embedding) {
            const similarity = computeCosineSimilarity(promptEmbedding, candidate.embedding)
            if (similarity >= SEMANTIC_THRESHOLD) {
              ensureInMemorySize()
              inMemoryCache.set(hash, {
                output: candidate.output,
                createdAt: candidate.createdAt,
                accessCount: 1
              })
              cacheStats.semanticHits++
              return candidate.output
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[aiResponseCache] semantic lookup error:', err)
  }

  cacheStats.misses++
  return null
}

export async function store(provider, model, temperature, feature, systemPrompt, prompt, output) {
  if (!isCacheable(feature) || !output) return

  const key = computeCanonicalKey(provider, model, temperature, feature, systemPrompt, prompt)
  const hash = await generateHash(key)
  const createdAt = new Date().toISOString()

  ensureInMemorySize()
  inMemoryCache.set(hash, { output, createdAt, accessCount: 1 })

  storeToDexie(hash, output, provider, model, temperature, feature, createdAt, prompt).catch(
    () => {}
  )
}

async function storeToDexie(
  hash,
  output,
  provider,
  model,
  temperature,
  feature,
  createdAt,
  prompt
) {
  try {
    const db = await getDb()

    const existing = await db.aiResponseCache.get(hash)
    if (existing) return

    let embedding = null
    try {
      embedding = await getEmbedding(prompt)
    } catch {
      // Non-critical — store without embedding
    }

    await db.aiResponseCache.add({
      hash,
      output,
      provider,
      model,
      temperature,
      feature,
      embedding,
      createdAt
    })

    evictDexieEntries().catch(() => {})
  } catch (err) {
    console.warn('[aiResponseCache] dexie store error:', err)
  }
}

export function clearInMemoryCache() {
  inMemoryCache.clear()
}

export function getInMemoryCacheSize() {
  return inMemoryCache.size
}
