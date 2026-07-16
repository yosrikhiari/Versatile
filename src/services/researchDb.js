import { db } from './db-core'

const PENDING = 'PENDING'
const PROCESSING = 'PROCESSING'
const READY = 'READY'
const FAILED = 'FAILED'
const STALE = 'STALE'

// In-memory cache of each project's chunks. Retrieval (searchLexical /
// semanticSearch) runs once per scene during generation and previously reloaded
// + deserialized every chunk (full text + 768-float embedding) from IndexedDB
// on every call — the dominant retrieval cost. A single global version counter,
// bumped by every researchChunks mutation, transparently invalidates all cached
// projects, so a stale read is impossible as long as writes go through this
// module (they all do).
let chunkCacheVersion = 0
const chunkCache = new Map() // projectId -> { version, chunks }
const CHUNK_SCALE_WARN_AT = 1500
const warnedScaleProjects = new Set()

// The cache was unbounded: every project ever searched stayed resident for the
// page's lifetime. On a machine running the model locally, browser RAM is taken
// directly from the model's KV cache, so this is not housekeeping — it is
// context. Map iterates in insertion order, so evicting the first key is LRU
// enough for a handful of projects.
const MAX_CACHED_PROJECTS = 3

function invalidateChunkCache() {
  chunkCacheVersion++
}

const warnedDimProjects = new Set()
function warnDimMismatch(projectId, mismatched, total, queryDim) {
  if (warnedDimProjects.has(projectId)) return
  warnedDimProjects.add(projectId)
  console.warn(
    `[researchDb] project ${projectId}: ${mismatched}/${total} chunks were skipped because ` +
      `their embedding dimension does not match the query's (${queryDim}). The corpus was ` +
      `likely embedded with a different model — re-index it, or semantic search will keep ` +
      `silently missing those chunks.`
  )
}

/**
 * Unit-length Float32Array, or null.
 *
 * Two problems solved at once. (1) Vectors arrive from Ollama as JSON.parse
 * output — plain JS arrays at 8 bytes per element — and the codebase was
 * inconsistent about it: getBulkCachedEmbeddings returned Float32Array while
 * setEmbeddingCacheEntry wrote Array.from() back to float64. Float32Array halves
 * the resident cost. (2) cosineSimilarity recomputed BOTH magnitudes for every
 * chunk on every query; pre-normalising means the query reduces to a plain dot
 * product, which is ~3x less arithmetic per chunk.
 *
 * Normalising HERE — at the cache boundary rather than on write — means no
 * stored-format migration and no risk to the raw-vector paths
 * (getAllChunksForProject, getDocumentChunkEmbeddings) which still use the full
 * cosineSimilarity below.
 */
function toNormalizedF32(embedding) {
  if (!embedding || !embedding.length) return null
  const len = embedding.length
  let mag = 0
  for (let i = 0; i < len; i++) mag += embedding[i] * embedding[i]
  mag = Math.sqrt(mag)
  if (mag === 0) return null
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) out[i] = embedding[i] / mag
  return out
}

async function getCachedProjectChunks(projectId) {
  const cached = chunkCache.get(projectId)
  if (cached && cached.version === chunkCacheVersion) return cached.chunks
  const chunks = await db.researchChunks.where({ projectId }).toArray()

  // Replace the float64 arrays in place so the originals become garbage rather
  // than being retained alongside the converted copies.
  for (const c of chunks) {
    if (c.embedding) c.embedding = toNormalizedF32(c.embedding)
  }

  if (chunkCache.size >= MAX_CACHED_PROJECTS && !chunkCache.has(projectId)) {
    const oldest = chunkCache.keys().next().value
    chunkCache.delete(oldest)
  }
  chunkCache.set(projectId, { version: chunkCacheVersion, chunks })

  if (chunks.length > CHUNK_SCALE_WARN_AT && !warnedScaleProjects.has(projectId)) {
    warnedScaleProjects.add(projectId)
    console.warn(
      `[researchDb] project ${projectId} has ${chunks.length} chunks; brute-force ` +
        `main-thread retrieval will start to lag past ~${CHUNK_SCALE_WARN_AT}. ` +
        `Consider an ANN index / worker-offloaded search at this scale.`
    )
  }
  return chunks
}

export function getStatuses() {
  return { PENDING, PROCESSING, READY, FAILED, STALE }
}

export async function getAllResearchDocuments(projectId) {
  return db.researchDocuments.where({ projectId }).reverse().sortBy('importedAt')
}

export async function getResearchDocument(id) {
  return db.researchDocuments.get(id)
}

export async function addResearchDocument(doc) {
  return db.researchDocuments.add(doc)
}

export async function deleteResearchDocument(id) {
  await db.researchChunks.where({ documentId: id }).delete()
  invalidateChunkCache()
  return db.researchDocuments.delete(id)
}

export async function getChunksForDocument(documentId) {
  return db.researchChunks.where({ documentId }).sortBy('chunkIndex')
}

export async function getAllChunksForProject(projectId) {
  return db.researchChunks.where({ projectId }).toArray()
}

export async function addResearchChunks(chunks) {
  const withStatus = chunks.map((c) => ({ ...c, embeddingStatus: c.embeddingStatus || PENDING }))
  const BATCH = 500
  const allIds = []
  const committedIds = []
  try {
    for (let i = 0; i < withStatus.length; i += BATCH) {
      const batch = withStatus.slice(i, i + BATCH)
      const ids = await db.researchChunks.bulkAdd(batch, null, { allKeys: true })
      allIds.push(...ids)
      committedIds.push(...ids)
      if (i + BATCH < withStatus.length) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    invalidateChunkCache()
    return allIds
  } catch (err) {
    if (committedIds.length > 0) {
      try {
        await db.researchChunks.bulkDelete(committedIds)
        invalidateChunkCache()
      } catch (rollbackErr) {
        throw new Error(
          `addResearchChunks failed after committing ${committedIds.length} chunks. ` +
            `Rollback also failed: ${rollbackErr.message}. ` +
            `Original error: ${err.message}`
        )
      }
    }
    throw new Error(
      `addResearchChunks failed after ${committedIds.length} of ${withStatus.length} chunks committed (rolled back): ${err.message}`
    )
  }
}

export async function updateChunkEmbeddings(updates, meta = {}) {
  const now = Date.now()
  const { provider, model, version } = meta
  await db.transaction('rw', db.researchChunks, async () => {
    for (const { id, embedding } of updates) {
      await db.researchChunks.update(id, {
        embedding,
        embeddingProvider: provider || null,
        embeddingModel: model || null,
        embeddingVersion: version || null,
        embeddedAt: now,
        embeddingStatus: READY
      })
    }
  })
  invalidateChunkCache()
}

export async function markProcessing(ids) {
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: PROCESSING })
    }
  })
  invalidateChunkCache()
}

export async function markFailed(ids) {
  await Promise.all(ids.map((id) => db.researchChunks.update(id, { embeddingStatus: FAILED })))
  invalidateChunkCache()
}

export async function markStale(projectId, currentProvider, currentModel, currentVersion) {
  const chunks = await db.researchChunks
    .where({ projectId })
    .filter(
      (c) =>
        c.embeddingStatus === READY &&
        (c.embeddingProvider !== currentProvider ||
          c.embeddingModel !== currentModel ||
          c.embeddingVersion !== currentVersion)
    )
    .toArray()
  if (chunks.length === 0) return 0
  const ids = chunks.map((c) => c.id)
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: STALE })
    }
  })
  invalidateChunkCache()
  return ids.length
}

export async function countByStatus(projectId) {
  const all = await db.researchChunks.where({ projectId }).toArray()
  return {
    total: all.length,
    PENDING: all.filter((c) => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter((c) => c.embeddingStatus === PROCESSING).length,
    READY: all.filter((c) => c.embeddingStatus === READY).length,
    FAILED: all.filter((c) => c.embeddingStatus === FAILED).length,
    STALE: all.filter((c) => c.embeddingStatus === STALE).length,
    unset: all.filter((c) => !c.embeddingStatus).length
  }
}

export async function deleteChunksForDocument(documentId) {
  const n = await db.researchChunks.where({ documentId }).delete()
  invalidateChunkCache()
  return n
}

export async function updateChunkEmbedding(chunkId, embedding) {
  const r = await db.researchChunks.update(chunkId, { embedding })
  invalidateChunkCache()
  return r
}

export async function getDocumentChunkEmbeddings(documentId) {
  const chunks = await db.researchChunks
    .where({ documentId })
    .filter((c) => c.embedding && c.embeddingStatus === READY)
    .toArray()
  return chunks.map((c) => c.embedding)
}

export async function setDocumentEmbedding(documentId, embedding) {
  return db.researchDocuments.update(documentId, {
    embedding,
    embeddingComputedAt: Date.now()
  })
}

export async function getUnindexedChunks(projectId) {
  return db.researchChunks
    .where({ projectId })
    .filter((c) => {
      if (c.embeddingStatus === READY) return false
      if (!c.embeddingStatus && c.embedding) return false
      return true
    })
    .toArray()
}

export async function getDocumentStatusCounts(documentId) {
  const all = await db.researchChunks.where({ documentId }).toArray()
  return {
    total: all.length,
    PENDING: all.filter((c) => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter((c) => c.embeddingStatus === PROCESSING).length,
    READY: all.filter((c) => c.embeddingStatus === READY).length,
    FAILED: all.filter((c) => c.embeddingStatus === FAILED).length,
    STALE: all.filter((c) => c.embeddingStatus === STALE).length
  }
}

export async function searchLexical(projectId, query, limit = 20) {
  const qTokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1)
  if (qTokens.length === 0) return []

  const allChunks = await getCachedProjectChunks(projectId)
  const N = allChunks.length
  if (N === 0) return []

  // Compile once per query, not once per (chunk x token) — this was building a
  // fresh RegExp inside the per-chunk map. The 'i' flag also removes the need to
  // lowercase each chunk's full text, which was allocating a complete copy of
  // the corpus (tokens+1) times per query: ~22MB of garbage on a 1500-chunk
  // project, on the main thread, once per scene.
  const matchers = qTokens.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))
  const T = matchers.length

  // One sweep for term AND document frequencies. tf was previously computed
  // twice — once via includes() to derive df, then again via match() to score.
  const df = new Array(T).fill(0)
  const tfs = new Array(N)
  for (let i = 0; i < N; i++) {
    const text = allChunks[i].text || ''
    const row = new Array(T)
    for (let t = 0; t < T; t++) {
      const re = matchers[t]
      re.lastIndex = 0
      let count = 0
      // exec-loop rather than match(): counts without materialising an array of
      // every match. Tokens are length > 1, so a zero-width match is impossible
      // and this cannot spin.
      while (re.exec(text) !== null) count++
      row[t] = count
      if (count > 0) df[t]++
    }
    tfs[i] = row
  }

  // Only the survivors get spread — the old code cloned every chunk in the
  // project, then filtered.
  const scored = []
  for (let i = 0; i < N; i++) {
    let score = 0
    for (let t = 0; t < T; t++) {
      const tf = tfs[i][t]
      if (tf === 0) continue
      const idf = Math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1)
      score += (1 + Math.log(tf)) * idf
    }
    if (score > 0) scored.push({ ...allChunks[i], _score: score })
  }

  return scored.sort((a, b) => b._score - a._score).slice(0, limit)
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0,
    magA = 0,
    magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export async function semanticSearch(projectId, queryEmbedding, limit = 20) {
  if (!queryEmbedding) return []
  const allChunks = await getCachedProjectChunks(projectId)

  // Chunks come out of the cache already unit-length, so normalising the query
  // once reduces every comparison to a dot product: the magnitude of both
  // vectors no longer has to be recomputed for each of the N chunks.
  const q = toNormalizedF32(queryEmbedding)
  if (!q) return []

  const scored = []
  let dimMismatches = 0
  for (const c of allChunks) {
    const v = c.embedding
    if (!v) continue
    if (v.length !== q.length) {
      dimMismatches++
      continue
    }
    let dot = 0
    for (let i = 0; i < v.length; i++) dot += v[i] * q[i]
    if (dot > 0.1) scored.push({ ...c, _score: dot })
  }

  // A dimension mismatch means the corpus was embedded with a different model
  // (nomic-embed-text is 768, mistral-embed is 1024). The old code fell through
  // cosineSimilarity's length guard and scored 0, so switching embedding
  // provider silently produced zero recall instead of an error. Say so.
  if (dimMismatches > 0) {
    warnDimMismatch(projectId, dimMismatches, allChunks.length, q.length)
  }
  return scored.sort((a, b) => b._score - a._score).slice(0, limit)
}

export async function getEmbeddingCacheEntry(hash) {
  return db.embeddingCache.get(hash)
}

export async function setEmbeddingCacheEntry(hash, embedding) {
  await db.embeddingCache.put({
    hash,
    // Float32Array, not Array.from(): IndexedDB's structured clone stores typed
    // arrays natively at half the bytes. This previously converted BACK to
    // float64 on write while getBulkCachedEmbeddings read it out as
    // Float32Array — the two disagreed. Reads stay backward compatible because
    // `new Float32Array(x)` accepts both a plain array and a Float32Array.
    embedding: embedding instanceof Float32Array ? embedding : new Float32Array(embedding),
    createdAt: Date.now()
  })
}

export async function getBulkCachedEmbeddings(hashes) {
  if (!hashes.length) return new Map()
  const entries = await db.embeddingCache.bulkGet(hashes)
  const map = new Map()
  for (let i = 0; i < hashes.length; i++) {
    if (entries[i]) {
      map.set(hashes[i], new Float32Array(entries[i].embedding))
    }
  }
  return map
}

/**
 * Trim the persistent embedding cache to its most recent `maxEntries`.
 *
 * Had zero callers, so the table grew for the life of the install. Now invoked
 * once per app start from useAppInitialization.
 *
 * @returns {Promise<number>} how many entries were deleted
 */
export async function pruneEmbeddingCache(maxEntries = 20000) {
  const count = await db.embeddingCache.count()
  if (count <= maxEntries) return 0
  const toPrune = await db.embeddingCache
    .orderBy('createdAt')
    .limit(count - maxEntries)
    .toArray()
  const keys = toPrune.map((e) => e.hash)
  if (!keys.length) return 0
  await db.embeddingCache.bulkDelete(keys)
  return keys.length
}

export async function resetChunksStatus(documentId, fromStatus) {
  const chunks = await db.researchChunks
    .where({ documentId })
    .filter((c) => c.embeddingStatus === fromStatus)
    .toArray()
  if (chunks.length === 0) return []
  const ids = chunks.map((c) => c.id)
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: PENDING })
    }
  })
  invalidateChunkCache()
  return chunks.map((c) => ({ id: c.id, text: c.text }))
}
