import { db as _db } from './db-core'
import { VectorIndex } from './vectorIndex'

const db = _db as any

const PENDING = 'PENDING'
const PROCESSING = 'PROCESSING'
const READY = 'READY'
const FAILED = 'FAILED'
const STALE = 'STALE'

let chunkCacheVersion = 0
const chunkCache = new Map()
const CHUNK_SCALE_WARN_AT = 1500
const warnedScaleProjects = new Set()
const MAX_CACHED_PROJECTS = 3

// Vector index cache for each project
const vectorIndexCache = new Map<string, { index: any; version: number; dim: number }>()
const VECTOR_INDEX_VERSION = 1

function invalidateChunkCache() {
  chunkCacheVersion++
  vectorIndexCache.clear()
}

const warnedDimProjects = new Set()
function warnDimMismatch(projectId: any, mismatched: any, total: any, queryDim: any) {
  if (warnedDimProjects.has(projectId)) return
  warnedDimProjects.add(projectId)
  console.warn(
    `[researchDb] project ${projectId}: ${mismatched}/${total} chunks were skipped because ` +
      `their embedding dimension does not match the query's (${queryDim}). The corpus was ` +
      `likely embedded with a different model — re-index it, or semantic search will keep ` +
      `silently missing those chunks.`
  )
}

function toNormalizedF32(embedding: any) {
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

async function getCachedProjectChunks(projectId: any) {
  const cached = chunkCache.get(projectId)
  if (cached && cached.version === chunkCacheVersion) return cached.chunks
  const chunks = await db.researchChunks.where({ projectId }).toArray()

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

export async function getAllResearchDocuments(projectId: any) {
  return db.researchDocuments.where({ projectId }).reverse().sortBy('importedAt')
}

export async function getResearchDocument(id: any) {
  return db.researchDocuments.get(id)
}

export async function addResearchDocument(doc: any) {
  return db.researchDocuments.add(doc)
}

export async function deleteResearchDocument(id: any) {
  await db.researchChunks.where({ documentId: id }).delete()
  invalidateChunkCache()
  return db.researchDocuments.delete(id)
}

export async function getChunksForDocument(documentId: any) {
  return db.researchChunks.where({ documentId }).sortBy('chunkIndex')
}

export async function getAllChunksForProject(projectId: any) {
  return db.researchChunks.where({ projectId }).toArray()
}

export async function addResearchChunks(chunks: any) {
  const withStatus = chunks.map((c: any) => ({ ...c, embeddingStatus: c.embeddingStatus || PENDING }))
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
  } catch (err: unknown) {
    if (committedIds.length > 0) {
      try {
        await db.researchChunks.bulkDelete(committedIds)
        invalidateChunkCache()
      } catch (rollbackErr: unknown) {
        const re = rollbackErr as any
        const oe = err as any
        throw new Error(
          `addResearchChunks failed after committing ${committedIds.length} chunks. ` +
            `Rollback also failed: ${re.message}. ` +
            `Original error: ${oe.message}`
        )
      }
    }
    const e = err as any
    throw new Error(
      `addResearchChunks failed after ${committedIds.length} of ${withStatus.length} chunks committed (rolled back): ${e.message}`
    )
  }
}

export async function updateChunkEmbeddings(updates: any, meta: any = {}) {
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

export async function markProcessing(ids: any) {
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: PROCESSING })
    }
  })
  invalidateChunkCache()
}

export async function markFailed(ids: any) {
  await Promise.all(ids.map((id: any) => db.researchChunks.update(id, { embeddingStatus: FAILED })))
  invalidateChunkCache()
}

export async function markStale(projectId: any, currentProvider: any, currentModel: any, currentVersion: any) {
  const chunks = await db.researchChunks
    .where({ projectId })
    .filter(
      (c: any) =>
        c.embeddingStatus === READY &&
        (c.embeddingProvider !== currentProvider ||
          c.embeddingModel !== currentModel ||
          c.embeddingVersion !== currentVersion)
    )
    .toArray()
  if (chunks.length === 0) return 0
  const ids = chunks.map((c: any) => c.id)
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: STALE })
    }
  })
  invalidateChunkCache()
  return ids.length
}

export async function countByStatus(projectId: any) {
  const all = await db.researchChunks.where({ projectId }).toArray()
  return {
    total: all.length,
    PENDING: all.filter((c: any) => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter((c: any) => c.embeddingStatus === PROCESSING).length,
    READY: all.filter((c: any) => c.embeddingStatus === READY).length,
    FAILED: all.filter((c: any) => c.embeddingStatus === FAILED).length,
    STALE: all.filter((c: any) => c.embeddingStatus === STALE).length,
    unset: all.filter((c: any) => !c.embeddingStatus).length
  }
}

export async function deleteChunksForDocument(documentId: any) {
  const n = await db.researchChunks.where({ documentId }).delete()
  invalidateChunkCache()
  return n
}

export async function updateChunkEmbedding(chunkId: any, embedding: any) {
  const r = await db.researchChunks.update(chunkId, { embedding })
  invalidateChunkCache()
  return r
}

export async function getDocumentChunkEmbeddings(documentId: any) {
  const chunks = await db.researchChunks
    .where({ documentId })
    .filter((c: any) => c.embedding && c.embeddingStatus === READY)
    .toArray()
  return chunks.map((c: any) => c.embedding)
}

export async function setDocumentEmbedding(documentId: any, embedding: any) {
  return db.researchDocuments.update(documentId, {
    embedding,
    embeddingComputedAt: Date.now()
  })
}

export async function getUnindexedChunks(projectId: any) {
  return db.researchChunks
    .where({ projectId })
    .filter((c: any) => {
      if (c.embeddingStatus === READY) return false
      if (!c.embeddingStatus && c.embedding) return false
      return true
    })
    .toArray()
}

export async function getDocumentStatusCounts(documentId: any) {
  const all = await db.researchChunks.where({ documentId }).toArray()
  return {
    total: all.length,
    PENDING: all.filter((c: any) => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter((c: any) => c.embeddingStatus === PROCESSING).length,
    READY: all.filter((c: any) => c.embeddingStatus === READY).length,
    FAILED: all.filter((c: any) => c.embeddingStatus === FAILED).length,
    STALE: all.filter((c: any) => c.embeddingStatus === STALE).length
  }
}

export async function searchLexical(projectId: any, query: any, limit = 20) {
  const qTokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t: any) => t.length > 1)
  if (qTokens.length === 0) return []

  const allChunks = await getCachedProjectChunks(projectId)
  const N = allChunks.length
  if (N === 0) return []

  const matchers = qTokens.map((t: any) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))
  const T = matchers.length

  const df = new Array(T).fill(0)
  const tfs = new Array(N)
  for (let i = 0; i < N; i++) {
    const text = allChunks[i].text || ''
    const row = new Array(T)
    for (let t = 0; t < T; t++) {
      const re = matchers[t]
      re.lastIndex = 0
      let count = 0
      while (re.exec(text) !== null) count++
      row[t] = count
      if (count > 0) df[t]++
    }
    tfs[i] = row
  }

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

export function cosineSimilarity(a: any, b: any) {
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

export async function semanticSearch(projectId: any, queryEmbedding: any, limit = 20) {
  if (!queryEmbedding) return []
  const allChunks = await getCachedProjectChunks(projectId)

  const q = toNormalizedF32(queryEmbedding)
  if (!q) return []

  // Check for dimension mismatches and warn (before vector index optimization)
  let dimMismatches = 0
  for (const c of allChunks) {
    const v = c.embedding
    if (!v) continue
    if (v.length !== q.length) {
      dimMismatches++
    }
  }
  if (dimMismatches > 0) {
    warnDimMismatch(projectId, dimMismatches, allChunks.length, q.length)
  }

  // Try to use vector index for faster search
  const indexData = await getOrBuildVectorIndex(projectId, allChunks, q.length)
  if (indexData?.index) {
    try {
      const results = await indexData.index.search(q, limit)
      return results.map((r: any) => ({
        id: r.id,
        _score: r.score,
        ...r.metadata
      })).filter((r: any) => r._score > 0.1)
    } catch (e) {
      console.warn('[researchDb] Vector index search failed, falling back to brute-force:', e)
    }
  }

  // Fallback: brute-force
  const scored = []
  for (const c of allChunks) {
    const v = c.embedding
    if (!v) continue
    if (v.length !== q.length) {
      continue
    }
    let dot = 0
    for (let i = 0; i < v.length; i++) dot += v[i] * q[i]
    if (dot > 0.1) scored.push({ ...c, _score: dot })
  }

  return scored.sort((a, b) => b._score - a._score).slice(0, limit)
}

async function getOrBuildVectorIndex(projectId: any, chunks: any[], queryDim: number) {
  const cached = vectorIndexCache.get(projectId)
  if (!queryDim) return { index: null, version: 0, dim: 0 }

  if (cached && cached.version === VECTOR_INDEX_VERSION && cached.dim === queryDim) {
    return cached
  }

  // Build new index using queryDim to filter chunks
  const items = chunks
    .filter(c => c.embedding && c.embedding.length === queryDim)
    .map(c => ({
      id: c.id,
      vector: toNormalizedF32(c.embedding)!,
      metadata: {
        documentId: c.documentId,
        chunkIndex: c.chunkIndex,
        text: c.text
      }
    }))

  if (items.length === 0) return { index: null, version: 0, dim: 0 }

  const { VectorIndex } = await import('./vectorIndex')
  const index = new VectorIndex({ dim: queryDim, nClusters: Math.max(1, Math.floor(Math.sqrt(items.length))) })
  await index.build(items)

  const entry = { index, version: VECTOR_INDEX_VERSION, dim: queryDim }
  vectorIndexCache.set(projectId, entry)
  return entry
}

export async function getEmbeddingCacheEntry(hash: any) {
  return db.embeddingCache.get(hash)
}

export async function setEmbeddingCacheEntry(hash: any, embedding: any) {
  await db.embeddingCache.put({
    hash,
    embedding: embedding instanceof Float32Array ? embedding : new Float32Array(embedding),
    createdAt: Date.now()
  })
}

export async function getBulkCachedEmbeddings(hashes: any) {
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

export async function pruneEmbeddingCache(maxEntries = 20000) {
  const count = await db.embeddingCache.count()
  if (count <= maxEntries) return 0
  const toPrune = await db.embeddingCache
    .orderBy('createdAt')
    .limit(count - maxEntries)
    .toArray()
  const keys = toPrune.map((e: any) => e.hash)
  if (!keys.length) return 0
  await db.embeddingCache.bulkDelete(keys)
  return keys.length
}

export async function resetChunksStatus(documentId: any, fromStatus: any) {
  const chunks = await db.researchChunks
    .where({ documentId })
    .filter((c: any) => c.embeddingStatus === fromStatus)
    .toArray()
  if (chunks.length === 0) return []
  const ids = chunks.map((c: any) => c.id)
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: PENDING })
    }
  })
  invalidateChunkCache()
  return chunks.map((c: any) => ({ id: c.id, text: c.text }))
}
