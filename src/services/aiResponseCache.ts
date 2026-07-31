import { getEmbedding } from './embeddingService'

const IN_MEMORY_MAX = 1000
const DEXIE_MAX = 10000
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const SEMANTIC_THRESHOLD = 0.95

/** How many of the closest candidates are considered before giving up. */
const SEMANTIC_TOP_K = 5

/**
 * Minimum recorded quality (0–10) for a semantically-matched entry to be served.
 *
 * Entries with no recorded score are still served — unknown is not the same as
 * bad, and most entries are never evaluated. Only a response the critic actually
 * scored below this is withheld.
 */
const MIN_CACHED_QUALITY = 6

/** Bound on the served-output → hash map used for quality attribution. */
const SERVED_MAX = 500

const inMemoryCache = new Map<string, { output: unknown; createdAt: string; accessCount: number }>()

/**
 * Maps a served response back to the cache entry that produced it, so a later
 * eval score can be attributed without threading a cache id through every
 * generation call. Keyed by a digest of the output text.
 */
const servedByOutput = new Map<string, string>()

export const cacheStats = {
  hits: 0,
  misses: 0,
  semanticHits: 0,
  /** Semantic matches that cleared the similarity threshold but failed the quality gate. */
  semanticRejectedByQuality: 0,
  qualityRecorded: 0
}

export function getCacheStats() {
  return { ...cacheStats }
}

export function resetCacheStats() {
  cacheStats.hits = 0
  cacheStats.misses = 0
  cacheStats.semanticHits = 0
  cacheStats.semanticRejectedByQuality = 0
  cacheStats.qualityRecorded = 0
}

/** FNV-1a over the output's string form. Bounded, stable, non-cryptographic. */
function outputKey(output: unknown): string {
  const text = typeof output === 'string' ? output : JSON.stringify(output) ?? ''
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function noteServed(output: unknown, hash: string): void {
  if (servedByOutput.size >= SERVED_MAX) {
    const oldest = [...servedByOutput.keys()].slice(0, Math.floor(SERVED_MAX / 2))
    for (const k of oldest) servedByOutput.delete(k)
  }
  servedByOutput.set(outputKey(output), hash)
}

/**
 * Attribute a downstream eval score to whichever cache entry produced `output`.
 *
 * A response that the critic scored badly stops being served as a semantic
 * match, so a single poor generation cannot keep being handed out to
 * near-identical prompts. No-ops when the output did not come from the cache.
 */
export async function recordQualityForOutput(output: unknown, score: number): Promise<boolean> {
  if (typeof score !== 'number' || Number.isNaN(score)) return false

  const hash = servedByOutput.get(outputKey(output))
  if (!hash) return false

  try {
    const db = await getDb()
    const existing = await db.aiResponseCache.get(hash)
    if (!existing) return false

    // Keep the worst score seen: one good eval should not clear a known-bad entry.
    const qualityScore =
      typeof existing.qualityScore === 'number'
        ? Math.min(existing.qualityScore, score)
        : score

    await db.aiResponseCache.update(hash, { qualityScore })
    cacheStats.qualityRecorded++
    return true
  } catch (err) {
    console.warn('[aiResponseCache] quality attribution error:', err)
    return false
  }
}

export function computeCosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>) {
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

function computeCanonicalKey(provider: string, model: string, temperature: number | undefined, feature: string, systemPrompt: string, prompt: string) {
  return { provider, model, temperature, feature, systemPrompt, prompt }
}

async function generateHash(key: Record<string, unknown>) {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(key))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

let _db: any = null
async function getDb() {
  if (!_db) {
    _db = (await import('./db-core')).db
  }
  return _db
}

function isCacheable(feature: string) {
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
      const ids = oldest.map((e: { hash: string }) => e.hash)
      await table.bulkDelete(ids)
    }
  } catch (err) {
    console.warn('[aiResponseCache] eviction error:', err)
  }
}

export async function lookup(provider: string, model: string, temperature: number | undefined, feature: string, systemPrompt: string, prompt: string) {
  if (!isCacheable(feature)) {
    cacheStats.misses++
    return null
  }

  const key = computeCanonicalKey(provider, model, temperature, feature, systemPrompt, prompt)
  const hash = await generateHash(key)

  lastLookupMeta = null

  const memEntry = inMemoryCache.get(hash)
  if (memEntry) {
    memEntry.accessCount++
    cacheStats.hits++
    noteServed(memEntry.output, hash)
    lastLookupMeta = { source: 'exact', hash, similarity: 1 }
    return memEntry.output
  }

  try {
    const db = await getDb()
    const row = await db.aiResponseCache.get(hash)
    if (row) {
      ensureInMemorySize()
      inMemoryCache.set(hash, { output: row.output, createdAt: row.createdAt, accessCount: 1 })
      cacheStats.hits++
      noteServed(row.output, hash)
      lastLookupMeta = { source: 'exact', hash, similarity: 1 }
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
        // Rank by similarity rather than returning the first entry over the
        // threshold. Dexie returns candidates in insertion order, so the old
        // first-match scan could serve a 0.951 match while a 0.999 one sat
        // further down the same list.
        const ranked = candidates
          .filter((c: { embedding?: ArrayLike<number> }) => c.embedding)
          .map((c: { embedding: ArrayLike<number> }) => ({
            candidate: c,
            similarity: computeCosineSimilarity(promptEmbedding, c.embedding)
          }))
          .filter((r: { similarity: number }) => r.similarity >= SEMANTIC_THRESHOLD)
          .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
          .slice(0, SEMANTIC_TOP_K)

        for (const { candidate, similarity } of ranked) {
          if (
            typeof candidate.qualityScore === 'number' &&
            candidate.qualityScore < MIN_CACHED_QUALITY
          ) {
            // Close enough to reuse, but the critic scored this response badly.
            // Fall through to the next candidate rather than serving it again.
            cacheStats.semanticRejectedByQuality++
            continue
          }

          ensureInMemorySize()
          inMemoryCache.set(hash, {
            output: candidate.output,
            createdAt: candidate.createdAt,
            accessCount: 1
          })
          noteServed(candidate.output, candidate.hash)
          cacheStats.semanticHits++
          lastLookupMeta = { source: 'semantic', hash: candidate.hash, similarity }
          return candidate.output
        }
      }
    }
  } catch (err) {
    console.warn('[aiResponseCache] semantic lookup error:', err)
  }

  cacheStats.misses++
  return null
}

/** Provenance of the most recent successful `lookup`. */
let lastLookupMeta: { source: 'exact' | 'semantic'; hash: string; similarity: number } | null = null

export function getLastLookupMeta() {
  return lastLookupMeta
}

export async function store(provider: string, model: string, temperature: number | undefined, feature: string, systemPrompt: string, prompt: string, output: unknown) {
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
  hash: string,
  output: unknown,
  provider: string,
  model: string,
  temperature: number | undefined,
  feature: string,
  createdAt: string,
  prompt: string
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
  servedByOutput.clear()
  lastLookupMeta = null
}

export function getInMemoryCacheSize() {
  return inMemoryCache.size
}
